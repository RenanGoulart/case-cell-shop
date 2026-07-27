import type { Clock } from "../shared/ports/runtime.js";
import type {
  ExpireReservationsResult,
  ProcessingRepository,
} from "../modules/orders/ports/processing-ports.js";

export interface ReservationExpirerOptions {
  readonly repository: Pick<ProcessingRepository, "expireReservations">;
  readonly clock: Clock;
  readonly limit?: number;
}

export class ReservationExpirer {
  public constructor(private readonly options: ReservationExpirerOptions) {}

  public runOnce(): Promise<ExpireReservationsResult> {
    return this.options.repository.expireReservations(this.options.clock.now(), this.options.limit);
  }
}
