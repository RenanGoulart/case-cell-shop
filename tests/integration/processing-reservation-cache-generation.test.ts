import { describe, expect, it } from "vitest";

import { PrismaProcessingRepository } from "@/adapters/database/processing-repository.js";

describe("processing reservation cache generation planning", () => {
  it("does not increment CatalogState/cache generation for consume or release effects", () => {
    expect(
      PrismaProcessingRepository.shouldIncrementCatalogGenerationForReservationEffect("consume"),
    ).toBe(false);
    expect(
      PrismaProcessingRepository.shouldIncrementCatalogGenerationForReservationEffect("release"),
    ).toBe(false);
  });
});
