import { AppError } from "../../../shared/errors.js";
import type {
  GetOrderStatusCommand,
  OrderStatusQuery,
  OrderStatusRepository,
  OrderStatusResponse,
  OrderStatusView,
} from "../ports/order-status-port.js";

export class GetOrderStatusUseCase implements OrderStatusQuery {
  public constructor(private readonly repository: OrderStatusRepository) {}

  public async execute(command: GetOrderStatusCommand): Promise<OrderStatusResponse> {
    const view = await this.repository.findById(command.orderId);

    if (view === null) {
      throw new AppError("ORDER_NOT_FOUND", "Order not found", 404);
    }

    return mapOrderStatusView(view);
  }
}

export function mapOrderStatusView(view: OrderStatusView): OrderStatusResponse {
  return {
    orderId: view.orderId,
    status: view.status,
    updatedAt: view.updatedAt.toISOString(),
    ...(view.finalError === null ? {} : { finalError: view.finalError }),
  };
}
