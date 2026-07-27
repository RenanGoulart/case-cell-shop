import { describe, expect, it } from "vitest";

import {
  canTransitionReservation,
  markReservationConsumed,
  markReservationReleased,
  type ReservationState,
} from "@/modules/orders/domain/reservation-state.js";

describe("reservation state transitions", () => {
  it("allows active reservations to be consumed or released once", () => {
    expect(canTransitionReservation("active", "consumed")).toBe(true);
    expect(canTransitionReservation("active", "released")).toBe(true);
  });

  it.each<ReservationState>(["consumed", "released"])("keeps %s terminal", (state) => {
    expect(canTransitionReservation(state, "active")).toBe(false);
    expect(canTransitionReservation(state, "released")).toBe(false);
    expect(canTransitionReservation(state, "consumed")).toBe(false);
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
});
