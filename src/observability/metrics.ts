import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

import type { ErpResult } from "../modules/orders/domain/erp-result.js";

export interface MetricsRegistry {
  readonly registry: Registry;
  readonly contentType: string;
  metrics(): Promise<string>;
}

export interface WorkerOperationalMetrics {
  recordOutboxPublished(): void;
  recordOutboxPublishFailed(): void;
  recordMessageProcessed(result: "ack" | "dead_letter" | "nack"): void;
  recordErpOutcome(result: ErpResult, durationMs: number): void;
  recordRetryScheduled(): void;
  recordReservationRestored(count: number): void;
}

export interface WorkerMetricsRegistry extends MetricsRegistry {
  readonly worker: WorkerOperationalMetrics;
}

export function createApiMetricsRegistry(): MetricsRegistry {
  return createMetricsRegistry("casecellshop_api");
}

export function createWorkerMetricsRegistry(): WorkerMetricsRegistry {
  const metrics = createMetricsRegistry("casecellshop_worker");
  const worker = createWorkerOperationalMetrics(metrics.registry);

  return {
    ...metrics,
    worker,
  };
}

function createMetricsRegistry(prefix: string): MetricsRegistry {
  const registry = new Registry();
  collectDefaultMetrics({ prefix: `${prefix}_`, register: registry });

  return {
    registry,
    contentType: registry.contentType,
    metrics: () => registry.metrics(),
  };
}

function createWorkerOperationalMetrics(registry: Registry): WorkerOperationalMetrics {
  const outboxPublished = new Counter({
    name: "casecellshop_worker_outbox_published_total",
    help: "Outbox events published to RabbitMQ",
    registers: [registry],
  });

  const outboxPublishFailures = new Counter({
    name: "casecellshop_worker_outbox_publish_failures_total",
    help: "Outbox publish failures before marking an event as published",
    registers: [registry],
  });

  const messagesProcessed = new Counter({
    name: "casecellshop_worker_messages_processed_total",
    help: "Order processing messages handled by result",
    labelNames: ["result"],
    registers: [registry],
  });

  const erpOutcomes = new Counter({
    name: "casecellshop_worker_erp_outcomes_total",
    help: "ERP simulated outcomes by result",
    labelNames: ["result"],
    registers: [registry],
  });

  const erpAttemptDuration = new Histogram({
    name: "casecellshop_worker_erp_attempt_duration_ms",
    help: "ERP attempt duration in milliseconds",
    labelNames: ["result"],
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 5000, 60_000],
    registers: [registry],
  });

  const retriesScheduled = new Counter({
    name: "casecellshop_worker_retries_scheduled_total",
    help: "Retry attempts scheduled after retryable ERP outcomes",
    registers: [registry],
  });

  const reservationsRestored = new Counter({
    name: "casecellshop_worker_reservations_restored_total",
    help: "Reservation items restored to stock",
    registers: [registry],
  });

  return {
    recordOutboxPublished() {
      outboxPublished.inc();
    },
    recordOutboxPublishFailed() {
      outboxPublishFailures.inc();
    },
    recordMessageProcessed(result) {
      messagesProcessed.labels(result).inc();
    },
    recordErpOutcome(result, durationMs) {
      erpOutcomes.labels(result).inc();
      erpAttemptDuration.labels(result).observe(durationMs);
    },
    recordRetryScheduled() {
      retriesScheduled.inc();
    },
    recordReservationRestored(count) {
      reservationsRestored.inc(count);
    },
  };
}
