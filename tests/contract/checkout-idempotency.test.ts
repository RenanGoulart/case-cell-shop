import { describe, expect, it } from "vitest";

import { buildApp } from "@/api/app.js";
import { errorResponseSchema } from "@/api/schemas/http.js";
import type { CheckoutAcceptor } from "@/api/routes/checkout.js";
import { AppError } from "@/shared/errors.js";
import { testAppConfig } from "@tests/helpers/app-config.js";

function checkoutDependency(acceptor: CheckoutAcceptor) {
  return {
    checkout: {
      acceptCheckout: acceptor,
    },
  };
}

describe("POST /checkout idempotency contract", () => {
  it("documents replay as 202 Accepted with the original order id", async () => {
    const app = await buildApp(
      testAppConfig(),
      checkoutDependency({
        execute: () =>
          Promise.resolve({
            orderId: "00000000-0000-4000-8000-000000000001",
            status: "pending",
          }),
      }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/checkout",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "checkout-key-1",
      },
      payload: { items: [{ productId: "case-product-001", quantity: 1 }] },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      orderId: "00000000-0000-4000-8000-000000000001",
      status: "pending",
    });

    await app.close();
  });

  it("documents same key with different payload as 409 IDEMPOTENCY_CONFLICT", async () => {
    const app = await buildApp(
      testAppConfig(),
      checkoutDependency({
        execute: () =>
          Promise.reject(
            new AppError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key is already associated with another payload",
              409,
            ),
          ),
      }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/checkout",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "checkout-key-1",
      },
      payload: { items: [{ productId: "case-product-001", quantity: 2 }] },
    });

    expect(response.statusCode).toBe(409);
    expect(errorResponseSchema.parse(JSON.parse(response.body))).toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });

    await app.close();
  });
});
