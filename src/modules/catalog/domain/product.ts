import type { CatalogProductRecord } from "../ports/catalog-ports.js";

export interface CatalogProduct {
  readonly id: string;
  readonly name: string;
  readonly price: string;
  readonly currency: string;
  readonly availableQuantity: number;
}

export function toCatalogProduct(record: CatalogProductRecord): CatalogProduct {
  return {
    id: record.id,
    name: record.name,
    price: formatPrice(record.priceCents),
    currency: record.currency,
    availableQuantity: record.availableQuantity,
  };
}

export function formatPrice(priceCents: number): string {
  return (priceCents / 100).toFixed(2);
}
