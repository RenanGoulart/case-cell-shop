import { describe, expect, it } from "vitest";

import { buildOutboxClaimSql, shouldMarkOutboxPublished } from "@/worker/outbox-publisher.js";

describe("outbox publisher claim safety", () => {
  it("uses FOR UPDATE SKIP LOCKED and lease/token predicates when claiming events", () => {
    const sql = buildOutboxClaimSql();

    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("locked_until");
    expect(sql).toContain("lock_token");
    expect(sql).toContain("available_at");
  });

  it("marks as published only when the current lock token still matches", () => {
    expect(
      shouldMarkOutboxPublished({ currentLockToken: "token-a", expectedLockToken: "token-a" }),
    ).toBe(true);
    expect(
      shouldMarkOutboxPublished({ currentLockToken: "token-b", expectedLockToken: "token-a" }),
    ).toBe(false);
    expect(
      shouldMarkOutboxPublished({ currentLockToken: null, expectedLockToken: "token-a" }),
    ).toBe(false);
  });
});
