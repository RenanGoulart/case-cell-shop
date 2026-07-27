import type { ErpResult } from "./erp-result.js";
import type { OrderStatus } from "./order-state.js";

export type ReservationProcessingEffect = "none" | "consume" | "release";

export interface ProcessingDecisionInput {
  readonly result: ErpResult;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
}

export type ProcessingDecision =
  | {
      readonly orderStatus: Extract<OrderStatus, "confirmed">;
      readonly reservationEffect: Extract<ReservationProcessingEffect, "consume">;
      readonly retry: false;
    }
  | {
      readonly orderStatus: Extract<OrderStatus, "retrying">;
      readonly reservationEffect: Extract<ReservationProcessingEffect, "none">;
      readonly retry: true;
      readonly nextAttemptNumber: number;
    }
  | {
      readonly orderStatus: Extract<OrderStatus, "failed">;
      readonly reservationEffect: Extract<ReservationProcessingEffect, "release">;
      readonly retry: false;
      readonly finalError: "ERP_RETRIES_EXHAUSTED" | "ERP_UNAVAILABLE";
    };

export function decideProcessingOutcome(input: ProcessingDecisionInput): ProcessingDecision {
  if (input.attemptNumber < 1) {
    throw new Error(`attemptNumber must be positive: ${input.attemptNumber}`);
  }

  if (input.maxAttempts < 1) {
    throw new Error(`maxAttempts must be positive: ${input.maxAttempts}`);
  }

  if (input.result === "confirmed") {
    return {
      orderStatus: "confirmed",
      reservationEffect: "consume",
      retry: false,
    };
  }

  if (input.result === "unavailable") {
    return {
      orderStatus: "failed",
      reservationEffect: "release",
      retry: false,
      finalError: "ERP_UNAVAILABLE",
    };
  }

  if (input.attemptNumber < input.maxAttempts) {
    return {
      orderStatus: "retrying",
      reservationEffect: "none",
      retry: true,
      nextAttemptNumber: input.attemptNumber + 1,
    };
  }

  return {
    orderStatus: "failed",
    reservationEffect: "release",
    retry: false,
    finalError: "ERP_RETRIES_EXHAUSTED",
  };
}
