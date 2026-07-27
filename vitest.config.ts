import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, defineProject } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

const resolve = {
  alias: {
    "@": path.join(projectRoot, "src"),
    "@tests": path.join(projectRoot, "tests"),
  },
};

export default defineConfig({
  resolve,
  test: {
    globals: false,
    isolate: true,
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
    },
    projects: [
      defineProject({
        resolve,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      }),
      defineProject({
        resolve,
        test: {
          name: "contract",
          include: ["tests/contract/**/*.test.ts"],
          environment: "node",
        },
      }),
      defineProject({
        resolve,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
        },
      }),
      defineProject({
        resolve,
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.ts"],
          environment: "node",
          testTimeout: 60_000,
        },
      }),
    ],
  },
});
