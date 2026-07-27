import { describe, expect, it } from "vitest";

import { buildApp } from "@/api/app.js";
import { errorResponseSchema, orderStatusResponseSchema } from "@/api/schemas/http.js";
import type { OrderStatusQuery } from "@/modules/orders/ports/order-status-port.js";
import { AppError } from "@/shared/errors.js";
import { testAppConfig } from "@tests/helpers/app-config.js";

function orderStatusDependency(query: OrderStatusQuery) {
  return {
    orderStatus: {
      getOrderStatus: query,
    },
  };
}

describe("GET /orders/{orderId}/status contract", () => {
  it("returns 200 with current status, updatedAt and tracing headers", async () => {
    const app = await buildApp(
      testAppConfig(),
      orderStatusDependency({
        execute: () =>
          Promise.resolve({
            orderId: "00000000-0000-4000-8000-000000000001",
            status: "processing",
            updatedAt: "2026-07-27T12:00:00.000Z",
          }),
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/orders/00000000-0000-4000-8000-000000000001/status",
      headers: {
        "x-request-id": "00000000-0000-4000-8000-000000000010",
        "x-correlation-id": "00000000-0000-4000-8000-000000000011",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBe("00000000-0000-4000-8000-000000000010");
    expect(response.headers["x-correlation-id"]).toBe("00000000-0000-4000-8000-000000000011");
    expect(orderStatusResponseSchema.parse(response.json())).toEqual({
      orderId: "00000000-0000-4000-8000-000000000001",
      status: "processing",
      updatedAt: "2026-07-27T12:00:00.000Z",
    });

    await app.close();
  });

  it("returns 400 for invalid order id", async () => {
    const app = await buildApp(
      testAppConfig(),
      orderStatusDependency({
        execute: () => Promise.reject(new Error("should not execute")),
      }),
    );

    const response = await app.inject({ method: "GET", url: "/orders/not-a-uuid/status" });

    expect(response.statusCode).toBe(400);
    expect(errorResponseSchema.parse(JSON.parse(response.body))).toMatchObject({
      code: "INVALID_REQUEST",
    });

    await app.close();
  });

  it("returns 404 ORDER_NOT_FOUND for missing order", async () => {
    const app = await buildApp(
      testAppConfig(),
      orderStatusDependency({
        execute: () => Promise.reject(new AppError("ORDER_NOT_FOUND", "Order not found", 404)),
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/orders/00000000-0000-4000-8000-000000000404/status",
    });

    expect(response.statusCode).toBe(404);
    expect(errorResponseSchema.parse(JSON.parse(response.body))).toMatchObject({
      code: "ORDER_NOT_FOUND",
    });

    await app.close();
  });

  it("returns terminal finalError when present", async () => {
    const app = await buildApp(
      testAppConfig(),
      orderStatusDependency({
        execute: () =>
          Promise.resolve({
            orderId: "00000000-0000-4000-8000-000000000002",
            status: "failed",
            updatedAt: "2026-07-27T12:00:00.000Z",
            finalError: "ERP_UNAVAILABLE",
          }),
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/orders/00000000-0000-4000-8000-000000000002/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "failed", finalError: "ERP_UNAVAILABLE" });

    await app.close();
  });
});
