import type { WorkerOperationalMetrics } from "../observability/metrics.js";
import type { OrderProcessingMessage } from "./schemas/order-processing-message.js";

export type OutboxPublishableStatus = "pending" | "processing" | "published";

export interface OutboxClaimTokenCheck {
  readonly currentStatus: OutboxPublishableStatus;
  readonly currentLockToken: string | null;
  readonly expectedLockToken: string;
}

export interface OutboxRepository {
  claimOutboxEvents(
    now: Date,
    limit: number,
    leaseMs: number,
    lockToken: string,
  ): Promise<OutboxEventToPublish[]>;
  markOutboxPublished(eventId: string, lockToken: string, publishedAt: Date): Promise<boolean>;
}

export interface OutboxEventToPublish {
  readonly id: string;
  readonly lockToken: string;
  readonly payload: OrderProcessingMessage;
}

export interface OrderMessagePublisher {
  publish(message: OrderProcessingMessage): Promise<void>;
}

export interface OutboxPublisherOptions {
  readonly repository: OutboxRepository;
  readonly publisher: OrderMessagePublisher;
  readonly clock: { now(): Date };
  readonly uuidGenerator: { randomUuid(): string };
  readonly batchSize: number;
  readonly leaseMs: number;
  readonly metrics?: WorkerOperationalMetrics;
}

export function buildOutboxClaimSql(): string {
  return [
    'SELECT * FROM "outbox_events"',
    "WHERE status IN ('pending', 'processing')",
    "AND available_at <= $1",
    "AND (status = 'pending' OR locked_until IS NULL OR locked_until < $1)",
    "ORDER BY available_at ASC, created_at ASC, attempt_number ASC",
    "LIMIT $2",
    "FOR UPDATE SKIP LOCKED",
    "UPDATE status = 'processing', lock_token = $3, locked_at = $1, locked_until = $4, publish_attempts = publish_attempts + 1",
  ].join(" ");
}

export function shouldMarkOutboxPublished(input: OutboxClaimTokenCheck): boolean {
  return input.currentStatus === "processing" && input.currentLockToken === input.expectedLockToken;
}

export class OutboxPublisher {
  public constructor(private readonly options: OutboxPublisherOptions) {}

  public async runOnce(): Promise<number> {
    const now = this.options.clock.now();
    const lockToken = this.options.uuidGenerator.randomUuid();
    const events = await this.options.repository.claimOutboxEvents(
      now,
      this.options.batchSize,
      this.options.leaseMs,
      lockToken,
    );

    let published = 0;

    for (const event of events) {
      try {
        await this.options.publisher.publish(event.payload);
      } catch (error) {
        this.options.metrics?.recordOutboxPublishFailed();
        throw error;
      }

      const marked = await this.options.repository.markOutboxPublished(
        event.id,
        event.lockToken,
        this.options.clock.now(),
      );

      if (marked) {
        published += 1;
        this.options.metrics?.recordOutboxPublished();
      }
    }

    return published;
  }
}
