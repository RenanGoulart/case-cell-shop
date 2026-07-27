import type { Logger } from "pino";

import type { WorkerOperationalMetrics } from "../observability/metrics.js";
import type { ErpClient, ProcessingRepository } from "../modules/orders/ports/processing-ports.js";
import {
  orderProcessingMessageSchema,
  type OrderProcessingMessage,
} from "./schemas/order-processing-message.js";

export type OrderConsumerResult =
  | { readonly action: "ack"; readonly reason: "processed" | "duplicate_or_terminal" }
  | { readonly action: "dead_letter"; readonly reason: "invalid_message" };

export interface OrderConsumerOptions {
  readonly repository: Pick<ProcessingRepository, "claimOrderAttempt" | "finishProcessingAttempt">;
  readonly erpClient: ErpClient;
  readonly maxAttempts?: number;
  readonly retryDelayMs?: number;
  readonly metrics?: WorkerOperationalMetrics;
  readonly logger?: Logger;
}

export interface WorkerMessageLogContext {
  readonly correlationId: string;
  readonly orderId: string;
  readonly attemptNumber: number;
  readonly eventId: string;
}

export function createWorkerMessageLogContext(
  message: OrderProcessingMessage,
): WorkerMessageLogContext {
  return {
    correlationId: message.correlationId,
    orderId: message.orderId,
    attemptNumber: message.attemptNumber,
    eventId: message.eventId,
  };
}

export function sanitizeWorkerLogPayload(
  payload: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const sanitized: Record<string, unknown> = {};

  for (const key of ["correlationId", "orderId", "attemptNumber", "eventId"] as const) {
    if (payload[key] !== undefined) {
      sanitized[key] = payload[key];
    }
  }

  return sanitized;
}

export class OrderConsumer {
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;

  public constructor(private readonly options: OrderConsumerOptions) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 5_000;
  }

  public async handle(message: unknown): Promise<OrderConsumerResult> {
    const parsed = orderProcessingMessageSchema.safeParse(message);

    if (!parsed.success) {
      this.options.metrics?.recordMessageProcessed("dead_letter");
      return { action: "dead_letter", reason: "invalid_message" };
    }

    return this.handleValidMessage(parsed.data);
  }

  private async handleValidMessage(message: OrderProcessingMessage): Promise<OrderConsumerResult> {
    const logContext = createWorkerMessageLogContext(message);
    const logger = this.options.logger?.child(logContext);
    logger?.info(
      sanitizeWorkerLogPayload({
        correlationId: logContext.correlationId,
        orderId: logContext.orderId,
        attemptNumber: logContext.attemptNumber,
        eventId: logContext.eventId,
      }),
      "order processing message received",
    );

    const claim = await this.options.repository.claimOrderAttempt(message);

    if (!claim.claimed) {
      this.options.metrics?.recordMessageProcessed("ack");
      logger?.info({ reason: claim.reason }, "order processing message ignored");
      return { action: "ack", reason: "duplicate_or_terminal" };
    }

    const started = performance.now();
    const erpResult = await this.options.erpClient.processOrder(message);
    this.options.metrics?.recordErpOutcome(erpResult.result, performance.now() - started);

    const finish = await this.options.repository.finishProcessingAttempt({
      orderId: message.orderId,
      attemptNumber: message.attemptNumber,
      processingToken: claim.processingToken,
      result: erpResult.result,
      finishedAt: new Date(),
      maxAttempts: this.maxAttempts,
      retryDelayMs: this.retryDelayMs,
      requestId: message.requestId,
      correlationId: message.correlationId,
    });

    if (finish.scheduledRetry === true) {
      this.options.metrics?.recordRetryScheduled();
    }

    if (typeof finish.restoredItems === "number" && finish.restoredItems > 0) {
      this.options.metrics?.recordReservationRestored(finish.restoredItems);
    }

    this.options.metrics?.recordMessageProcessed("ack");
    logger?.info(
      { erpResult: erpResult.result, applied: finish.applied },
      "order processing message handled",
    );

    return { action: "ack", reason: "processed" };
  }
}
