import type { OrderStatus } from "../domain/order-state.js";

import type { CheckoutPayload } from "../domain/canonical-payload.js";

export interface CheckoutAcceptanceItem {
  readonly productId: string;
  readonly quantity: number;
}

export interface CheckoutAcceptanceInput {
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly canonicalBody: CheckoutPayload;
  readonly orderId: string;
  readonly reservationId: string;
  readonly outboxEventId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly items: readonly CheckoutAcceptanceItem[];
  readonly idempotencyExpiresAt: Date;
  readonly reservationExpiresAt: Date;
  readonly occurredAt: Date;
  readonly outboxPayload: Record<string, unknown>;
}

export type CheckoutRepositoryResult =
  | { readonly outcome: "accepted"; readonly orderId: string }
  | { readonly outcome: "replayed"; readonly orderId: string; readonly status: OrderStatus }
  | { readonly outcome: "product_not_found"; readonly productIds: readonly string[] }
  | { readonly outcome: "insufficient_stock" }
  | { readonly outcome: "idempotency_conflict" };

export interface CheckoutRepository {
  accept(input: CheckoutAcceptanceInput): Promise<CheckoutRepositoryResult>;
}

export interface CheckoutIdempotencyMetrics {
  recordCreated(): void;
  recordReplay(): void;
  recordConflict(): void;
}

export interface CatalogInvalidationPort {
  invalidate(): Promise<void>;
}
