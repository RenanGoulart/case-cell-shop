import { describe, expect, it } from "vitest";

import { AcceptCheckoutUseCase } from "@/modules/orders/application/accept-checkout.js";
import type {
  CheckoutAcceptanceInput,
  CheckoutRepository,
  CheckoutRepositoryResult,
} from "@/modules/orders/ports/order-ports.js";
import { FakeClock, SequenceUuidGenerator } from "@tests/helpers/runtime.js";

class ConflictAwareRepository implements CheckoutRepository {
  public createdOrders = 0;
  private committed: { readonly requestHash: string; readonly orderId: string } | undefined;

  public accept(input: CheckoutAcceptanceInput): Promise<CheckoutRepositoryResult> {
    if (this.committed === undefined) {
      this.createdOrders += 1;
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

function createUseCase(repository: CheckoutRepository) {
  return new AcceptCheckoutUseCase(
    { repository },
    {
      clock: new FakeClock(new Date("2026-07-27T00:00:00.000Z")),
      uuidGenerator: new SequenceUuidGenerator(),
      idempotencyRetentionHours: 24,
      reservationTtlSeconds: 300,
    },
  );
}

describe("checkout idempotency conflict", () => {
  it("returns conflict for same key with different canonical payload without creating extra order", async () => {
    const repository = new ConflictAwareRepository();
    const useCase = createUseCase(repository);

    await useCase.execute({
      idempotencyKey: "same-key",
      payload: { items: [{ productId: "case-product-001", quantity: 1 }] },
      requestId: "00000000-0000-4000-8000-000000000010",
      correlationId: "00000000-0000-4000-8000-000000000011",
    });

    await expect(
      useCase.execute({
        idempotencyKey: "same-key",
        payload: { items: [{ productId: "case-product-001", quantity: 2 }] },
        requestId: "00000000-0000-4000-8000-000000000012",
        correlationId: "00000000-0000-4000-8000-000000000013",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", httpStatus: 409 });

    expect(repository.createdOrders).toBe(1);
  });
});
