import { AppError } from "../../../shared/errors.js";
import { systemClock, type Clock } from "../../../shared/ports/runtime.js";
import { toCatalogProduct, type CatalogProduct } from "../domain/product.js";
import type { CatalogCacheEntry, ListProductsDependencies } from "../ports/catalog-ports.js";

export type CatalogSource = "cache" | "database" | "database_fallback";

export interface ListProductsConfig {
  readonly ttlSeconds: number;
  readonly databaseArtificialDelayMs: number;
  readonly clock?: Clock;
}

export interface ListProductsResult {
  readonly status: 200 | 204;
  readonly source: CatalogSource;
  readonly products: readonly CatalogProduct[];
}

const inFlightRefreshes = new WeakMap<ListProductsDependencies, Promise<ListProductsResult>>();

export class ListProductsUseCase {
  private readonly clock: Clock;

  public constructor(
    private readonly dependencies: ListProductsDependencies,
    private readonly config: ListProductsConfig,
  ) {
    this.clock = config.clock ?? systemClock;
  }

  public async execute(): Promise<ListProductsResult> {
    const started = this.clock.now().getTime();
    const cacheResult = await this.dependencies.cache.read();

    if (cacheResult.state === "hit") {
      const currentVersion = await this.loadCurrentVersionWithoutArtificialDelay();
      if (cacheResult.entry.version === currentVersion) {
        this.dependencies.metrics.recordCacheHit();
        const result = this.toResult(cacheResult.entry.products, "cache");
        this.dependencies.metrics.observeListDuration(
          this.elapsedSince(started),
          result.status === 204 ? "empty" : "hit",
        );
        return result;
      }

      this.dependencies.metrics.recordCacheMiss("version_mismatch");
      return this.refreshWithSingleFlight(started, "database");
    }

    if (cacheResult.state === "invalid") {
      this.dependencies.metrics.recordCacheMiss("invalid");
      return this.refreshWithSingleFlight(started, "database");
    }

    if (cacheResult.state === "miss") {
      this.dependencies.metrics.recordCacheMiss("miss");
      return this.refreshWithSingleFlight(started, "database");
    }

    this.dependencies.metrics.recordRedisFailure("read");
    this.dependencies.cache.markDegraded(cacheResult.error);
    this.dependencies.metrics.recordDegradedModeTransition("degraded");
    this.dependencies.metrics.recordFallback();

    try {
      return await this.refreshFromDatabase(started, "database_fallback", false);
    } catch (error) {
      throw new AppError("CATALOG_UNAVAILABLE", "Catalog is temporarily unavailable", 503, {
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  private async refreshWithSingleFlight(
    started: number,
    source: CatalogSource,
  ): Promise<ListProductsResult> {
    const current = inFlightRefreshes.get(this.dependencies);
    if (current !== undefined) {
      return current;
    }

    const refresh = this.refreshFromDatabase(started, source, true).finally(() => {
      inFlightRefreshes.delete(this.dependencies);
    });
    inFlightRefreshes.set(this.dependencies, refresh);
    return refresh;
  }

  private async refreshFromDatabase(
    started: number,
    source: CatalogSource,
    shouldWriteCache: boolean,
  ): Promise<ListProductsResult> {
    if (this.config.databaseArtificialDelayMs > 0) {
      await this.dependencies.sleeper.sleep(this.config.databaseArtificialDelayMs);
    }

    const snapshot = await this.dependencies.repository.findCatalogSnapshot();
    const result = this.toResult(snapshot.products, source);

    if (shouldWriteCache) {
      const entry: CatalogCacheEntry = {
        version: snapshot.version,
        products: snapshot.products,
        cachedAt: this.clock.now().toISOString(),
      };

      try {
        await this.dependencies.cache.write(entry, this.config.ttlSeconds);
        this.dependencies.cache.markHealthy();
        this.dependencies.metrics.recordDegradedModeTransition("healthy");
      } catch (error) {
        this.dependencies.metrics.recordRedisFailure("write");
        this.dependencies.cache.markDegraded(error);
        this.dependencies.metrics.recordDegradedModeTransition("degraded");
      }
    }

    this.dependencies.metrics.observeListDuration(
      this.elapsedSince(started),
      result.status === 204 ? "empty" : source === "database_fallback" ? "fallback" : "miss",
    );
    return result;
  }

  private async loadCurrentVersionWithoutArtificialDelay(): Promise<number> {
    const snapshot = await this.dependencies.repository.findCatalogSnapshot();
    return snapshot.version;
  }

  private toResult(
    records: readonly CatalogCacheEntry["products"][number][],
    source: CatalogSource,
  ): ListProductsResult {
    const products = records.map(toCatalogProduct);
    return {
      status: products.length === 0 ? 204 : 200,
      source,
      products,
    };
  }

  private elapsedSince(started: number): number {
    return Math.max(0, this.clock.now().getTime() - started);
  }
}
