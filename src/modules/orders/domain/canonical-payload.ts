import { createHash } from "node:crypto";

import { z } from "zod";

export const checkoutItemSchema = z
  .object({
    productId: z.string().trim().min(1),
    quantity: z.number().int().positive(),
  })
  .strict();

export const checkoutPayloadSchema = z
  .object({
    items: z.array(checkoutItemSchema).min(1),
  })
  .strict()
  .superRefine((payload, context) => {
    const seen = new Set<string>();

    for (const [index, item] of payload.items.entries()) {
      if (seen.has(item.productId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate product: ${item.productId}`,
          path: ["items", index, "productId"],
        });
      }
      seen.add(item.productId);
    }
  });

export type CheckoutPayload = z.infer<typeof checkoutPayloadSchema>;

export function validateCheckoutPayload(input: unknown): CheckoutPayload {
  return checkoutPayloadSchema.parse(input);
}

export function canonicalizeCheckoutPayload(payload: CheckoutPayload): string {
  const sortedPayload = sortValue({
    ...payload,
    items: [...payload.items].sort((left, right) => left.productId.localeCompare(right.productId)),
  });

  return JSON.stringify(sortedPayload);
}

export function hashCanonicalPayload(payload: CheckoutPayload): string {
  return createHash("sha256").update(canonicalizeCheckoutPayload(payload)).digest("hex");
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, sortValue(entryValue)]));
  }

  return value;
}
