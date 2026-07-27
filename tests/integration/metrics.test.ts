import { describe, expect, it } from "vitest";

import { OutboxPublisher } from "@/worker/outbox-publisher.js";
import { OrderConsumer } from "@/worker/order-consumer.js";
import { createWorkerMetricsRegistry } from "@/observability/metrics.js";
import { SequenceUuidGenerator } from "@tests/helpers/runtime.js";

const message = {
  version: 1,
  eventId: "00000000-0000-4000-8000-000000000001",
  orderId: "00000000-0000-4000-8000-000000000002",
  requestId: "00000000-0000-4000-8000-000000000003",
  correlationId: "00000000-0000-4000-8000-000000000004",
  attemptNumber: 1,
  occurredAt: "2026-07-27T00:00:00.000Z",
} as const;

describe("operational metrics", () => {
  it("records outbox publish and message processing metrics", async () => {
    const metrics = createWorkerMetricsRegistry();
    const publisher = new OutboxPublisher({
      metrics: metrics.worker,
      clock: { now: () => new Date("2026-07-27T00:00:00.000Z") },
      uuidGenerator: new SequenceUuidGenerator(),
      batchSize: 10,
      leaseMs: 30_000,
      repository: {
        claimOutboxEvents: () =>
          Promise.resolve([{ id: message.eventId, lockToken: "lock-token", payload: message }]),
        markOutboxPublished: () => Promise.resolve(true),
      },
      publisher: { publish: () => Promise.resolve() },
    });

    await publisher.runOnce();

    const body = await metrics.metrics();
    expect(body).toContain("casecellshop_worker_outbox_published_total 1");
  });

  it("records ERP outcomes and retry scheduling metrics without high-cardinality labels", async () => {
    const metrics = createWorkerMetricsRegistry();
    const consumer = new OrderConsumer({
      metrics: metrics.worker,
      repository: {
        claimOrderAttempt: () =>
          Promise.resolve({
            claimed: true,
            processingToken: "00000000-0000-4000-8000-000000000005",
            deadlineAt: new Date("2026-07-27T00:01:00.000Z"),
          }),
        finishProcessingAttempt: () => Promise.resolve({ applied: true, scheduledRetry: true }),
      },
      erpClient: { processOrder: () => Promise.resolve({ result: "temporarily_unavailable" }) },
    });

    await consumer.handle(message);

    const body = await metrics.metrics();
    expect(body).toContain('casecellshop_worker_messages_processed_total{result="ack"} 1');
    expect(body).toContain(
      'casecellshop_worker_erp_outcomes_total{result="temporarily_unavailable"} 1',
    );
    expect(body).toContain("casecellshop_worker_retries_scheduled_total 1");
    expect(body).not.toContain(message.orderId);
    expect(body).not.toContain(message.correlationId);
  });
});
