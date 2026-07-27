import type { OrderStatus } from "../domain/order-state.js";

export interface OrderStatusView {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly updatedAt: Date;
  readonly finalError: string | null;
}

export interface OrderStatusResponse {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly updatedAt: string;
  readonly finalError?: string;
}

export interface GetOrderStatusCommand {
  readonly orderId: string;
}

export interface OrderStatusRepository {
  findById(orderId: string): Promise<OrderStatusView | null>;
}

export interface OrderStatusQuery {
  execute(command: GetOrderStatusCommand): Promise<OrderStatusResponse>;
}
