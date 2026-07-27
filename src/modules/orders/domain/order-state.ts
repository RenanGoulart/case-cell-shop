export const orderStatuses = ["pending", "processing", "retrying", "confirmed", "failed"] as const;

export type OrderStatus = (typeof orderStatuses)[number];

const allowedTransitions: ReadonlyMap<OrderStatus, ReadonlySet<OrderStatus>> = new Map([
  ["pending", new Set(["processing", "failed"])],
  ["processing", new Set(["confirmed", "retrying", "failed"])],
  ["retrying", new Set(["processing", "failed"])],
  ["confirmed", new Set()],
  ["failed", new Set()],
]);

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return allowedTransitions.get(from)?.has(to) ?? false;
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return status === "confirmed" || status === "failed";
}

export function transitionOrder(from: OrderStatus, to: OrderStatus): OrderStatus {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`Invalid order status transition: ${from} -> ${to}`);
  }

  return to;
}
