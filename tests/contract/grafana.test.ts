import fs from "node:fs";

import { describe, expect, it } from "vitest";

describe("Grafana and Prometheus observability contracts", () => {
  it("scrapes API and worker metrics for Grafana dashboards", () => {
    const prometheus = fs.readFileSync("observability/prometheus/prometheus.yml", "utf8");

    expect(prometheus).toContain("api:3000");
    expect(prometheus).toContain("worker:9091");
  });

  it("provisions Grafana with Prometheus and CaseCellShop dashboard panels", () => {
    const datasource = fs.readFileSync(
      "observability/grafana/provisioning/datasources/prometheus.yml",
      "utf8",
    );
    const dashboard = JSON.parse(
      fs.readFileSync("observability/grafana/dashboards/casecellshop-overview.json", "utf8"),
    ) as {
      readonly panels: readonly {
        readonly title: string;
        readonly targets?: readonly { readonly expr?: string }[];
      }[];
    };

    expect(datasource).toContain("url: http://prometheus:9090");
    expect(dashboard.panels.map((panel) => panel.title)).toEqual(
      expect.arrayContaining([
        "Catalog Cache Hits",
        "Catalog Cache Misses",
        "Checkout Accepted",
        "Checkout Rejections",
        "Checkout Acceptance Latency p95",
        "Worker ERP Outcomes",
      ]),
    );
    expect(JSON.stringify(dashboard)).toContain("casecellshop_checkout_accepted_total");
    expect(JSON.stringify(dashboard)).toContain("casecellshop_worker_erp_outcomes_total");
  });
});
