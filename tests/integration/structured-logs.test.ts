import { describe, expect, it } from "vitest";

import {
  createWorkerMessageLogContext,
  sanitizeWorkerLogPayload,
} from "@/worker/order-consumer.js";

describe("structured logs", () => {
  it("creates worker log context with correlationId, orderId, attemptNumber and eventId", () => {
    expect(
      createWorkerMessageLogContext({
        version: 1,
        eventId: "00000000-0000-4000-8000-000000000001",
        orderId: "00000000-0000-4000-8000-000000000002",
        requestId: "00000000-0000-4000-8000-000000000003",
        correlationId: "00000000-0000-4000-8000-000000000004",
        attemptNumber: 2,
        occurredAt: "2026-07-27T00:00:00.000Z",
      }),
    ).toEqual({
      correlationId: "00000000-0000-4000-8000-000000000004",
      orderId: "00000000-0000-4000-8000-000000000002",
      attemptNumber: 2,
      eventId: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("does not expose checkout payload fields in worker log payload", () => {
    expect(
      sanitizeWorkerLogPayload({
        correlationId: "corr",
        orderId: "order",
        items: [{ productId: "secret-product", quantity: 1 }],
        idempotencyKey: "secret-key",
      }),
    ).toEqual({
      correlationId: "corr",
      orderId: "order",
    });
  });
});
