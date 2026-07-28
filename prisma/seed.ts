import { fakerPT_BR as faker } from "@faker-js/faker";

export interface SeedProduct {
  readonly id: string;
  readonly name: string;
  readonly priceCents: number;
  readonly currency: "BRL";
  readonly availableQuantity: number;
}

export interface SeedCatalogChangePlan {
  readonly missingProducts: readonly SeedProduct[];
  readonly shouldIncrementCatalogVersion: false;
  readonly cacheRenewalStrategy: "ttl_only";
}

export function buildSeedProducts(seed = 20260727): SeedProduct[] {
  faker.seed(seed);

  return Array.from({ length: 50 }, (_, index) => {
    const id = `case-product-${String(index + 1).padStart(3, "0")}`;
    const name = faker.commerce.productName().normalize("NFC").slice(0, 160);
    const priceCents = faker.number.int({ min: 2_500, max: 500_000 });
    const availableQuantity = faker.number.int({ min: 10, max: 100 });

    return {
      id,
      name,
      priceCents,
      currency: "BRL",
      availableQuantity,
    };
  });
}

export function planSeedCatalogChange(
  candidates: readonly SeedProduct[],
  existingIds: ReadonlySet<string>,
): SeedCatalogChangePlan {
  const missingProducts = candidates.filter((product) => !existingIds.has(product.id));

  return {
    missingProducts,
    shouldIncrementCatalogVersion: false,
    cacheRenewalStrategy: "ttl_only",
  };
}

async function main(): Promise<void> {
  const { createPrismaClient } = await import("../src/adapters/database/prisma.js");
  const { loadConfig } = await import("../src/config/env.js");

  const config = loadConfig();
  const prisma = createPrismaClient(config.databaseUrl);
  const candidates = buildSeedProducts(config.seedFakerSeed);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.product.findMany({
      where: { id: { in: candidates.map((product) => product.id) } },
      select: { id: true },
    });
    const plan = planSeedCatalogChange(candidates, new Set(existing.map((product) => product.id)));

    if (plan.missingProducts.length === 0) {
      return;
    }

    await tx.product.createMany({
      data: [...plan.missingProducts],
      skipDuplicates: true,
    });
  });

  await prisma.$disconnect();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
