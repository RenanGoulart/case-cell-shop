import { describe, expect, it } from "vitest";

import {
  canTransitionReservation,
  markReservationConsumed,
  markReservationExpired,
  markReservationReleased,
  type ReservationState,
} from "@/modules/orders/domain/reservation-state.js";

describe("reservation state transitions", () => {
  it("allows active reservations to be consumed, released or expired once", () => {
    expect(canTransitionReservation("active", "consumed")).toBe(true);
    expect(canTransitionReservation("active", "released")).toBe(true);
    expect(canTransitionReservation("active", "expired")).toBe(true);
  });

  it.each<ReservationState>(["consumed", "released", "expired"])("keeps %s terminal", (state) => {
    expect(canTransitionReservation(state, "active")).toBe(false);
    expect(canTransitionReservation(state, "released")).toBe(false);
    expect(canTransitionReservation(state, "consumed")).toBe(false);
    expect(canTransitionReservation(state, "expired")).toBe(false);
  });

  it("returns single-release markers", () => {
    expect(
      markReservationReleased(
        { state: "active", releasedAt: null },
        new Date("2026-07-27T00:00:00Z"),
      ),
    ).toEqual({
      state: "released",
      releasedAt: new Date("2026-07-27T00:00:00Z"),
    });
    expect(() =>
      markReservationConsumed({ state: "released", consumedAt: null }, new Date()),
    ).toThrow(/Invalid reservation transition/);
  });

  it("returns expiration markers distinct from release markers", () => {
    expect(
      markReservationExpired(
        { state: "active", expiredAt: null },
        new Date("2026-07-27T00:05:00Z"),
      ),
    ).toEqual({
      state: "expired",
      expiredAt: new Date("2026-07-27T00:05:00Z"),
    });
    expect(() =>
      markReservationReleased({ state: "expired", releasedAt: null }, new Date()),
    ).toThrow(/Invalid reservation transition/);
  });
});
