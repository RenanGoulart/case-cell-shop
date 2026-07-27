import { AppError } from "../../../shared/errors.js";
import type { CheckoutPayload } from "./canonical-payload.js";
import type { OrderStatus } from "./order-state.js";

export interface AcceptedCheckoutSnapshot {
  readonly orderId: string;
  readonly status: OrderStatus;
}

export type CheckoutFailure =
  | { readonly reason: "product_not_found"; readonly productIds: readonly string[] }
  | { readonly reason: "insufficient_stock" }
  | { readonly reason: "idempotency_conflict" };

export function validateCheckoutItemsForAcceptance(
  items: CheckoutPayload["items"],
): CheckoutPayload["items"] {
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.productId)) {
      throw new AppError("INVALID_REQUEST", `Duplicate product: ${item.productId}`, 400);
    }
    seen.add(item.productId);
  }

  return [...items].sort((left, right) => left.productId.localeCompare(right.productId));
}

export function buildAcceptedCheckoutSnapshot(
  orderId: string,
  status: OrderStatus = "pending",
): AcceptedCheckoutSnapshot {
  return {
    orderId,
    status,
  };
}

export function mapCheckoutFailureToError(failure: CheckoutFailure): AppError {
  if (failure.reason === "product_not_found") {
    return new AppError("PRODUCT_NOT_FOUND", "One or more products were not found", 404, {
      productIds: failure.productIds,
    });
  }

  if (failure.reason === "insufficient_stock") {
    return new AppError("INSUFFICIENT_STOCK", "Insufficient stock for one or more products", 409);
  }

  return new AppError(
    "IDEMPOTENCY_CONFLICT",
    "Idempotency key is already associated with another payload",
    409,
  );
}
