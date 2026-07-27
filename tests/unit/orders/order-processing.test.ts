import { describe, expect, it } from "vitest";

import { decideProcessingOutcome } from "@/modules/orders/domain/order-processing.js";

describe("order processing decisions", () => {
  it("confirms and consumes reservation on confirmed ERP result", () => {
    expect(
      decideProcessingOutcome({ result: "confirmed", attemptNumber: 1, maxAttempts: 3 }),
    ).toEqual({
      orderStatus: "confirmed",
      reservationEffect: "consume",
      retry: false,
    });
  });

  it.each(["temporarily_unavailable", "timeout"] as const)(
    "schedules retry for retryable result %s before max attempts",
    (result) => {
      expect(decideProcessingOutcome({ result, attemptNumber: 1, maxAttempts: 3 })).toEqual({
        orderStatus: "retrying",
        reservationEffect: "none",
        retry: true,
        nextAttemptNumber: 2,
      });
    },
  );

  it.each(["temporarily_unavailable", "timeout"] as const)(
    "fails and releases reservation when retryable result %s exhausts attempts",
    (result) => {
      expect(decideProcessingOutcome({ result, attemptNumber: 3, maxAttempts: 3 })).toEqual({
        orderStatus: "failed",
        reservationEffect: "release",
        retry: false,
        finalError: "ERP_RETRIES_EXHAUSTED",
      });
    },
  );

  it("fails definitively and releases reservation on unavailable ERP result", () => {
    expect(
      decideProcessingOutcome({ result: "unavailable", attemptNumber: 1, maxAttempts: 3 }),
    ).toEqual({
      orderStatus: "failed",
      reservationEffect: "release",
      retry: false,
      finalError: "ERP_UNAVAILABLE",
    });
  });
});
