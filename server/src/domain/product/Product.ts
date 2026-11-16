import { InvalidProductData } from './errors.js';
import type { Price } from './Price.js';

export const PRODUCT_STATUSES = ['activo', 'inactivo'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Los datos que un Admin o Editor da de alta o modifica de un producto (FR-08, FR-09). */
export interface ProductData {
  name: string;
  /** Precio de la cuota mensual, con su moneda. */
  price: Price;
}

export interface ProductProps extends ProductData {
  id: string;
  status: ProductStatus;
  createdAt: Date;
}

/**
 * Producto: entidad inmutable. `nameNormalized` se deriva siempre del nombre (D-02). El constructor
 * rehidrata sin validar (lo usa el repositorio); `create` y `withData` validan el nombre.
 */
export class Product {
  readonly id: string;
  readonly name: string;
  /** Clave de unicidad del nombre: sin distinguir mayúsculas ni la forma Unicode (FR-11). */
  readonly nameNormalized: string;
  readonly price: Price;
  readonly status: ProductStatus;
  readonly createdAt: Date;

  constructor(props: ProductProps) {
    this.id = props.id;
    this.name = props.name;
    this.nameNormalized = normalizeProductName(props.name);
    this.price = props.price;
    this.status = props.status;
    // Copia defensiva: la entidad no comparte la Date con quien la creó.
    this.createdAt = new Date(props.createdAt.getTime());
  }

  /** Alta (FR-08): el producto queda Activo. */
  static create(input: ProductData & { id: string; createdAt: Date }): Product {
    return new Product({
      id: input.id,
      name: parseProductName(input.name),
      price: input.price,
      status: 'activo',
      createdAt: input.createdAt,
    });
  }

  isActive(): boolean {
    return this.status === 'activo';
  }

  /** Un producto nuevo con nombre, precio y moneda cambiados (FR-09); id, estado y fecha no cambian. */
  withData(data: ProductData): Product {
    return new Product({ ...this.toProps(), name: parseProductName(data.name), price: data.price });
  }

  /** Desactivación (FR-12): Inactivo. Idempotente: si ya estaba Inactivo devuelve el mismo producto. */
  deactivated(): Product {
    if (this.status === 'inactivo') return this;
    return new Product({ ...this.toProps(), status: 'inactivo' });
  }

  /** Reactivación (FR-12): Activo. Idempotente: si ya estaba Activo devuelve el mismo producto. */
  reactivated(): Product {
    if (this.status === 'activo') return this;
    return new Product({ ...this.toProps(), status: 'activo' });
  }

  private toProps(): ProductProps {
    return {
      id: this.id,
      name: this.name,
      price: this.price,
      status: this.status,
      createdAt: this.createdAt,
    };
  }
}

export const PRODUCT_NAME_MAX_LENGTH = 100;

/** Nombre de producto: trim, de 1 a 100 caracteres (S-01); si no, `InvalidProductData`. */
export function parseProductName(raw: string): string {
  if (typeof raw !== 'string') throw new InvalidProductData();
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > PRODUCT_NAME_MAX_LENGTH) throw new InvalidProductData();
  return trimmed;
}

/** `trim().normalize('NFC').toLowerCase()`: "Sistema de Turnos" y "sistema de turnos" son el mismo. */
export function normalizeProductName(name: string): string {
  return name.trim().normalize('NFC').toLowerCase();
}
