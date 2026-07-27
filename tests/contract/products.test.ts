import { describe, expect, it } from "vitest";

import { buildApp } from "@/api/app.js";
import { testAppConfig } from "@tests/helpers/app-config.js";
import { errorResponseSchema, productsResponseSchema } from "@/api/schemas/http.js";
import type { ListProductsResult } from "@/modules/catalog/application/list-products.js";

function productsDependency(result: ListProductsResult) {
  return {
    products: {
      listProducts: {
        execute: () => Promise.resolve(result),
      },
    },
  };
}

describe("GET /products contract", () => {
  it("returns 200 with products and tracing headers", async () => {
    const app = await buildApp(
      testAppConfig(),
      productsDependency({
        status: 200,
        source: "cache",
        products: [
          {
            id: "product-1",
            name: "Case Transparente",
            price: "59.90",
            currency: "BRL",
            availableQuantity: 12,
          },
        ],
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/products",
      headers: {
        "x-request-id": "00000000-0000-4000-8000-000000000001",
        "x-correlation-id": "00000000-0000-4000-8000-000000000002",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBe("00000000-0000-4000-8000-000000000001");
    expect(response.headers["x-correlation-id"]).toBe("00000000-0000-4000-8000-000000000002");
    const body = productsResponseSchema.parse(JSON.parse(response.body));

    expect(body).toEqual([
      {
        id: "product-1",
        name: "Case Transparente",
        price: "59.90",
        currency: "BRL",
        availableQuantity: 12,
      },
    ]);

    await app.close();
  });

  it("returns 204 without body for an empty catalog", async () => {
    const app = await buildApp(
      testAppConfig(),
      productsDependency({ status: 204, source: "database", products: [] }),
    );

    const response = await app.inject({ method: "GET", url: "/products" });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");

    await app.close();
  });

  it("returns predictable 503 error envelope when catalog is unavailable", async () => {
    const app = await buildApp(testAppConfig(), {
      products: {
        listProducts: {
          execute: () => Promise.reject(new Error("database down")),
        },
      },
    });

    const response = await app.inject({ method: "GET", url: "/products" });

    expect(response.statusCode).toBe(503);
    const body = errorResponseSchema.parse(JSON.parse(response.body));

    expect(body).toMatchObject({
      code: "CATALOG_UNAVAILABLE",
      message: "Catalog is temporarily unavailable",
    });
    expect(body.requestId).toEqual(expect.any(String));

    await app.close();
  });
});
