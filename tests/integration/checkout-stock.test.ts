import { describe, expect, it } from "vitest";

import { PrismaCheckoutRepository } from "@/adapters/database/checkout-repository.js";
import type { CheckoutAcceptanceInput } from "@/modules/orders/ports/order-ports.js";

describe("PrismaCheckoutRepository stock decisions", () => {
  it("uses ordered conditional stock updates and reports rollback-worthy insufficient stock", () => {
    const operations = PrismaCheckoutRepository.planConditionalStockUpdates([
      { productId: "case-b", quantity: 1 },
      { productId: "case-a", quantity: 2 },
    ] satisfies CheckoutAcceptanceInput["items"]);

    expect(operations).toEqual([
      { productId: "case-a", quantity: 2 },
      { productId: "case-b", quantity: 1 },
    ]);
  });
});
