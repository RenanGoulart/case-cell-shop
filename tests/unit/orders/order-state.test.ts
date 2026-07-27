import { describe, expect, it } from "vitest";

import {
  canTransitionOrder,
  transitionOrder,
  type OrderStatus,
} from "@/modules/orders/domain/order-state.js";

describe("order status transitions", () => {
  it("allows only the documented non-terminal transitions", () => {
    expect(canTransitionOrder("pending", "processing")).toBe(true);
    expect(canTransitionOrder("pending", "failed")).toBe(true);
    expect(canTransitionOrder("processing", "confirmed")).toBe(true);
    expect(canTransitionOrder("processing", "retrying")).toBe(true);
    expect(canTransitionOrder("processing", "failed")).toBe(true);
    expect(canTransitionOrder("retrying", "processing")).toBe(true);
    expect(canTransitionOrder("retrying", "failed")).toBe(true);

    expect(canTransitionOrder("pending", "confirmed")).toBe(false);
    expect(canTransitionOrder("retrying", "confirmed")).toBe(false);
  });

  it.each<OrderStatus>(["confirmed", "failed"])("keeps %s terminal", (status) => {
    expect(canTransitionOrder(status, "processing")).toBe(false);
    expect(() => transitionOrder(status, "processing")).toThrow(/Invalid order status transition/);
  });
});
