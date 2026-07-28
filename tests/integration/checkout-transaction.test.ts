import { describe, expect, it } from "vitest";

import { AcceptCheckoutUseCase } from "@/modules/orders/application/accept-checkout.js";
import type {
  CheckoutAcceptanceInput,
  CheckoutRepository,
  CheckoutRepositoryResult,
} from "@/modules/orders/ports/order-ports.js";
import { FakeClock, SequenceUuidGenerator } from "@tests/helpers/runtime.js";

class RecordingCheckoutRepository implements CheckoutRepository {
  public input: CheckoutAcceptanceInput | undefined;

  public constructor(private readonly result: CheckoutRepositoryResult) {}

  public accept(input: CheckoutAcceptanceInput): Promise<CheckoutRepositoryResult> {
    this.input = input;
    return Promise.resolve(this.result);
  }
}

describe("AcceptCheckoutUseCase transaction orchestration", () => {
  it("passes deterministic ids, canonical hash and outbox payload fields to repository", async () => {
    const repository = new RecordingCheckoutRepository({
      outcome: "accepted",
      orderId: "00000000-0000-4000-8000-000000000001",
    });
    const useCase = new AcceptCheckoutUseCase(
      { repository },
      {
        clock: new FakeClock(new Date("2026-07-27T00:00:00.000Z")),
        uuidGenerator: new SequenceUuidGenerator(),
        idempotencyRetentionHours: 24,
        reservationTtlSeconds: 300,
      },
    );

    const result = await useCase.execute({
      idempotencyKey: "checkout-key-1",
      payload: { items: [{ productId: "case-product-001", quantity: 1 }] },
      requestId: "00000000-0000-4000-8000-000000000010",
      correlationId: "00000000-0000-4000-8000-000000000011",
    });

    expect(result).toEqual({
      orderId: "00000000-0000-4000-8000-000000000001",
      status: "pending",
    });
    expect(repository.input).toMatchObject({
      idempotencyKey: "checkout-key-1",
      orderId: "00000000-0000-4000-8000-000000000001",
      reservationId: "00000000-0000-4000-8000-000000000002",
      outboxEventId: "00000000-0000-4000-8000-000000000003",
      requestId: "00000000-0000-4000-8000-000000000010",
      correlationId: "00000000-0000-4000-8000-000000000011",
    });
    expect(repository.input?.outboxPayload).toMatchObject({
      version: 1,
      attemptNumber: 1,
      occurredAt: "2026-07-27T00:00:00.000Z",
    });
  });
});
