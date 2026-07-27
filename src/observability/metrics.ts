import { collectDefaultMetrics, Registry } from "prom-client";

export interface MetricsRegistry {
  readonly registry: Registry;
  readonly contentType: string;
  metrics(): Promise<string>;
}

export function createApiMetricsRegistry(): MetricsRegistry {
  return createMetricsRegistry("casecellshop_api");
}

export function createWorkerMetricsRegistry(): MetricsRegistry {
  return createMetricsRegistry("casecellshop_worker");
}

function createMetricsRegistry(prefix: string): MetricsRegistry {
  const registry = new Registry();
  collectDefaultMetrics({ prefix: `${prefix}_`, register: registry });

  return {
    registry,
    contentType: registry.contentType,
    metrics: () => registry.metrics(),
  };
}
