import { describe, expect, it } from "vitest";

import { buildApp } from "@/api/app.js";
import { testAppConfig } from "@tests/helpers/app-config.js";

interface OpenApiDocument {
  readonly paths: Record<
    string,
    { readonly get?: { readonly responses?: Record<string, unknown> } }
  >;
}

describe("OpenAPI products coverage", () => {
  it("documents /products and /metrics response contracts", async () => {
    const app = await buildApp(testAppConfig(), {
      products: {
        listProducts: {
          execute: () => Promise.resolve({ status: 204, source: "database", products: [] }),
        },
      },
    });
    await app.ready();

    const document = app.swagger() as OpenApiDocument;

    const productResponses = document.paths["/products"]?.get?.responses;
    const metricsResponses = document.paths["/metrics"]?.get?.responses;

    expect(productResponses).toHaveProperty("200");
    expect(productResponses).toHaveProperty("204");
    expect(productResponses).toHaveProperty("503");
    expect(metricsResponses).toHaveProperty("200");

    await app.close();
  });
});
