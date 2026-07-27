import { describe, expect, it } from "vitest";

import { PrismaOrderStatusRepository } from "@/adapters/database/order-status-repository.js";

describe("PrismaOrderStatusRepository status reads", () => {
  it.each(["pending", "processing", "retrying", "confirmed", "failed"] as const)(
    "maps %s order records to status views",
    (status) => {
      expect(
        PrismaOrderStatusRepository.mapOrderRecord({
          id: "00000000-0000-4000-8000-000000000001",
          status,
          updatedAt: new Date("2026-07-27T12:00:00.000Z"),
          finalError: status === "failed" ? "ERP_UNAVAILABLE" : null,
        }),
      ).toEqual({
        orderId: "00000000-0000-4000-8000-000000000001",
        status,
        updatedAt: new Date("2026-07-27T12:00:00.000Z"),
        finalError: status === "failed" ? "ERP_UNAVAILABLE" : null,
      });
    },
  );

  it("returns null when order is missing", async () => {
    const repository = new PrismaOrderStatusRepository({
      order: {
        findUnique: () => Promise.resolve(null),
      },
    } as never);

    await expect(repository.findById("00000000-0000-4000-8000-000000000404")).resolves.toBeNull();
  });
});
