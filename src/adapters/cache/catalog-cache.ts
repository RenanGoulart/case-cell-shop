import { z } from "zod";

import { redisNamespace, type RedisClientAdapter } from "./redis-client.js";
import type {
  CatalogCacheEntry,
  CatalogCacheReadResult,
  CatalogCacheRepository,
} from "../../modules/catalog/ports/catalog-ports.js";

export const catalogProductsCacheKey = redisNamespace + ":products";

const cachedProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string(),
  availableQuantity: z.number().int().nonnegative(),
});

const catalogCacheEntrySchema = z.object({
  version: z.number().int().nonnegative(),
  products: z.array(cachedProductSchema),
  cachedAt: z.iso.datetime(),
});

export class RedisCatalogCache implements CatalogCacheRepository {
  public constructor(private readonly redis: RedisClientAdapter) {}

  public async read(): Promise<CatalogCacheReadResult> {
    try {
      const payload = await this.redis.client.get(catalogProductsCacheKey);
      if (payload === null) {
        return { state: "miss" };
      }

      const parsed = catalogCacheEntrySchema.safeParse(JSON.parse(payload));
      if (!parsed.success) {
        return { state: "invalid" };
      }

      return { state: "hit", entry: parsed.data };
    } catch (error) {
      return { state: "unavailable", error };
    }
  }

  public async write(entry: CatalogCacheEntry, ttlSeconds: number): Promise<void> {
    await this.redis.client.set(catalogProductsCacheKey, JSON.stringify(entry), {
      EX: ttlSeconds,
    });
  }

  public async invalidate(): Promise<void> {
    await this.redis.client.del(catalogProductsCacheKey);
  }

  public markDegraded(error: unknown): void {
    this.redis.markDegraded(error);
  }

  public markHealthy(): void {
    this.redis.markHealthy();
  }
}
