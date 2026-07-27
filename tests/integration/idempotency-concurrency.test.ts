import { describe, expect, it } from "vitest";

import { AcceptCheckoutUseCase } from "@/modules/orders/application/accept-checkout.js";
import type {
  CheckoutAcceptanceInput,
  CheckoutRepository,
  CheckoutRepositoryResult,
} from "@/modules/orders/ports/order-ports.js";
import { FakeClock, SequenceUuidGenerator } from "@tests/helpers/runtime.js";

class ConcurrentIdempotencyRepository implements CheckoutRepository {
  public createdOrders = 0;
  private committed: { readonly requestHash: string; readonly orderId: string } | undefined;
  private readonly queue: Promise<void> = Promise.resolve();

  public async accept(input: CheckoutAcceptanceInput): Promise<CheckoutRepositoryResult> {
    await this.queue;

    if (this.committed === undefined) {
      this.createdOrders += 1;
      this.committed = { requestHash: input.requestHash, orderId: input.orderId };
      return { outcome: "accepted", orderId: input.orderId };
    }

    if (this.committed.requestHash === input.requestHash) {
      return {
        outcome: "replayed",
        orderId: this.committed.orderId,
        status: "pending",
      } as unknown as CheckoutRepositoryResult;
    }

    return { outcome: "idempotency_conflict" };
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

describe("checkout idempotency concurrency", () => {
  it("converges simultaneous same-key same-payload requests to one order", async () => {
    const repository = new ConcurrentIdempotencyRepository();
    const useCase = createUseCase(repository);
    const command = {
      idempotencyKey: "same-key",
      payload: { items: [{ productId: "case-product-001", quantity: 1 }] },
      requestId: "00000000-0000-4000-8000-000000000010",
      correlationId: "00000000-0000-4000-8000-000000000011",
    };

    const results = await Promise.all([
      useCase.execute(command),
      useCase.execute({ ...command, requestId: "00000000-0000-4000-8000-000000000012" }),
      useCase.execute({ ...command, requestId: "00000000-0000-4000-8000-000000000013" }),
    ]);

    expect(new Set(results.map((result) => result.orderId)).size).toBe(1);
    expect(repository.createdOrders).toBe(1);
  });

  it("allows at most one simultaneous same-key different-payload request to create effects", async () => {
    const repository = new ConcurrentIdempotencyRepository();
    const useCase = createUseCase(repository);

    const results = await Promise.allSettled([
      useCase.execute({
        idempotencyKey: "same-key",
        payload: { items: [{ productId: "case-product-001", quantity: 1 }] },
        requestId: "00000000-0000-4000-8000-000000000020",
        correlationId: "00000000-0000-4000-8000-000000000021",
      }),
      useCase.execute({
        idempotencyKey: "same-key",
        payload: { items: [{ productId: "case-product-001", quantity: 2 }] },
        requestId: "00000000-0000-4000-8000-000000000022",
        correlationId: "00000000-0000-4000-8000-000000000023",
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(repository.createdOrders).toBe(1);
  });
});
