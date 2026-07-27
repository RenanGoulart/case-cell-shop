import type { OrderProcessingMessage } from "./schemas/order-processing-message.js";

export interface OutboxClaimTokenCheck {
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
}

export function buildOutboxClaimSql(): string {
  return [
    'SELECT * FROM "outbox_events"',
    "WHERE status = 'pending'",
    "AND available_at <= $1",
    "AND (locked_until IS NULL OR locked_until < $1)",
    "ORDER BY available_at ASC, created_at ASC",
    "LIMIT $2",
    "FOR UPDATE SKIP LOCKED",
    "UPDATE lock_token = $3, locked_until = $4",
  ].join(" ");
}

export function shouldMarkOutboxPublished(input: OutboxClaimTokenCheck): boolean {
  return input.currentLockToken === input.expectedLockToken;
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
      await this.options.publisher.publish(event.payload);
      const marked = await this.options.repository.markOutboxPublished(
        event.id,
        event.lockToken,
        this.options.clock.now(),
      );

      if (marked) {
        published += 1;
      }
    }

    return published;
  }
}
