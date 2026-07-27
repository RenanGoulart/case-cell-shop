import { describe, expect, it } from "vitest";

import { AcceptCheckoutUseCase } from "@/modules/orders/application/accept-checkout.js";
import type {
  CheckoutAcceptanceInput,
  CheckoutRepository,
  CheckoutRepositoryResult,
} from "@/modules/orders/ports/order-ports.js";
import { FakeClock, SequenceUuidGenerator } from "@tests/helpers/runtime.js";

class StatefulIdempotencyRepository implements CheckoutRepository {
  public createdOrders = 0;
  public createdReservations = 0;
  public createdOutboxEvents = 0;
  private committed: { readonly requestHash: string; readonly orderId: string } | undefined;

  public accept(input: CheckoutAcceptanceInput): Promise<CheckoutRepositoryResult> {
    if (this.committed === undefined) {
      this.createdOrders += 1;
      this.createdReservations += 1;
      this.createdOutboxEvents += 1;
      this.committed = { requestHash: input.requestHash, orderId: input.orderId };
      return Promise.resolve({ outcome: "accepted", orderId: input.orderId });
    }

    if (this.committed.requestHash === input.requestHash) {
      return Promise.resolve({
        outcome: "replayed",
        orderId: this.committed.orderId,
        status: "pending",
      } as unknown as CheckoutRepositoryResult);
    }

    return Promise.resolve({ outcome: "idempotency_conflict" });
  }
}

describe("checkout idempotency replay", () => {
  it("returns the same order for the same key and canonical-equivalent payload without extra effects", async () => {
    const repository = new StatefulIdempotencyRepository();
    const useCase = new AcceptCheckoutUseCase(
      { repository },
      {
        clock: new FakeClock(new Date("2026-07-27T00:00:00.000Z")),
        uuidGenerator: new SequenceUuidGenerator(),
        idempotencyRetentionHours: 24,
        reservationTtlSeconds: 300,
      },
    );

    const first = await useCase.execute({
      idempotencyKey: "same-key",
      payload: {
        items: [
          { productId: "case-product-002", quantity: 1 },
          { productId: "case-product-001", quantity: 2 },
        ],
      },
      requestId: "00000000-0000-4000-8000-000000000010",
      correlationId: "00000000-0000-4000-8000-000000000011",
    });

    const second = await useCase.execute({
      idempotencyKey: "same-key",
      payload: {
        items: [
          { quantity: 2, productId: "case-product-001" },
          { quantity: 1, productId: "case-product-002" },
        ],
      },
      requestId: "00000000-0000-4000-8000-000000000012",
      correlationId: "00000000-0000-4000-8000-000000000013",
    });

    expect(second).toEqual(first);
    expect(repository.createdOrders).toBe(1);
    expect(repository.createdReservations).toBe(1);
    expect(repository.createdOutboxEvents).toBe(1);
  });
});
