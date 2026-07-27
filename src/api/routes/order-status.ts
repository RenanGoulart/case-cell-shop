import type { FastifyReply, FastifyRequest } from "fastify";

import {
  errorResponseSchema,
  orderStatusParamsSchema,
  orderStatusResponseSchema,
  requestHeadersSchema,
} from "../schemas/http.js";
import type { OrderStatusQuery } from "../../modules/orders/ports/order-status-port.js";
import { AppError, toErrorEnvelope } from "../../shared/errors.js";

export interface OrderStatusRouteDependencies {
  readonly getOrderStatus: OrderStatusQuery;
}

export const orderStatusRouteSchema = {
  headers: requestHeadersSchema,
  params: orderStatusParamsSchema,
  response: {
    200: orderStatusResponseSchema,
    400: errorResponseSchema,
    404: errorResponseSchema,
  },
};

export function createOrderStatusHandler(dependencies: OrderStatusRouteDependencies) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orderId } = orderStatusParamsSchema.parse(request.params);
      const result = await dependencies.getOrderStatus.execute({ orderId });

      reply.status(200);
      return result;
    } catch (error) {
      request.log.error({ err: error }, "order status lookup failed");

      const appError =
        error instanceof AppError
          ? error
          : new AppError("INTERNAL_ERROR", "Unexpected order status error", 500);

      reply.status(appError.httpStatus);
      return toErrorEnvelope(appError, request.id);
    }
  };
}
