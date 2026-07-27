import { describe, expect, it } from "vitest";

import { ListProductsUseCase } from "@/modules/catalog/application/list-products.js";
import type {
  CatalogCacheEntry,
  CatalogCacheReadResult,
  CatalogCacheRepository,
  CatalogMetricsPort,
  CatalogSnapshot,
  ProductRepository,
} from "@/modules/catalog/ports/catalog-ports.js";
import { FakeSleeper } from "@tests/helpers/runtime.js";

const product = {
  id: "product-1",
  name: "Case Transparente",
  priceCents: 5990,
  currency: "BRL",
  availableQuantity: 12,
};

class FakeRepository implements ProductRepository {
  public reads = 0;

  public constructor(private readonly snapshot: CatalogSnapshot) {}

  public findCatalogSnapshot(): Promise<CatalogSnapshot> {
    this.reads += 1;
    return Promise.resolve(this.snapshot);
  }
}

class FakeCache implements CatalogCacheRepository {
  public writes: CatalogCacheEntry[] = [];
  public degraded = false;

  public constructor(public nextRead: CatalogCacheReadResult) {}

  public read(): Promise<CatalogCacheReadResult> {
    return Promise.resolve(this.nextRead);
  }

  public write(entry: CatalogCacheEntry): Promise<void> {
    this.writes.push(entry);
    return Promise.resolve();
  }

  public invalidate(): Promise<void> {
    return Promise.resolve();
  }

  public markDegraded(): void {
    this.degraded = true;
  }

  public markHealthy(): void {
    this.degraded = false;
  }
}

class FakeMetrics implements CatalogMetricsPort {
  public hits = 0;
  public misses: string[] = [];
  public redisFailures: string[] = [];
  public fallbacks = 0;
  public transitions: string[] = [];
  public durations: string[] = [];

  public observeListDuration(
    _milliseconds: number,
    outcome: Parameters<CatalogMetricsPort["observeListDuration"]>[1],
  ): void {
    this.durations.push(outcome);
  }

  public recordCacheHit(): void {
    this.hits += 1;
  }

  public recordCacheMiss(reason: Parameters<CatalogMetricsPort["recordCacheMiss"]>[0]): void {
    this.misses.push(reason);
  }

  public recordRedisFailure(
    operation: Parameters<CatalogMetricsPort["recordRedisFailure"]>[0],
  ): void {
    this.redisFailures.push(operation);
  }

  public recordFallback(): void {
    this.fallbacks += 1;
  }

  public recordDegradedModeTransition(
    state: Parameters<CatalogMetricsPort["recordDegradedModeTransition"]>[0],
  ): void {
    this.transitions.push(state);
  }
}

function createUseCase(
  cache: FakeCache,
  repository = new FakeRepository({ version: 1, products: [product] }),
) {
  const metrics = new FakeMetrics();
  const sleeper = new FakeSleeper();
  const useCase = new ListProductsUseCase(
    { repository, cache, metrics, sleeper },
    { ttlSeconds: 60, databaseArtificialDelayMs: 500 },
  );

  return { useCase, repository, cache, metrics, sleeper };
}

describe("ListProductsUseCase cache decisions", () => {
  it("uses a valid cache hit without artificial database delay", async () => {
    const { useCase, metrics, sleeper } = createUseCase(
      new FakeCache({
        state: "hit",
        entry: { version: 1, products: [product], cachedAt: "2026-07-27T00:00:00.000Z" },
      }),
    );

    const result = await useCase.execute();

    expect(result.status).toBe(200);
    expect(result.source).toBe("cache");
    expect(result.products[0]).toMatchObject({ price: "59.90" });
    expect(metrics.hits).toBe(1);
    expect(sleeper.sleeps).toEqual([]);
  });

  it("refreshes from database on miss and applies the documented 500ms local delay", async () => {
    const { useCase, cache, metrics, sleeper } = createUseCase(new FakeCache({ state: "miss" }));

    const result = await useCase.execute();

    expect(result.status).toBe(200);
    expect(result.source).toBe("database");
    expect(cache.writes).toHaveLength(1);
    expect(metrics.misses).toEqual(["miss"]);
    expect(sleeper.sleeps).toEqual([500]);
  });

  it("returns 204 when database catalog is empty", async () => {
    const repository = new FakeRepository({ version: 1, products: [] });
    const { useCase } = createUseCase(new FakeCache({ state: "miss" }), repository);

    const result = await useCase.execute();

    expect(result).toMatchObject({ status: 204, products: [] });
  });

  it("falls back to PostgreSQL and marks degraded when Redis read fails", async () => {
    const { useCase, cache, metrics } = createUseCase(
      new FakeCache({ state: "unavailable", error: new Error("redis down") }),
    );

    const result = await useCase.execute();

    expect(result.source).toBe("database_fallback");
    expect(cache.degraded).toBe(true);
    expect(metrics.redisFailures).toEqual(["read"]);
    expect(metrics.fallbacks).toBe(1);
  });

  it("refreshes when cache version mismatches current catalog version", async () => {
    const { useCase, metrics } = createUseCase(
      new FakeCache({
        state: "hit",
        entry: { version: 0, products: [product], cachedAt: "2026-07-27T00:00:00.000Z" },
      }),
    );

    const result = await useCase.execute();

    expect(result.source).toBe("database");
    expect(metrics.misses).toEqual(["version_mismatch"]);
  });

  it("refreshes when cached payload is invalid", async () => {
    const { useCase, metrics } = createUseCase(new FakeCache({ state: "invalid" }));

    const result = await useCase.execute();

    expect(result.source).toBe("database");
    expect(metrics.misses).toEqual(["invalid"]);
  });
});
