import { Product, SaleEntry } from '@/types';

export const isTwentyMlCan = (product?: Pick<Product, 'name' | 'bottleSize'>) => {
  if (!product) return false;
  const details = `${product.name} ${product.bottleSize}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return /\b20\s*ml\b/.test(details) && /\bcan\b/.test(details);
};

export const getSaleCaseQuantity = (
  sale: Pick<SaleEntry, 'productId' | 'quantity'>,
  productsById: ReadonlyMap<string, Product>
) => isTwentyMlCan(productsById.get(sale.productId)) ? 0 : Number(sale.quantity ?? 0);