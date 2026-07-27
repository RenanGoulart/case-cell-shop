import { describe, expect, it } from "vitest";

import { OrderConsumer } from "@/worker/order-consumer.js";

describe("order consumer idempotency", () => {
  it("acks duplicate or terminal deliveries without calling ERP", async () => {
    const calls: string[] = [];
    const consumer = new OrderConsumer({
      repository: {
        claimOrderAttempt: () =>
          Promise.resolve({ claimed: false, reason: "duplicate_or_terminal" }),
        finishProcessingAttempt: () => Promise.resolve({ applied: false, reason: "ignored" }),
      },
      erpClient: {
        processOrder: () => {
          calls.push("erp");
          return Promise.resolve({ result: "confirmed" });
        },
      },
    });

    await expect(
      consumer.handle({
        version: 1,
        eventId: "00000000-0000-4000-8000-000000000001",
        orderId: "00000000-0000-4000-8000-000000000002",
        requestId: "00000000-0000-4000-8000-000000000003",
        correlationId: "00000000-0000-4000-8000-000000000004",
        attemptNumber: 1,
        occurredAt: "2026-07-27T00:00:00.000Z",
      }),
    ).resolves.toEqual({ action: "ack", reason: "duplicate_or_terminal" });
    expect(calls).toEqual([]);
  });

  it("claims one attempt, calls ERP and finishes with the processing token", async () => {
    const calls: string[] = [];
    const consumer = new OrderConsumer({
      repository: {
        claimOrderAttempt: () =>
          Promise.resolve({
            claimed: true,
            processingToken: "00000000-0000-4000-8000-000000000005",
            deadlineAt: new Date("2026-07-27T00:01:00.000Z"),
          }),
        finishProcessingAttempt: (input) => {
          calls.push(input.processingToken);
          return Promise.resolve({ applied: true });
        },
      },
      erpClient: { processOrder: () => Promise.resolve({ result: "confirmed" }) },
    });

    await expect(
      consumer.handle({
        version: 1,
        eventId: "00000000-0000-4000-8000-000000000001",
        orderId: "00000000-0000-4000-8000-000000000002",
        requestId: "00000000-0000-4000-8000-000000000003",
        correlationId: "00000000-0000-4000-8000-000000000004",
        attemptNumber: 1,
        occurredAt: "2026-07-27T00:00:00.000Z",
      }),
    ).resolves.toEqual({ action: "ack", reason: "processed" });
    expect(calls).toEqual(["00000000-0000-4000-8000-000000000005"]);
  });
});
