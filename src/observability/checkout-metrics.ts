import { Counter, Histogram, type Registry } from "prom-client";

export interface CheckoutMetrics {
  recordAccepted(milliseconds: number): void;
  recordInvalid(): void;
  recordProductNotFound(): void;
  recordInsufficientStock(): void;
  recordCreated(): void;
  recordReplay(): void;
  recordConflict(): void;
}

export function createCheckoutMetrics(registry: Registry): CheckoutMetrics {
  const accepted = new Counter({
    name: "casecellshop_checkout_accepted_total",
    help: "Accepted checkout requests",
    registers: [registry],
  });
  const invalid = new Counter({
    name: "casecellshop_checkout_invalid_total",
    help: "Invalid checkout requests",
    registers: [registry],
  });
  const notFound = new Counter({
    name: "casecellshop_checkout_product_not_found_total",
    help: "Checkout requests referencing missing products",
    registers: [registry],
  });
  const insufficient = new Counter({
    name: "casecellshop_checkout_insufficient_stock_total",
    help: "Checkout requests rejected due to insufficient stock",
    registers: [registry],
  });
  const idempotencyCreated = new Counter({
    name: "casecellshop_checkout_idempotency_created_total",
    help: "Checkout idempotency keys claimed for new orders",
    registers: [registry],
  });
  const idempotencyReplay = new Counter({
    name: "casecellshop_checkout_idempotency_replay_total",
    help: "Checkout idempotency replays returning an existing order",
    registers: [registry],
  });
  const idempotencyConflict = new Counter({
    name: "casecellshop_checkout_idempotency_conflict_total",
    help: "Checkout idempotency key reuse conflicts",
    registers: [registry],
  });
  const latency = new Histogram({
    name: "casecellshop_checkout_accept_duration_ms",
    help: "Checkout acceptance latency in milliseconds",
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
    registers: [registry],
  });

  return {
    recordAccepted(milliseconds) {
      accepted.inc();
      latency.observe(milliseconds);
    },
    recordInvalid() {
      invalid.inc();
    },
    recordProductNotFound() {
      notFound.inc();
    },
    recordInsufficientStock() {
      insufficient.inc();
    },
    recordCreated() {
      idempotencyCreated.inc();
    },
    recordReplay() {
      idempotencyReplay.inc();
    },
    recordConflict() {
      idempotencyConflict.inc();
    },
  };
}
