import type { WorkerOperationalMetrics } from "../observability/metrics.js";
import type { Clock } from "../shared/ports/runtime.js";
import type {
  ExpireReservationsResult,
  ProcessingRepository,
} from "../modules/orders/ports/processing-ports.js";

export interface ReservationExpirerOptions {
  readonly repository: Pick<ProcessingRepository, "expireReservations">;
  readonly clock: Clock;
  readonly limit?: number;
  readonly metrics?: Pick<WorkerOperationalMetrics, "recordReservationRestored">;
}

export class ReservationExpirer {
  public constructor(private readonly options: ReservationExpirerOptions) {}

  public async runOnce(): Promise<ExpireReservationsResult> {
    const result = await this.options.repository.expireReservations(
      this.options.clock.now(),
      this.options.limit,
    );

    if (result.restoredItems > 0) {
      this.options.metrics?.recordReservationRestored(result.restoredItems);
    }

    return result;
  }
}
