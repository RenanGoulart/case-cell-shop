import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { cryptoUuidGenerator } from "../../shared/ports/runtime.js";
import { decideProcessingOutcome } from "../../modules/orders/domain/order-processing.js";
import type {
  ClaimProcessingAttemptResult,
  ExpireReservationsResult,
  FinishProcessingAttemptInput,
  FinishProcessingAttemptResult,
  ProcessingRepository,
} from "../../modules/orders/ports/processing-ports.js";
import type { OrderProcessingMessage } from "../../worker/schemas/order-processing-message.js";
import type { OutboxEventToPublish } from "../../worker/outbox-publisher.js";

export class PrismaProcessingRepository implements ProcessingRepository {
  public static shouldIncrementCatalogGenerationForReservationEffect(
    effect: "consume" | "release",
  ): false {
    void effect;
    return false;
  }

  public constructor(private readonly prisma: PrismaClient) {}

  public async claimOrderAttempt(
    message: OrderProcessingMessage,
  ): Promise<ClaimProcessingAttemptResult> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: {
          id: message.orderId,
          status: { in: ["pending", "retrying"] },
        },
        data: {
          status: "processing",
          currentAttempt: message.attemptNumber,
        },
      });

      if (updated.count !== 1) {
        const order = await tx.order.findUnique({
          where: { id: message.orderId },
          select: { status: true },
        });

        if (order === null) {
          return { claimed: false, reason: "missing_order" };
        }

        return { claimed: false, reason: "duplicate_or_terminal" };
      }

      try {
        const processingToken = cryptoUuidGenerator.randomUuid();
        const deadlineAt = new Date(Date.now() + 60_000);

        await tx.processingAttempt.create({
          data: {
            orderId: message.orderId,
            attemptNumber: message.attemptNumber,
            correlationId: message.correlationId,
            processingToken,
            deadlineAt,
          },
        });

        return { claimed: true, processingToken, deadlineAt };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return { claimed: false, reason: "duplicate_or_terminal" };
        }

        throw error;
      }
    });
  }

  public async finishProcessingAttempt(
    input: FinishProcessingAttemptInput,
  ): Promise<FinishProcessingAttemptResult> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.processingAttempt.findUnique({
        where: {
          orderId_attemptNumber: {
            orderId: input.orderId,
            attemptNumber: input.attemptNumber,
          },
        },
      });

      if (attempt === null) {
        return { applied: false, reason: "ignored" };
      }

      if (attempt.finishedAt !== null) {
        return { applied: false, reason: "ignored" };
      }

      if (attempt.processingToken !== input.processingToken) {
        return { applied: false, reason: "stale_token" };
      }

      if (attempt.deadlineAt < input.finishedAt && input.result !== "timeout") {
        await tx.processingAttempt.update({
          where: { id: attempt.id },
          data: { finishedAt: input.finishedAt, result: input.result },
        });
        return { applied: false, reason: "late" };
      }

      const decision = decideProcessingOutcome({
        result: input.result,
        attemptNumber: input.attemptNumber,
        maxAttempts: input.maxAttempts,
      });

      await tx.processingAttempt.update({
        where: { id: attempt.id },
        data: { finishedAt: input.finishedAt, result: input.result },
      });

      await tx.order.update({
        where: { id: input.orderId },
        data: {
          status: decision.orderStatus,
          currentAttempt: input.attemptNumber,
          finalError: "finalError" in decision ? decision.finalError : null,
        },
      });

      if (decision.reservationEffect === "consume") {
        await tx.stockReservation.updateMany({
          where: { orderId: input.orderId, state: "active" },
          data: { state: "consumed", consumedAt: input.finishedAt },
        });
      }

      if (decision.reservationEffect === "release") {
        await this.releaseReservation(tx, input.orderId, input.finishedAt);
      }

      if (decision.retry) {
        const nextOutboxEventId = cryptoUuidGenerator.randomUuid();
        await tx.outboxEvent.create({
          data: {
            id: nextOutboxEventId,
            orderId: input.orderId,
            type: "order.processing.retry",
            payload: {
              version: 1,
              eventId: nextOutboxEventId,
              orderId: input.orderId,
              requestId: input.requestId,
              correlationId: input.correlationId,
              attemptNumber: decision.nextAttemptNumber,
              occurredAt: input.finishedAt.toISOString(),
            },
            availableAt: new Date(input.finishedAt.getTime() + input.retryDelayMs),
          },
        });
      }

      return {
        applied: true,
        scheduledRetry: decision.retry,
        restoredItems: decision.reservationEffect === "release" ? 1 : 0,
      };
    });
  }

  public async expireReservations(now: Date, limit = 100): Promise<ExpireReservationsResult> {
    return this.prisma.$transaction(async (tx) => {
      const claimedReservations = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM stock_reservations
        WHERE state = 'active'
          AND expires_at <= ${now}
        ORDER BY expires_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED`;

      const reservationIds = claimedReservations.map((reservation) => reservation.id);

      if (reservationIds.length === 0) {
        return { expiredReservations: 0, restoredItems: 0 };
      }

      const reservations = await tx.stockReservation.findMany({
        where: { id: { in: reservationIds } },
        include: { items: true },
      });

      let expiredReservations = 0;
      let restoredItems = 0;

      for (const reservation of reservations) {
        const updated = await tx.stockReservation.updateMany({
          where: { id: reservation.id, state: "active" },
          data: { state: "released", releasedAt: now },
        });

        if (updated.count !== 1) {
          continue;
        }

        expiredReservations += 1;

        await tx.order.updateMany({
          where: { id: reservation.orderId, status: { in: ["pending", "retrying", "processing"] } },
          data: { status: "failed", finalError: "RESERVATION_EXPIRED" },
        });

        for (const item of reservation.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { availableQuantity: { increment: item.quantity } },
          });
          restoredItems += 1;
        }
      }

      return { expiredReservations, restoredItems };
    });
  }

  public async recoverAbandonedProcessingAttempts(
    now: Date,
    maxAttempts: number,
    retryDelayMs: number,
    limit = 100,
  ): Promise<{ readonly recoveredAttempts: number }> {
    const attempts = await this.prisma.processingAttempt.findMany({
      where: {
        finishedAt: null,
        deadlineAt: { lte: now },
        order: { status: "processing" },
      },
      orderBy: { deadlineAt: "asc" },
      take: limit,
      include: { order: true },
    });

    let recoveredAttempts = 0;

    for (const attempt of attempts) {
      const result = await this.finishProcessingAttempt({
        orderId: attempt.orderId,
        attemptNumber: attempt.attemptNumber,
        processingToken: attempt.processingToken,
        result: "timeout",
        finishedAt: now,
        maxAttempts,
        retryDelayMs,
        requestId: attempt.order.requestId,
        correlationId: attempt.order.correlationId,
      });

      if (result.applied) {
        recoveredAttempts += 1;
      }
    }

    return { recoveredAttempts };
  }

  public async claimOutboxEvents(
    now: Date,
    limit: number,
    leaseMs: number,
    lockToken: string,
  ): Promise<OutboxEventToPublish[]> {
    const lockedUntil = new Date(now.getTime() + leaseMs);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; payload: Prisma.JsonValue }[]
      >`SELECT id, payload FROM "outbox_events"
        WHERE status = 'pending'
          AND available_at <= ${now}
          AND (locked_until IS NULL OR locked_until < ${now})
        ORDER BY available_at ASC, created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED`;

      if (rows.length === 0) {
        return [];
      }

      await tx.outboxEvent.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { lockToken, lockedUntil },
      });

      return rows.map((row) => ({
        id: row.id,
        lockToken,
        payload: row.payload as OrderProcessingMessage,
      }));
    });
  }

  public async markOutboxPublished(
    eventId: string,
    lockToken: string,
    publishedAt: Date,
  ): Promise<boolean> {
    const updated = await this.prisma.outboxEvent.updateMany({
      where: { id: eventId, lockToken, status: "pending" },
      data: { status: "published", publishedAt, lockToken: null, lockedUntil: null },
    });

    return updated.count === 1;
  }

  private async releaseReservation(
    tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
    orderId: string,
    releasedAt: Date,
  ): Promise<void> {
    const reservations = await tx.stockReservation.findMany({
      where: { orderId, state: "active" },
      include: { items: true },
    });

    for (const reservation of reservations) {
      const updated = await tx.stockReservation.updateMany({
        where: { id: reservation.id, state: "active" },
        data: { state: "released", releasedAt },
      });

      if (updated.count !== 1) {
        continue;
      }

      for (const item of reservation.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { availableQuantity: { increment: item.quantity } },
        });
      }
    }
  }
}
