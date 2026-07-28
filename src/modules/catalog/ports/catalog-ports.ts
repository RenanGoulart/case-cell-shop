import type { Sleeper } from "../../../shared/ports/runtime.js";
import type { TracePort } from "../../../observability/trace.js";

export interface CatalogProductRecord {
  readonly id: string;
  readonly name: string;
  readonly priceCents: number;
  readonly currency: string;
  readonly availableQuantity: number;
}

export interface CatalogSnapshot {
  readonly version: number;
  readonly products: readonly CatalogProductRecord[];
}

export interface ProductRepository {
  findCatalogSnapshot(): Promise<CatalogSnapshot>;
}

export interface CatalogCacheEntry {
  readonly version: number;
  readonly products: readonly CatalogProductRecord[];
  readonly cachedAt: string;
}

export type CatalogCacheReadResult =
  | { readonly state: "hit"; readonly entry: CatalogCacheEntry }
  | { readonly state: "miss" }
  | { readonly state: "invalid" }
  | { readonly state: "unavailable"; readonly error: unknown };

export interface CatalogCacheRepository {
  read(): Promise<CatalogCacheReadResult>;
  write(entry: CatalogCacheEntry, ttlSeconds: number): Promise<void>;
  invalidate(): Promise<void>;
  markDegraded(error: unknown): void;
  markHealthy(): void;
}

export interface CatalogMetricsPort {
  observeListDuration(
    milliseconds: number,
    outcome: "hit" | "miss" | "fallback" | "empty" | "unavailable",
  ): void;
  recordCacheHit(): void;
  recordCacheMiss(reason: "miss" | "expired" | "invalid" | "version_mismatch"): void;
  recordRedisFailure(operation: "read" | "write" | "delete"): void;
  recordFallback(): void;
  recordDegradedModeTransition(state: "healthy" | "degraded"): void;
}

export interface ListProductsDependencies {
  readonly repository: ProductRepository;
  readonly cache: CatalogCacheRepository;
  readonly metrics: CatalogMetricsPort;
  readonly sleeper: Sleeper;
  readonly trace?: TracePort;
}
