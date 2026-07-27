import { z } from "zod";

export const orderProcessingMessageSchema = z
  .object({
    version: z.literal(1),
    eventId: z.uuid(),
    orderId: z.uuid(),
    requestId: z.uuid(),
    correlationId: z.uuid(),
    attemptNumber: z.number().int().positive(),
    occurredAt: z.iso.datetime(),
  })
  .strict();

export type OrderProcessingMessage = z.infer<typeof orderProcessingMessageSchema>;

export const orderProcessingMessageJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://casecellshop.local/schemas/order-processing-message.schema.json",
  title: "OrderProcessingMessage",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "eventId",
    "orderId",
    "requestId",
    "correlationId",
    "attemptNumber",
    "occurredAt",
  ],
  properties: {
    version: { const: 1 },
    eventId: { type: "string", format: "uuid" },
    orderId: { type: "string", format: "uuid" },
    requestId: { type: "string", format: "uuid" },
    correlationId: { type: "string", format: "uuid" },
    attemptNumber: { type: "integer", minimum: 1 },
    occurredAt: { type: "string", format: "date-time" },
  },
} as const;
