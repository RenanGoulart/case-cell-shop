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

describe("POST /checkout contract", () => {
  it("returns 202 Accepted with order id, pending status and tracing headers", async () => {
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
        "x-request-id": "00000000-0000-4000-8000-000000000010",
        "x-correlation-id": "00000000-0000-4000-8000-000000000011",
      },
      payload: { items: [{ productId: "case-product-001", quantity: 1 }] },
    });

    expect(response.statusCode).toBe(202);
    expect(response.headers["x-request-id"]).toBe("00000000-0000-4000-8000-000000000010");
    expect(response.headers["x-correlation-id"]).toBe("00000000-0000-4000-8000-000000000011");
    expect(response.json()).toEqual({
      orderId: "00000000-0000-4000-8000-000000000001",
      status: "pending",
    });

    await app.close();
  });

  it("returns 400 for invalid payload", async () => {
    const app = await buildApp(
      testAppConfig(),
      checkoutDependency({
        execute: () => Promise.reject(new Error("should not execute")),
      }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/checkout",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "checkout-key-1",
      },
      payload: { items: [] },
    });

    expect(response.statusCode).toBe(400);
    const body = errorResponseSchema.parse(JSON.parse(response.body));
    expect(body.code).toBe("INVALID_REQUEST");

    await app.close();
  });

  it("maps product not found and insufficient stock errors", async () => {
    const app = await buildApp(
      testAppConfig(),
      checkoutDependency({
        execute: () =>
          Promise.reject(
            new AppError("PRODUCT_NOT_FOUND", "One or more products were not found", 404, {
              productIds: ["missing"],
            }),
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
      payload: { items: [{ productId: "missing", quantity: 1 }] },
    });

    expect(response.statusCode).toBe(404);
    expect(errorResponseSchema.parse(JSON.parse(response.body))).toMatchObject({
      code: "PRODUCT_NOT_FOUND",
    });

    await app.close();
  });
});
