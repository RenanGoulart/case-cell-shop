import { describe, expect, it } from "vitest";

import {
  canonicalizeCheckoutPayload,
  hashCanonicalPayload,
  validateCheckoutPayload,
} from "@/modules/orders/domain/canonical-payload.js";

describe("checkout canonical payload", () => {
  it("sorts object properties and items by productId before hashing", () => {
    const first = validateCheckoutPayload({
      items: [
        { productId: "case-product-002", quantity: 1 },
        { quantity: 2, productId: "case-product-001" },
      ],
    });
    const second = validateCheckoutPayload({
      items: [
        { quantity: 2, productId: "case-product-001" },
        { productId: "case-product-002", quantity: 1 },
      ],
    });

    expect(canonicalizeCheckoutPayload(first)).toBe(canonicalizeCheckoutPayload(second));
    expect(hashCanonicalPayload(first)).toBe(hashCanonicalPayload(second));
  });

  it("emits deterministic canonical JSON with sorted item order and object keys", () => {
    const payload = validateCheckoutPayload({
      items: [
        { quantity: 1, productId: "case-product-002" },
        { productId: "case-product-001", quantity: 2 },
      ],
    });

    expect(JSON.parse(canonicalizeCheckoutPayload(payload))).toEqual({
      items: [
        { productId: "case-product-001", quantity: 2 },
        { productId: "case-product-002", quantity: 1 },
      ],
    });
  });

  it("rejects duplicate products, invalid quantities and unknown fields", () => {
    expect(() =>
      validateCheckoutPayload({
        items: [
          { productId: "case-product-001", quantity: 1 },
          { productId: "case-product-001", quantity: 1 },
        ],
      }),
    ).toThrow(/Duplicate product/);

    expect(() =>
      validateCheckoutPayload({ items: [{ productId: "case-product-001", quantity: 0 }] }),
    ).toThrow();
    expect(() =>
      validateCheckoutPayload({
        items: [{ productId: "case-product-001", quantity: 1, extra: true }],
      }),
    ).toThrow();
  });
});
