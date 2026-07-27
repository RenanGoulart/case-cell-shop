import type { CatalogCacheRepository } from "../ports/catalog-ports.js";
import type { CatalogInvalidationPort } from "../../orders/ports/order-ports.js";

export class InvalidateCatalogUseCase implements CatalogInvalidationPort {
  public constructor(private readonly cache: Pick<CatalogCacheRepository, "invalidate">) {}

  public async invalidate(): Promise<void> {
    await this.cache.invalidate();
  }
}
