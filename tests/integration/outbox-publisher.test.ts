import { describe, expect, it } from "vitest";

import { buildOutboxClaimSql, shouldMarkOutboxPublished } from "@/worker/outbox-publisher.js";

describe("outbox publisher claim safety", () => {
  it("moves pending or expired processing events to processing with lease/token metadata", () => {
    const sql = buildOutboxClaimSql();

    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("status IN ('pending', 'processing')");
    expect(sql).toContain("status = 'processing'");
    expect(sql).toContain("locked_at");
    expect(sql).toContain("locked_until");
    expect(sql).toContain("lock_token");
    expect(sql).toContain("publish_attempts = publish_attempts + 1");
    expect(sql).toContain("attempt_number");
    expect(sql).toContain("available_at");
  });

  it("marks as published only when the event is processing and the current lock token still matches", () => {
    expect(
      shouldMarkOutboxPublished({
        currentStatus: "processing",
        currentLockToken: "token-a",
        expectedLockToken: "token-a",
      }),
    ).toBe(true);
    expect(
      shouldMarkOutboxPublished({
        currentStatus: "pending",
        currentLockToken: "token-a",
        expectedLockToken: "token-a",
      }),
    ).toBe(false);
    expect(
      shouldMarkOutboxPublished({
        currentStatus: "processing",
        currentLockToken: "token-b",
        expectedLockToken: "token-a",
      }),
    ).toBe(false);
    expect(
      shouldMarkOutboxPublished({
        currentStatus: "processing",
        currentLockToken: null,
        expectedLockToken: "token-a",
      }),
    ).toBe(false);
  });
});
