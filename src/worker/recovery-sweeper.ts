import type { Clock } from "../shared/ports/runtime.js";

export interface RecoveryRepository {
  recoverAbandonedProcessingAttempts(
    now: Date,
    maxAttempts: number,
    retryDelayMs: number,
  ): Promise<{ readonly recoveredAttempts: number }>;
}

export interface RecoverySweeperOptions {
  readonly repository: RecoveryRepository;
  readonly clock: Clock;
  readonly maxAttempts: number;
  readonly retryDelayMs: number;
}

export class RecoverySweeper {
  public constructor(private readonly options: RecoverySweeperOptions) {}

  public runOnce(): Promise<{ readonly recoveredAttempts: number }> {
    return this.options.repository.recoverAbandonedProcessingAttempts(
      this.options.clock.now(),
      this.options.maxAttempts,
      this.options.retryDelayMs,
    );
  }
}
