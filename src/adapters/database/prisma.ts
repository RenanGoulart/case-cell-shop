import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../generated/prisma/client.js";

export type TransactionClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg(databaseUrl);

  return new PrismaClient({
    adapter,
  });
}

export async function withTransaction<T>(
  prisma: PrismaClient,
  operation: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(operation);
}
