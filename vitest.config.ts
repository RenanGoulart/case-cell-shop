import { defineConfig, defineProject } from "vitest/config";

export default defineConfig({
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
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      }),
      defineProject({
        test: {
          name: "contract",
          include: ["tests/contract/**/*.test.ts"],
          environment: "node",
        },
      }),
      defineProject({
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
        },
      }),
      defineProject({
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
