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

class SlowRepository implements ProductRepository {
  public reads = 0;
  public constructor(private readonly snapshot: CatalogSnapshot) {}

  public async findCatalogSnapshot(): Promise<CatalogSnapshot> {
    this.reads += 1;
    await Promise.resolve();
    return this.snapshot;
  }
}

class MissCache implements CatalogCacheRepository {
  public writes = 0;

  public read(): Promise<CatalogCacheReadResult> {
    return Promise.resolve({ state: "miss" });
  }

  public write(entry: CatalogCacheEntry): Promise<void> {
    void entry;
    this.writes += 1;
    return Promise.resolve();
  }

  public invalidate(): Promise<void> {
    return Promise.resolve();
  }
  public markDegraded(): void {
    return undefined;
  }
  public markHealthy(): void {
    return undefined;
  }
}

class NoopMetrics implements CatalogMetricsPort {
  public observeListDuration(): void {
    return undefined;
  }
  public recordCacheHit(): void {
    return undefined;
  }
  public recordCacheMiss(): void {
    return undefined;
  }
  public recordRedisFailure(): void {
    return undefined;
  }
  public recordFallback(): void {
    return undefined;
  }
  public recordDegradedModeTransition(): void {
    return undefined;
  }
}

describe("catalog concurrent cache refresh", () => {
  it("coalesces concurrent cache misses into a single refresh", async () => {
    const repository = new SlowRepository({ version: 1, products: [product] });
    const cache = new MissCache();
    const dependencies = {
      repository,
      cache,
      metrics: new NoopMetrics(),
      sleeper: new FakeSleeper(),
    };
    const first = new ListProductsUseCase(dependencies, {
      ttlSeconds: 60,
      databaseArtificialDelayMs: 500,
    });
    const second = new ListProductsUseCase(dependencies, {
      ttlSeconds: 60,
      databaseArtificialDelayMs: 500,
    });

    const [firstResult, secondResult] = await Promise.all([first.execute(), second.execute()]);

    expect(firstResult.products).toEqual(secondResult.products);
    expect(repository.reads).toBe(1);
    expect(cache.writes).toBe(1);
  });
});
