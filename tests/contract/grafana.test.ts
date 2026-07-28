import fs from "node:fs";

import { describe, expect, it } from "vitest";

describe("Grafana and Prometheus observability contracts", () => {
  it("scrapes API and worker metrics for Grafana dashboards", () => {
    const prometheus = fs.readFileSync("observability/prometheus/prometheus.yml", "utf8");

    expect(prometheus).toContain("api:3000");
    expect(prometheus).toContain("worker:9091");
  });

  it("provisions Grafana with Prometheus datasource, dashboard provider and CaseCellShop panels", () => {
    const datasource = fs.readFileSync(
      "observability/grafana/provisioning/datasources/prometheus.yml",
      "utf8",
    );
    const provider = fs.readFileSync(
      "observability/grafana/provisioning/dashboards/dashboards.yml",
      "utf8",
    );
    const dashboard = JSON.parse(
      fs.readFileSync("observability/grafana/dashboards/casecellshop-overview.json", "utf8"),
    ) as {
      readonly uid: string;
      readonly title: string;
      readonly panels: readonly {
        readonly title: string;
        readonly targets?: readonly { readonly expr?: string }[];
      }[];
    };

    expect(datasource).toContain("name: Prometheus");
    expect(datasource).toContain("type: prometheus");
    expect(datasource).toContain("url: http://prometheus:9090");
    expect(provider).toContain("path: /var/lib/grafana/dashboards");
    expect(provider).toContain("folder: CaseCellShop");
    expect(dashboard.uid).toBe("casecellshop-overview");
    expect(dashboard.title).toBe("CaseCellShop Overview");
    expect(dashboard.panels.map((panel) => panel.title)).toEqual(
      expect.arrayContaining([
        "Catalog Cache Hits",
        "Catalog Cache Misses",
        "Checkout Accepted",
        "Checkout Rejections",
        "Checkout Acceptance Latency p95",
        "Worker ERP Outcomes",
        "Outbox and Retries",
        "Redis Failures and Fallbacks",
      ]),
    );
    const expressions = JSON.stringify(dashboard.panels.flatMap((panel) => panel.targets ?? []));
    for (const metric of [
      "casecellshop_catalog_cache_hits_total",
      "casecellshop_catalog_cache_misses_total",
      "casecellshop_checkout_accepted_total",
      "casecellshop_checkout_accept_duration_ms_bucket",
      "casecellshop_worker_erp_outcomes_total",
      "casecellshop_worker_outbox_published_total",
      "casecellshop_worker_retries_scheduled_total",
      "casecellshop_catalog_redis_failures_total",
      "casecellshop_catalog_database_fallbacks_total",
    ]) {
      expect(expressions).toContain(metric);
    }
  });
});
