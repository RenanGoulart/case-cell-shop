import { describe, expect, it } from "vitest";

import { buildApp } from "@/api/app.js";
import { startWorkerMetricsServer } from "@/worker/metrics-server.js";
import { createWorkerMetricsRegistry } from "@/observability/metrics.js";
import { testAppConfig } from "@tests/helpers/app-config.js";

describe("metrics contracts", () => {
  it("returns API Prometheus metrics with text content type", async () => {
    const app = await buildApp(testAppConfig(), {
      products: {
        listProducts: {
          execute: () => Promise.resolve({ status: 204, source: "database", products: [] }),
        },
      },
    });

    const response = await app.inject({ method: "GET", url: "/metrics" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("casecellshop_api_");

    await app.close();
  });

  it("returns worker Prometheus metrics with text content type", async () => {
    const metrics = createWorkerMetricsRegistry();
    const server = await startWorkerMetricsServer({
      host: "127.0.0.1",
      port: 0,
      metrics,
    });

    const response = await fetch(`${server.url}/metrics`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("casecellshop_worker_");

    await server.close();
  });

  it("creates worker operational metric names for async processing", async () => {
    const metrics = createWorkerMetricsRegistry();

    metrics.worker.recordOutboxPublished();
    metrics.worker.recordMessageProcessed("ack");
    metrics.worker.recordErpOutcome("confirmed", 12);
    metrics.worker.recordRetryScheduled();
    metrics.worker.recordReservationRestored(2);

    const body = await metrics.metrics();

    expect(body).toContain("casecellshop_worker_outbox_published_total");
    expect(body).toContain("casecellshop_worker_messages_processed_total");
    expect(body).toContain("casecellshop_worker_erp_attempt_duration_ms");
    expect(body).toContain("casecellshop_worker_retries_scheduled_total");
    expect(body).toContain("casecellshop_worker_reservations_restored_total");
  });
});
