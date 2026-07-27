import { describe, expect, it } from "vitest";

import { orderProcessingMessageSchema } from "@/worker/schemas/order-processing-message.js";

describe("order processing outbox message", () => {
  it("accepts the initial checkout outbox payload shape", () => {
    expect(
      orderProcessingMessageSchema.parse({
        version: 1,
        eventId: "00000000-0000-4000-8000-000000000001",
        orderId: "00000000-0000-4000-8000-000000000002",
        requestId: "00000000-0000-4000-8000-000000000003",
        correlationId: "00000000-0000-4000-8000-000000000004",
        attemptNumber: 1,
        occurredAt: "2026-07-27T00:00:00.000Z",
      }),
    ).toMatchObject({ version: 1, attemptNumber: 1 });
  });
});
