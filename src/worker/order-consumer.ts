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
      return { action: "dead_letter", reason: "invalid_message" };
    }

    return this.handleValidMessage(parsed.data);
  }

  private async handleValidMessage(message: OrderProcessingMessage): Promise<OrderConsumerResult> {
    const claim = await this.options.repository.claimOrderAttempt(message);

    if (!claim.claimed) {
      return { action: "ack", reason: "duplicate_or_terminal" };
    }

    const erpResult = await this.options.erpClient.processOrder(message);

    await this.options.repository.finishProcessingAttempt({
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

    return { action: "ack", reason: "processed" };
  }
}
