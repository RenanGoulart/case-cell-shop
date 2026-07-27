export const reservationStates = ["active", "consumed", "released"] as const;

export type ReservationState = (typeof reservationStates)[number];

export interface ReservationMarker {
  readonly state: ReservationState;
  readonly consumedAt?: Date | null;
  readonly releasedAt?: Date | null;
}

const allowedTransitions: ReadonlyMap<ReservationState, ReadonlySet<ReservationState>> = new Map([
  ["active", new Set(["consumed", "released"])],
  ["consumed", new Set()],
  ["released", new Set()],
]);

export function canTransitionReservation(from: ReservationState, to: ReservationState): boolean {
  return allowedTransitions.get(from)?.has(to) ?? false;
}

export function markReservationConsumed(
  reservation: ReservationMarker,
  consumedAt: Date,
): ReservationMarker {
  assertReservationTransition(reservation.state, "consumed");
  return { ...reservation, state: "consumed", consumedAt };
}

export function markReservationReleased(
  reservation: ReservationMarker,
  releasedAt: Date,
): ReservationMarker {
  assertReservationTransition(reservation.state, "released");
  return { ...reservation, state: "released", releasedAt };
}

function assertReservationTransition(from: ReservationState, to: ReservationState): void {
  if (!canTransitionReservation(from, to)) {
    throw new Error(`Invalid reservation transition: ${from} -> ${to}`);
  }
}
