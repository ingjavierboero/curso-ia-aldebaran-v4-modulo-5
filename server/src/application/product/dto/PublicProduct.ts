import type { Currency } from '../../../domain/product/Price.js';
import type { Product, ProductStatus } from '../../../domain/product/Product.js';

/**
 * Lo que los casos de uso devuelven de un producto. El precio viaja como texto con 2 decimales
 * (`"15000.50"`), nunca como número (NFR-03).
 */
export interface PublicProduct {
  id: string;
  name: string;
  price: string;
  currency: Currency;
  status: ProductStatus;
  createdAt: string;
}

export function toPublicProduct(product: Product): PublicProduct {
  return {
    id: product.id,
    name: product.name,
    price: product.price.toDecimalString(),
    currency: product.price.currency,
    status: product.status,
    createdAt: product.createdAt.toISOString(),
  };
}
