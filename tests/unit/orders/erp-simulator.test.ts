import { describe, expect, it } from "vitest";

import {
  classifyErpProbability,
  createForcedErpDecision,
  type ErpResult,
} from "@/modules/orders/domain/erp-result.js";
import { SeededRandomGenerator } from "@tests/helpers/runtime.js";

describe("ERP result decision model", () => {
  it.each<ErpResult>(["confirmed", "temporarily_unavailable", "unavailable", "timeout"])(
    "supports forced %s result",
    (result) => {
      expect(createForcedErpDecision(result).next()).toBe(result);
    },
  );

  it("classifies probability boundaries as 80/10/5/5", () => {
    expect(classifyErpProbability(0)).toBe("confirmed");
    expect(classifyErpProbability(0.799_999)).toBe("confirmed");
    expect(classifyErpProbability(0.8)).toBe("temporarily_unavailable");
    expect(classifyErpProbability(0.899_999)).toBe("temporarily_unavailable");
    expect(classifyErpProbability(0.9)).toBe("unavailable");
    expect(classifyErpProbability(0.949_999)).toBe("unavailable");
    expect(classifyErpProbability(0.95)).toBe("timeout");
  });

  it("keeps seeded probabilistic distribution within local tolerance", () => {
    const rng = new SeededRandomGenerator(20260727);
    const counts: Record<ErpResult, number> = {
      confirmed: 0,
      temporarily_unavailable: 0,
      unavailable: 0,
      timeout: 0,
    };

    for (let index = 0; index < 1_000; index += 1) {
      counts[classifyErpProbability(rng.next())] += 1;
    }

    expect(counts.confirmed / 1_000).toBeGreaterThanOrEqual(0.76);
    expect(counts.confirmed / 1_000).toBeLessThanOrEqual(0.84);
    expect(counts.temporarily_unavailable / 1_000).toBeGreaterThanOrEqual(0.06);
    expect(counts.temporarily_unavailable / 1_000).toBeLessThanOrEqual(0.14);
    expect(counts.unavailable / 1_000).toBeGreaterThanOrEqual(0.01);
    expect(counts.unavailable / 1_000).toBeLessThanOrEqual(0.09);
    expect(counts.timeout / 1_000).toBeGreaterThanOrEqual(0.01);
    expect(counts.timeout / 1_000).toBeLessThanOrEqual(0.09);
  });
});
