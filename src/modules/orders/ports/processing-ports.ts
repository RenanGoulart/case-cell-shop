import type { ErpResult } from "../domain/erp-result.js";
import type { OrderProcessingMessage } from "../../../worker/schemas/order-processing-message.js";

export interface ClaimedProcessingAttempt {
  readonly claimed: true;
  readonly processingToken: string;
  readonly deadlineAt: Date;
}

export interface IgnoredProcessingAttempt {
  readonly claimed: false;
  readonly reason: "duplicate_or_terminal" | "invalid_state" | "missing_order";
}

export type ClaimProcessingAttemptResult = ClaimedProcessingAttempt | IgnoredProcessingAttempt;

export interface FinishProcessingAttemptInput {
  readonly orderId: string;
  readonly attemptNumber: number;
  readonly processingToken: string;
  readonly result: ErpResult;
  readonly finishedAt: Date;
  readonly maxAttempts: number;
  readonly retryDelayMs: number;
  readonly requestId: string;
  readonly correlationId: string;
}

export interface FinishProcessingAttemptResult {
  readonly applied: boolean;
  readonly scheduledRetry?: boolean;
  readonly restoredItems?: number;
  readonly reason?: "ignored" | "late" | "stale_token";
}

export interface ExpireReservationsResult {
  readonly expiredReservations: number;
  readonly restoredItems: number;
}

export interface ProcessingRepository {
  claimOrderAttempt(message: OrderProcessingMessage): Promise<ClaimProcessingAttemptResult>;
  finishProcessingAttempt(
    input: FinishProcessingAttemptInput,
  ): Promise<FinishProcessingAttemptResult>;
  expireReservations(now: Date, limit?: number): Promise<ExpireReservationsResult>;
}

export interface ErpClient {
  processOrder(message: OrderProcessingMessage): Promise<{ readonly result: ErpResult }>;
}
