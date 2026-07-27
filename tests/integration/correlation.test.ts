import { describe, expect, it } from "vitest";

import { AcceptCheckoutUseCase } from "@/modules/orders/application/accept-checkout.js";
import type { CheckoutRepository } from "@/modules/orders/ports/order-ports.js";
import { SequenceUuidGenerator } from "@tests/helpers/runtime.js";

describe("correlation propagation", () => {
  it("persists requestId and correlationId into checkout transaction and outbox payload", async () => {
    const accepted: Parameters<CheckoutRepository["accept"]>[0][] = [];
    const useCase = new AcceptCheckoutUseCase(
      {
        repository: {
          accept: (input) => {
            accepted.push(input);
            return Promise.resolve({ outcome: "accepted", orderId: input.orderId });
          },
        },
      },
      {
        idempotencyRetentionHours: 24,
        reservationTtlSeconds: 300,
        uuidGenerator: new SequenceUuidGenerator(),
        clock: { now: () => new Date("2026-07-27T00:00:00.000Z") },
      },
    );

    await useCase.execute({
      idempotencyKey: "key-1",
      requestId: "00000000-0000-4000-8000-000000000101",
      correlationId: "00000000-0000-4000-8000-000000000102",
      payload: { items: [{ productId: "case-product-001", quantity: 1 }] },
    });

    expect(accepted[0]?.requestId).toBe("00000000-0000-4000-8000-000000000101");
    expect(accepted[0]?.correlationId).toBe("00000000-0000-4000-8000-000000000102");
    expect(accepted[0]?.outboxPayload).toMatchObject({
      requestId: "00000000-0000-4000-8000-000000000101",
      correlationId: "00000000-0000-4000-8000-000000000102",
    });
  });
});
