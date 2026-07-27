import { Counter, Histogram, type Registry } from "prom-client";

import type { CatalogMetricsPort } from "../modules/catalog/ports/catalog-ports.js";

export function createCatalogMetrics(registry: Registry): CatalogMetricsPort {
  const listDuration = new Histogram({
    name: "casecellshop_catalog_list_duration_ms",
    help: "Duration of catalog list operations in milliseconds",
    labelNames: ["outcome"],
    buckets: [5, 25, 50, 100, 250, 500, 750, 1000, 2000],
    registers: [registry],
  });

  const cacheHits = new Counter({
    name: "casecellshop_catalog_cache_hits_total",
    help: "Catalog cache hits",
    registers: [registry],
  });

  const cacheMisses = new Counter({
    name: "casecellshop_catalog_cache_misses_total",
    help: "Catalog cache misses by reason",
    labelNames: ["reason"],
    registers: [registry],
  });

  const redisFailures = new Counter({
    name: "casecellshop_catalog_redis_failures_total",
    help: "Catalog Redis failures by operation",
    labelNames: ["operation"],
    registers: [registry],
  });

  const fallbacks = new Counter({
    name: "casecellshop_catalog_database_fallbacks_total",
    help: "Catalog database fallbacks after Redis failure",
    registers: [registry],
  });

  const degradedTransitions = new Counter({
    name: "casecellshop_catalog_degraded_mode_transitions_total",
    help: "Catalog cache health transitions",
    labelNames: ["state"],
    registers: [registry],
  });

  return {
    observeListDuration(milliseconds, outcome) {
      listDuration.labels(outcome).observe(milliseconds);
    },
    recordCacheHit() {
      cacheHits.inc();
    },
    recordCacheMiss(reason) {
      cacheMisses.labels(reason).inc();
    },
    recordRedisFailure(operation) {
      redisFailures.labels(operation).inc();
    },
    recordFallback() {
      fallbacks.inc();
    },
    recordDegradedModeTransition(state) {
      degradedTransitions.labels(state).inc();
    },
  };
}
