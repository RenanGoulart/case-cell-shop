import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type {
  CheckoutAcceptanceInput,
  CheckoutAcceptanceItem,
  CheckoutRepository,
  CheckoutRepositoryResult,
} from "../../modules/orders/ports/order-ports.js";

class CheckoutRollback extends Error {
  public constructor(public readonly result: CheckoutRepositoryResult) {
    super(result.outcome);
  }
}

function waitForCommittedIdempotencyDecision(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
}

export class PrismaCheckoutRepository implements CheckoutRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public static planConditionalStockUpdates(
    items: readonly CheckoutAcceptanceItem[],
  ): CheckoutAcceptanceItem[] {
    return [...items].sort((left, right) => left.productId.localeCompare(right.productId));
  }

  public static buildStockUpdatePredicate(productId: string, quantity: number) {
    return {
      id: productId,
      availableQuantity: { gte: quantity },
    };
  }

  public async accept(input: CheckoutAcceptanceInput): Promise<CheckoutRepositoryResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.idempotencyRecord.create({
          data: {
            key: input.idempotencyKey,
            requestHash: input.requestHash,
            canonicalBody: input.canonicalBody,
            expiresAt: input.idempotencyExpiresAt,
          },
        });

        const products = await tx.product.findMany({
          where: { id: { in: input.items.map((item) => item.productId) } },
        });
        const productsById = new Map(products.map((product) => [product.id, product]));
        const missingProductIds = input.items
          .map((item) => item.productId)
          .filter((productId) => !productsById.has(productId));

        if (missingProductIds.length > 0) {
          throw new CheckoutRollback({
            outcome: "product_not_found",
            productIds: missingProductIds,
          });
        }

        for (const item of PrismaCheckoutRepository.planConditionalStockUpdates(input.items)) {
          const updated = await tx.product.updateMany({
            where: PrismaCheckoutRepository.buildStockUpdatePredicate(
              item.productId,
              item.quantity,
            ),
            data: {
              availableQuantity: { decrement: item.quantity },
            },
          });

          if (updated.count !== 1) {
            throw new CheckoutRollback({ outcome: "insufficient_stock" });
          }
        }

        await tx.order.create({
          data: {
            id: input.orderId,
            requestId: input.requestId,
            correlationId: input.correlationId,
            currentAttempt: 1,
            items: {
              create: input.items.map((item) => {
                const product = productsById.get(item.productId);
                if (product === undefined) {
                  throw new Error(`Product ${item.productId} disappeared during checkout`);
                }

                return {
                  productId: item.productId,
                  quantity: item.quantity,
                  unitPriceCents: product.priceCents,
                  currency: product.currency,
                };
              }),
            },
          },
        });

        await tx.idempotencyRecord.update({
          where: { key: input.idempotencyKey },
          data: { orderId: input.orderId },
        });

        await tx.stockReservation.create({
          data: {
            id: input.reservationId,
            orderId: input.orderId,
            expiresAt: input.reservationExpiresAt,
            items: {
              create: input.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
            },
          },
        });

        await tx.outboxEvent.create({
          data: {
            id: input.outboxEventId,
            orderId: input.orderId,
            type: "order.accepted",
            payload: input.outboxPayload as Prisma.InputJsonValue,
            availableAt: input.occurredAt,
          },
        });

        return { outcome: "accepted", orderId: input.orderId };
      });
    } catch (error) {
      if (error instanceof CheckoutRollback) {
        return error.result;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return this.resolveIdempotencyConflict(input);
      }

      throw error;
    }
  }
  private async resolveIdempotencyConflict(
    input: CheckoutAcceptanceInput,
  ): Promise<CheckoutRepositoryResult> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const record = await this.prisma.idempotencyRecord.findUnique({
        where: { key: input.idempotencyKey },
        select: {
          requestHash: true,
          order: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      });

      if (record === null) {
        return { outcome: "idempotency_conflict" };
      }

      if (record.requestHash !== input.requestHash) {
        return { outcome: "idempotency_conflict" };
      }

      if (record.order !== null) {
        return {
          outcome: "replayed",
          orderId: record.order.id,
          status: record.order.status,
        };
      }

      await waitForCommittedIdempotencyDecision();
    }

    return { outcome: "idempotency_conflict" };
  }
}
