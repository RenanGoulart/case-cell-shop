import {
  canonicalizeCheckoutPayload,
  hashCanonicalPayload,
  validateCheckoutPayload,
  type CheckoutPayload,
} from "../domain/canonical-payload.js";
import {
  buildAcceptedCheckoutSnapshot,
  mapCheckoutFailureToError,
  validateCheckoutItemsForAcceptance,
  type AcceptedCheckoutSnapshot,
} from "../domain/checkout.js";
import type { CheckoutIdempotencyMetrics, CheckoutRepository } from "../ports/order-ports.js";
import {
  cryptoUuidGenerator,
  systemClock,
  type Clock,
  type UuidGenerator,
} from "../../../shared/ports/runtime.js";
import type { TracePort } from "../../../observability/trace.js";

export interface AcceptCheckoutDependencies {
  readonly repository: CheckoutRepository;
  readonly idempotencyMetrics?: CheckoutIdempotencyMetrics;
  readonly trace?: TracePort;
}

export interface AcceptCheckoutConfig {
  readonly clock?: Clock;
  readonly uuidGenerator?: UuidGenerator;
  readonly idempotencyRetentionHours: number;
  readonly reservationTtlSeconds: number;
}

export interface AcceptCheckoutCommand {
  readonly idempotencyKey: string;
  readonly payload: unknown;
  readonly requestId: string;
  readonly correlationId: string;
}

export class AcceptCheckoutUseCase {
  private readonly clock: Clock;
  private readonly uuidGenerator: UuidGenerator;

  public constructor(
    private readonly dependencies: AcceptCheckoutDependencies,
    private readonly config: AcceptCheckoutConfig,
  ) {
    this.clock = config.clock ?? systemClock;
    this.uuidGenerator = config.uuidGenerator ?? cryptoUuidGenerator;
  }

  public async execute(command: AcceptCheckoutCommand): Promise<AcceptedCheckoutSnapshot> {
    const payload = validateCheckoutPayload(command.payload);
    const items = validateCheckoutItemsForAcceptance(payload.items);
    const now = this.clock.now();
    const orderId = this.uuidGenerator.randomUuid();
    const reservationId = this.uuidGenerator.randomUuid();
    const outboxEventId = this.uuidGenerator.randomUuid();

    const repositorySpan = this.dependencies.trace?.startSpan("checkout.repository_outbox");
    let result;
    try {
      result = await this.dependencies.repository.accept({
        idempotencyKey: command.idempotencyKey,
        requestHash: hashCanonicalPayload(payload),
        canonicalBody: canonicalBody(payload),
        orderId,
        reservationId,
        outboxEventId,
        requestId: command.requestId,
        correlationId: command.correlationId,
        items,
        idempotencyExpiresAt: addHours(now, this.config.idempotencyRetentionHours),
        reservationExpiresAt: addSeconds(now, this.config.reservationTtlSeconds),
        occurredAt: now,
        outboxPayload: {
          version: 1,
          eventId: outboxEventId,
          orderId,
          requestId: command.requestId,
          correlationId: command.correlationId,
          attemptNumber: 1,
          occurredAt: now.toISOString(),
        },
      });
    } finally {
      repositorySpan?.end();
    }

    if (result.outcome === "accepted") {
      this.dependencies.idempotencyMetrics?.recordCreated();
      return buildAcceptedCheckoutSnapshot(result.orderId);
    }

    if (result.outcome === "replayed") {
      this.dependencies.idempotencyMetrics?.recordReplay();
      return buildAcceptedCheckoutSnapshot(result.orderId, result.status);
    }

    if (result.outcome === "idempotency_conflict") {
      this.dependencies.idempotencyMetrics?.recordConflict();
    }

    throw mapCheckoutFailureToError(
      result.outcome === "product_not_found"
        ? { reason: result.outcome, productIds: result.productIds }
        : { reason: result.outcome },
    );
  }
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function canonicalBody(payload: CheckoutPayload): CheckoutPayload {
  return JSON.parse(canonicalizeCheckoutPayload(payload)) as CheckoutPayload;
}
