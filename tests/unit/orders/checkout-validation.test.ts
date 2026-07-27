import { describe, expect, it } from "vitest";

import {
  buildAcceptedCheckoutSnapshot,
  mapCheckoutFailureToError,
  validateCheckoutItemsForAcceptance,
} from "@/modules/orders/domain/checkout.js";

describe("checkout acceptance domain", () => {
  it("rejects duplicated products before stock changes", () => {
    expect(() =>
      validateCheckoutItemsForAcceptance([
        { productId: "case-1", quantity: 1 },
        { productId: "case-1", quantity: 2 },
      ]),
    ).toThrow("Duplicate product");
  });

  it("sorts accepted items by product id for deterministic stock updates", () => {
    const items = validateCheckoutItemsForAcceptance([
      { productId: "case-b", quantity: 1 },
      { productId: "case-a", quantity: 2 },
    ]);

    expect(items.map((item) => item.productId)).toEqual(["case-a", "case-b"]);
  });

  it("maps repository failure reasons to HTTP-safe errors", () => {
    expect(
      mapCheckoutFailureToError({ reason: "product_not_found", productIds: ["missing"] }),
    ).toMatchObject({
      code: "PRODUCT_NOT_FOUND",
      httpStatus: 404,
    });
    expect(mapCheckoutFailureToError({ reason: "insufficient_stock" })).toMatchObject({
      code: "INSUFFICIENT_STOCK",
      httpStatus: 409,
    });
  });

  it("builds a pending accepted snapshot", () => {
    expect(buildAcceptedCheckoutSnapshot("00000000-0000-4000-8000-000000000001")).toEqual({
      orderId: "00000000-0000-4000-8000-000000000001",
      status: "pending",
    });
  });
});
