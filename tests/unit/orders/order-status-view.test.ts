import { describe, expect, it } from "vitest";

import { GetOrderStatusUseCase } from "@/modules/orders/application/get-order-status.js";
import type { OrderStatusRepository } from "@/modules/orders/ports/order-status-port.js";

class FakeOrderStatusRepository implements OrderStatusRepository {
  public constructor(
    private readonly result: Awaited<ReturnType<OrderStatusRepository["findById"]>>,
  ) {}

  public findById(): ReturnType<OrderStatusRepository["findById"]> {
    return Promise.resolve(this.result);
  }
}

describe("GetOrderStatusUseCase", () => {
  it("maps persisted order status to API response and omits null finalError", async () => {
    const useCase = new GetOrderStatusUseCase(
      new FakeOrderStatusRepository({
        orderId: "00000000-0000-4000-8000-000000000001",
        status: "confirmed",
        updatedAt: new Date("2026-07-27T12:00:00.000Z"),
        finalError: null,
      }),
    );

    await expect(
      useCase.execute({ orderId: "00000000-0000-4000-8000-000000000001" }),
    ).resolves.toEqual({
      orderId: "00000000-0000-4000-8000-000000000001",
      status: "confirmed",
      updatedAt: "2026-07-27T12:00:00.000Z",
    });
  });

  it("includes finalError for failed orders", async () => {
    const useCase = new GetOrderStatusUseCase(
      new FakeOrderStatusRepository({
        orderId: "00000000-0000-4000-8000-000000000002",
        status: "failed",
        updatedAt: new Date("2026-07-27T12:00:00.000Z"),
        finalError: "RESERVATION_EXPIRED",
      }),
    );

    await expect(
      useCase.execute({ orderId: "00000000-0000-4000-8000-000000000002" }),
    ).resolves.toMatchObject({ finalError: "RESERVATION_EXPIRED" });
  });

  it("throws ORDER_NOT_FOUND when repository returns null", async () => {
    const useCase = new GetOrderStatusUseCase(new FakeOrderStatusRepository(null));

    await expect(
      useCase.execute({ orderId: "00000000-0000-4000-8000-000000000404" }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND", httpStatus: 404 });
  });
});
