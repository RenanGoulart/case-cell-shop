import { describe, expect, it } from "vitest";

import { PrismaCheckoutRepository } from "@/adapters/database/checkout-repository.js";

describe("checkout concurrency guard", () => {
  it("uses availableQuantity >= requested quantity as the stock update predicate", () => {
    expect(PrismaCheckoutRepository.buildStockUpdatePredicate("case-product-001", 2)).toEqual({
      id: "case-product-001",
      availableQuantity: { gte: 2 },
    });
  });
});
