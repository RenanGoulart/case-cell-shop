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

class Repository implements ProductRepository {
  public reads = 0;

  public constructor(private readonly snapshot: CatalogSnapshot) {}

  public findCatalogSnapshot(): Promise<CatalogSnapshot> {
    this.reads += 1;
    return Promise.resolve(this.snapshot);
  }
}

class Cache implements CatalogCacheRepository {
  public writes = 0;
  public degraded = false;

  public constructor(
    public readResult: CatalogCacheReadResult,
    private readonly failWrite = false,
  ) {}

  public read(): Promise<CatalogCacheReadResult> {
    return Promise.resolve(this.readResult);
  }

  public write(entry: CatalogCacheEntry): Promise<void> {
    void entry;
    this.writes += 1;
    if (this.failWrite) {
      return Promise.reject(new Error("redis set failed"));
    }

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

class Metrics implements CatalogMetricsPort {
  public redisFailures = 0;
  public fallbacks = 0;
  public hits = 0;
  public misses = 0;

  public observeListDuration(): void {
    return undefined;
  }
  public recordCacheHit(): void {
    this.hits += 1;
  }
  public recordCacheMiss(): void {
    this.misses += 1;
  }
  public recordRedisFailure(): void {
    this.redisFailures += 1;
  }
  public recordFallback(): void {
    this.fallbacks += 1;
  }
  public recordDegradedModeTransition(): void {
    return undefined;
  }
}

describe("catalog cache fallback and recovery", () => {
  it("serves PostgreSQL fallback when Redis GET fails and keeps API behavior available", async () => {
    const cache = new Cache({ state: "unavailable", error: new Error("redis get failed") });
    const metrics = new Metrics();
    const useCase = new ListProductsUseCase(
      {
        repository: new Repository({ version: 1, products: [product] }),
        cache,
        metrics,
        sleeper: new FakeSleeper(),
      },
      { ttlSeconds: 60, databaseArtificialDelayMs: 500 },
    );

    const result = await useCase.execute();

    expect(result.status).toBe(200);
    expect(result.source).toBe("database_fallback");
    expect(cache.degraded).toBe(true);
    expect(metrics.redisFailures).toBe(1);
    expect(metrics.fallbacks).toBe(1);
  });

  it("marks degraded on Redis SET failure and reloads from PostgreSQL", async () => {
    const cache = new Cache({ state: "miss" }, true);
    const useCase = new ListProductsUseCase(
      {
        repository: new Repository({ version: 1, products: [product] }),
        cache,
        metrics: new Metrics(),
        sleeper: new FakeSleeper(),
      },
      { ttlSeconds: 60, databaseArtificialDelayMs: 500 },
    );

    const result = await useCase.execute();

    expect(result.source).toBe("database");
    expect(cache.degraded).toBe(true);
    expect(cache.writes).toBe(1);
  });

  it("keeps Redis hit faster by skipping the documented 500ms database delay", async () => {
    const sleeper = new FakeSleeper();
    const useCase = new ListProductsUseCase(
      {
        repository: new Repository({ version: 1, products: [product] }),
        cache: new Cache({
          state: "hit",
          entry: { version: 1, products: [product], cachedAt: "2026-07-27T00:00:00.000Z" },
        }),
        metrics: new Metrics(),
        sleeper,
      },
      { ttlSeconds: 60, databaseArtificialDelayMs: 500 },
    );

    await useCase.execute();

    expect(sleeper.sleeps).toEqual([]);
  });
});
