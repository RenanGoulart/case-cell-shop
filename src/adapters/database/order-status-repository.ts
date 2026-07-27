import type { PrismaClient } from "../../generated/prisma/client.js";
import type {
  OrderStatusView,
  OrderStatusRepository,
} from "../../modules/orders/ports/order-status-port.js";

interface PrismaOrderRecord {
  readonly id: string;
  readonly status: OrderStatusView["status"];
  readonly updatedAt: Date;
  readonly finalError: string | null;
}

export class PrismaOrderStatusRepository implements OrderStatusRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public static mapOrderRecord(record: PrismaOrderRecord): OrderStatusView {
    return {
      orderId: record.id,
      status: record.status,
      updatedAt: record.updatedAt,
      finalError: record.finalError,
    };
  }

  public async findById(orderId: string): Promise<OrderStatusView | null> {
    const record = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        finalError: true,
      },
    });

    return record === null ? null : PrismaOrderStatusRepository.mapOrderRecord(record);
  }
}
