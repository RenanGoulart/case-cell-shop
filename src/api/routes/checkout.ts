import type { FastifyReply, FastifyRequest } from "fastify";

import {
  checkoutAcceptedResponseSchema,
  checkoutRequestSchema,
  errorResponseSchema,
  idempotencyHeadersSchema,
} from "../schemas/http.js";
import { AppError, toErrorEnvelope } from "../../shared/errors.js";
import type { AcceptedCheckoutSnapshot } from "../../modules/orders/domain/checkout.js";
import type { CheckoutMetrics } from "../../observability/checkout-metrics.js";

export interface CheckoutCommand {
  readonly idempotencyKey: string;
  readonly payload: unknown;
  readonly requestId: string;
  readonly correlationId: string;
}

export interface CheckoutAcceptor {
  execute(command: CheckoutCommand): Promise<AcceptedCheckoutSnapshot>;
}

export interface CheckoutRouteDependencies {
  readonly acceptCheckout: CheckoutAcceptor;
  readonly metrics?: Pick<
    CheckoutMetrics,
    "recordAccepted" | "recordInvalid" | "recordProductNotFound" | "recordInsufficientStock"
  >;
}

export const checkoutRouteSchema = {
  headers: idempotencyHeadersSchema,
  body: checkoutRequestSchema,
  response: {
    202: checkoutAcceptedResponseSchema,
    400: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
  },
};

export function createCheckoutHandler(dependencies: CheckoutRouteDependencies) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const started = performance.now();
    void started;

    try {
      const idempotencyKey = getRequiredHeader(request, "idempotency-key");
      const correlationId = getCorrelationId(reply);
      const result = await dependencies.acceptCheckout.execute({
        idempotencyKey,
        payload: request.body,
        requestId: request.id,
        correlationId,
      });

      dependencies.metrics?.recordAccepted(performance.now() - started);
      request.log.info({ orderId: result.orderId, status: result.status }, "checkout accepted");
      reply.status(202);
      return result;
    } catch (error) {
      request.log.error({ err: error }, "checkout failed");

      const appError =
        error instanceof AppError
          ? error
          : new AppError("INTERNAL_ERROR", "Unexpected checkout error", 500);

      recordCheckoutFailure(dependencies, appError);
      reply.status(appError.httpStatus);
      return toErrorEnvelope(appError, request.id);
    }
  };
}

function recordCheckoutFailure(dependencies: CheckoutRouteDependencies, error: AppError): void {
  if (error.code === "INVALID_REQUEST") {
    dependencies.metrics?.recordInvalid();
    return;
  }

  if (error.code === "PRODUCT_NOT_FOUND") {
    dependencies.metrics?.recordProductNotFound();
    return;
  }

  if (error.code === "INSUFFICIENT_STOCK") {
    dependencies.metrics?.recordInsufficientStock();
  }
}

function getRequiredHeader(request: FastifyRequest, name: string): string {
  const value = request.headers[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AppError("INVALID_REQUEST", `${name} header is required`, 400);
  }

  return value;
}

function getCorrelationId(reply: FastifyReply): string {
  const value = reply.getHeader("x-correlation-id");

  if (typeof value === "string") {
    return value;
  }

  return crypto.randomUUID();
}
