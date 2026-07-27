import fs from "node:fs";

import { describe, expect, it } from "vitest";

import { buildApp } from "@/api/app.js";
import { testAppConfig } from "@tests/helpers/app-config.js";

interface OpenApiOperation {
  readonly responses?: Record<string, unknown>;
}

interface OpenApiDocument {
  readonly paths: Record<string, Record<string, OpenApiOperation>>;
}

const expectedResponses: Record<string, Record<string, readonly string[]>> = {
  "/products": { get: ["200", "204", "503"] },
  "/checkout": { post: ["202", "400", "404", "409"] },
  "/orders/{orderId}/status": { get: ["200", "400", "404"] },
  "/metrics": { get: ["200"] },
} as const;

describe("OpenAPI drift", () => {
  it("keeps generated API paths and response codes aligned with the static contract", async () => {
    const contract = fs.readFileSync(
      "specs/001-async-checkout-service/contracts/openapi.yaml",
      "utf8",
    );

    for (const path of Object.keys(expectedResponses)) {
      expect(contract).toContain(path + ":");
    }

    const app = await buildApp(testAppConfig(), {
      products: {
        listProducts: {
          execute: () => Promise.resolve({ status: 204, source: "database", products: [] }),
        },
      },
    });

    await app.ready();
    const generated = app.swagger() as OpenApiDocument;

    for (const [path, methods] of Object.entries(expectedResponses)) {
      expect(generated.paths).toHaveProperty(path);

      for (const [method, responses] of Object.entries(methods)) {
        const generatedResponses = generated.paths[path]?.[method]?.responses ?? {};

        for (const responseCode of responses) {
          expect(generatedResponses).toHaveProperty(responseCode);
        }
      }
    }

    await app.close();
  });
});
