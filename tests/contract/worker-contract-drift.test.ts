import fs from "node:fs";

import { describe, expect, it } from "vitest";

import { createWorkerMetricsRegistry } from "@/observability/metrics.js";
import { startWorkerMetricsServer } from "@/worker/metrics-server.js";
import { orderProcessingMessageJsonSchema } from "@/worker/schemas/order-processing-message.js";

describe("worker contract drift", () => {
  it("keeps the order processing message JSON Schema aligned with the exported schema", () => {
    const contract = JSON.parse(
      fs.readFileSync(
        "specs/001-async-checkout-service/contracts/order-processing-message.schema.json",
        "utf8",
      ),
    ) as unknown;

    expect(contract).toEqual(orderProcessingMessageJsonSchema);
  });

  it("keeps worker metrics behavior aligned with worker-openapi.yaml", async () => {
    const contract = fs.readFileSync(
      "specs/001-async-checkout-service/contracts/worker-openapi.yaml",
      "utf8",
    );
    const metrics = createWorkerMetricsRegistry();
    const server = await startWorkerMetricsServer({
      host: "127.0.0.1",
      port: 0,
      metrics,
    });

    const response = await fetch(server.url + "/metrics", {
      headers: {
        "x-request-id": "00000000-0000-4000-8000-000000000001",
        "x-correlation-id": "00000000-0000-4000-8000-000000000002",
      },
    });

    expect(contract).toContain("/metrics:");
    expect(contract).toContain("text/plain:");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("x-request-id")).toBe("00000000-0000-4000-8000-000000000001");
    expect(response.headers.get("x-correlation-id")).toBe("00000000-0000-4000-8000-000000000002");

    await server.close();
  });
});
