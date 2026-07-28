import type { PrismaClient } from "../../generated/prisma/client.js";
import type {
  CatalogSnapshot,
  ProductRepository,
} from "../../modules/catalog/ports/catalog-ports.js";

export class PrismaCatalogRepository implements ProductRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findCatalogSnapshot(): Promise<CatalogSnapshot> {
    const products = await this.prisma.product.findMany({
      orderBy: { id: "asc" },
    });

    return {
      version: 0,
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        priceCents: product.priceCents,
        currency: product.currency,
        availableQuantity: product.availableQuantity,
      })),
    };
  }
}
