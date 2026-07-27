import { describe, expect, it } from "vitest";

import { ReservationExpirer } from "@/worker/reservation-expirer.js";

describe("reservation expiration sweeper", () => {
  it("delegates one tick to repository and reports released reservations", async () => {
    const calls: Date[] = [];
    const expirer = new ReservationExpirer({
      repository: {
        expireReservations: (now) => {
          calls.push(now);
          return Promise.resolve({ expiredReservations: 2, restoredItems: 3 });
        },
      },
      clock: { now: () => new Date("2026-07-27T00:05:00.000Z") },
    });

    await expect(expirer.runOnce()).resolves.toEqual({ expiredReservations: 2, restoredItems: 3 });
    expect(calls).toEqual([new Date("2026-07-27T00:05:00.000Z")]);
  });
});
