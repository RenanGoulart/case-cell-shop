import { z } from "zod";

import { checkoutPayloadSchema } from "../../modules/orders/domain/canonical-payload.js";
import { orderStatuses } from "../../modules/orders/domain/order-state.js";

export const requestHeadersSchema = z.object({
  "x-request-id": z.uuid().optional(),
  "x-correlation-id": z.uuid().optional(),
});

export const idempotencyHeadersSchema = requestHeadersSchema.extend({
  "idempotency-key": z.string().trim().min(1),
});

export const productResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.string(),
  currency: z.string(),
  availableQuantity: z.number().int().nonnegative(),
});

export const productsResponseSchema = z.array(productResponseSchema);

export const checkoutRequestSchema = checkoutPayloadSchema;

export const checkoutAcceptedResponseSchema = z.object({
  orderId: z.uuid(),
  status: z.enum(orderStatuses),
});

export const orderStatusParamsSchema = z.object({
  orderId: z.uuid(),
});

export const orderStatusResponseSchema = z.object({
  orderId: z.uuid(),
  status: z.enum(orderStatuses),
  updatedAt: z.iso.datetime(),
  finalError: z.string().optional(),
});

export const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  details: z.unknown().optional(),
});

export const metricsResponseSchema = z.string();
