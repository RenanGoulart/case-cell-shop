import { describe, expect, it } from "vitest";

import { ListProductsUseCase } from "@/modules/catalog/application/list-products.js";
import { AcceptCheckoutUseCase } from "@/modules/orders/application/accept-checkout.js";
import { OrderConsumer } from "@/worker/order-consumer.js";
import { createProductsHandler } from "@/api/routes/products.js";
import type {
  CatalogCacheRepository,
  CatalogMetricsPort,
  ProductRepository,
} from "@/modules/catalog/ports/catalog-ports.js";
import type { CheckoutRepository } from "@/modules/orders/ports/order-ports.js";
import type { TracePort, TraceSpan } from "@/observability/trace.js";
import { FakeClock, FakeSleeper, SequenceUuidGenerator } from "@tests/helpers/runtime.js";

class RecordingTracePort implements TracePort {
  public readonly spans: { name: string; ended: boolean }[] = [];

  public startSpan(name: string): TraceSpan {
    const span = { name, ended: false };
    this.spans.push(span);
    return {
      end: () => {
        span.ended = true;
      },
    };
  }
}

const product = {
  id: "product-1",
  name: "Case",
  priceCents: 1000,
  currency: "BRL",
  availableQuantity: 1,
};

class NoopMetrics implements CatalogMetricsPort {
  public observeListDuration = () => undefined;
  public recordCacheHit = () => undefined;
  public recordCacheMiss = () => undefined;
  public recordRedisFailure = () => undefined;
  public recordFallback = () => undefined;
  public recordDegradedModeTransition = () => undefined;
}

describe("TracePort no-op integration points", () => {
  it("starts and ends a span around HTTP request handling", async () => {
    const trace = new RecordingTracePort();
    const handler = createProductsHandler({
      trace,
      listProducts: {
        execute: () => Promise.resolve({ status: 204, source: "database", products: [] }),
      },
    });
    const reply = { status: () => reply, header: () => reply };

    await handler({ id: "request-1" } as never, reply as never);

    expect(trace.spans).toEqual([{ name: "http.request", ended: true }]);
  });

  it("starts and ends spans around catalog cache read and write boundaries", async () => {
    const trace = new RecordingTracePort();
    const cache: CatalogCacheRepository = {
      read: () => Promise.resolve({ state: "miss" }),
      write: () => Promise.resolve(),
      invalidate: () => Promise.resolve(),
      markDegraded: () => undefined,
      markHealthy: () => undefined,
    };
    const repository: ProductRepository = {
      findCatalogSnapshot: () => Promise.resolve({ version: 0, products: [product] }),
    };
    const useCase = new ListProductsUseCase(
      { repository, cache, metrics: new NoopMetrics(), sleeper: new FakeSleeper(), trace },
      { ttlSeconds: 60, databaseArtificialDelayMs: 0 },
    );

    await useCase.execute();

    expect(trace.spans).toEqual([
      { name: "catalog.cache.read", ended: true },
      { name: "catalog.cache.write", ended: true },
    ]);
  });

  it("starts and ends a span around checkout repository and outbox transaction boundary", async () => {
    const trace = new RecordingTracePort();
    const repository: CheckoutRepository = {
      accept: () =>
        Promise.resolve({ outcome: "accepted", orderId: "00000000-0000-4000-8000-000000000001" }),
    };
    const useCase = new AcceptCheckoutUseCase(
      { repository, trace },
      {
        clock: new FakeClock(new Date("2026-07-27T00:00:00.000Z")),
        uuidGenerator: new SequenceUuidGenerator(),
        idempotencyRetentionHours: 24,
        reservationTtlSeconds: 300,
      },
    );

    await useCase.execute({
      idempotencyKey: "key-1",
      payload: { items: [{ productId: "product-1", quantity: 1 }] },
      requestId: "00000000-0000-4000-8000-000000000010",
      correlationId: "00000000-0000-4000-8000-000000000011",
    });

    expect(trace.spans).toEqual([{ name: "checkout.repository_outbox", ended: true }]);
  });

  it("starts and ends a span around worker message processing", async () => {
    const trace = new RecordingTracePort();
    const consumer = new OrderConsumer({
      trace,
      repository: {
        claimOrderAttempt: () =>
          Promise.resolve({ claimed: true, processingToken: "token-1", deadlineAt: new Date() }),
        finishProcessingAttempt: () => Promise.resolve({ applied: true }),
      },
      erpClient: { processOrder: () => Promise.resolve({ result: "confirmed" }) },
    });

    await consumer.handle({
      version: 1,
      eventId: "00000000-0000-4000-8000-000000000001",
      orderId: "00000000-0000-4000-8000-000000000002",
      requestId: "00000000-0000-4000-8000-000000000003",
      correlationId: "00000000-0000-4000-8000-000000000004",
      attemptNumber: 1,
      occurredAt: "2026-07-27T00:00:00.000Z",
    });

    expect(trace.spans).toEqual([{ name: "worker.process_message", ended: true }]);
  });
});
