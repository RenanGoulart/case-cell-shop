import { describe, expect, it } from "vitest";

import { buildSeedProducts, planSeedCatalogChange } from "../../prisma/seed.js";

describe("deterministic product seed", () => {
  it("generates exactly 50 stable, valid local products", () => {
    const products = buildSeedProducts(20260727);

    expect(products).toHaveLength(50);
    expect(new Set(products.map((product) => product.id))).toHaveLength(50);
    expect(products[0]?.id).toBe("case-product-001");
    expect(products[1]?.id).toBe("case-product-002");
    expect(
      products.every((product) => product.priceCents >= 2_500 && product.priceCents <= 500_000),
    ).toBe(true);
    expect(
      products.every(
        (product) => product.availableQuantity >= 10 && product.availableQuantity <= 100,
      ),
    ).toBe(true);
  });

  it("plans non-destructive inserts and catalog version increment only when new products exist", () => {
    const products = buildSeedProducts(20260727);

    expect(planSeedCatalogChange(products, new Set()).shouldIncrementCatalogVersion).toBe(true);
    expect(
      planSeedCatalogChange(products, new Set(products.map((product) => product.id)))
        .shouldIncrementCatalogVersion,
    ).toBe(false);
  });
});
