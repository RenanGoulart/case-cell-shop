import type { RandomGenerator } from "../../../shared/ports/runtime.js";

export const erpResults = [
  "confirmed",
  "temporarily_unavailable",
  "unavailable",
  "timeout",
] as const;

export type ErpResult = (typeof erpResults)[number];

export interface ErpDecision {
  next(): ErpResult;
}

export function classifyErpProbability(value: number): ErpResult {
  if (value < 0 || value >= 1) {
    throw new Error(`ERP probability must be >= 0 and < 1: ${value}`);
  }

  if (value < 0.8) {
    return "confirmed";
  }

  if (value < 0.9) {
    return "temporarily_unavailable";
  }

  if (value < 0.95) {
    return "unavailable";
  }

  return "timeout";
}

export function createForcedErpDecision(result: ErpResult): ErpDecision {
  return {
    next: () => result,
  };
}

export function createProbabilisticErpDecision(randomGenerator: RandomGenerator): ErpDecision {
  return {
    next: () => classifyErpProbability(randomGenerator.next()),
  };
}
