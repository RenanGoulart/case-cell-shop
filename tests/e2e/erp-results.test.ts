import { describe, expect, it } from "vitest";

import { decideProcessingOutcome } from "@/modules/orders/domain/order-processing.js";

describe("ERP result scenarios", () => {
  it("documents terminal and retryable outcomes used by the worker", () => {
    expect(
      decideProcessingOutcome({ result: "confirmed", attemptNumber: 1, maxAttempts: 3 })
        .orderStatus,
    ).toBe("confirmed");
    expect(
      decideProcessingOutcome({
        result: "temporarily_unavailable",
        attemptNumber: 1,
        maxAttempts: 3,
      }),
    ).toMatchObject({
      orderStatus: "retrying",
      retry: true,
      nextAttemptNumber: 2,
    });
    expect(
      decideProcessingOutcome({ result: "timeout", attemptNumber: 1, maxAttempts: 3 }),
    ).toMatchObject({
      orderStatus: "retrying",
      retry: true,
      nextAttemptNumber: 2,
    });
    expect(
      decideProcessingOutcome({ result: "unavailable", attemptNumber: 1, maxAttempts: 3 }),
    ).toMatchObject({
      orderStatus: "failed",
      finalError: "ERP_UNAVAILABLE",
    });
    expect(
      decideProcessingOutcome({ result: "timeout", attemptNumber: 3, maxAttempts: 3 }),
    ).toMatchObject({
      orderStatus: "failed",
      finalError: "ERP_RETRIES_EXHAUSTED",
    });
  });
});
