import { describe, expect, it } from 'vitest';
import { DuplicateProductName, InvalidProductData } from '../../../src/domain/product/errors.js';
import { Price } from '../../../src/domain/product/Price.js';
import { normalizeProductName, parseProductName, Product } from '../../../src/domain/product/Product.js';

const createdAt = new Date('2026-11-16T12:00:00.000Z');

function newProduct(name = 'Sistema de Turnos'): Product {
  return Product.create({ id: 'p-1', name, price: Price.parse('15000.50', 'ARS'), createdAt });
}

describe('Product', () => {
  // Nombre sin distinguir mayúsculas ni la forma Unicode (D-02, AC-11)
  it('test_product_nombre_normalizado', () => {
    expect(newProduct('Sistema de Turnos').nameNormalized).toBe('sistema de turnos');
    expect(newProduct('  sistema de turnos ').nameNormalized).toBe('sistema de turnos');
    expect(newProduct('  sistema de turnos ').name).toBe('sistema de turnos');

    const nfc = 'Gestión'.normalize('NFC');
    const nfd = 'Gestión'.normalize('NFD');
    expect(nfc).not.toBe(nfd);
    expect(newProduct(nfc).nameNormalized).toBe(newProduct(nfd.toUpperCase()).nameNormalized);
    expect(normalizeProductName(` ${nfd} `)).toBe('gestión'.normalize('NFC'));
    // el nombre se muestra como se ingresó (solo recortado)
    expect(newProduct('Sistema de Turnos').name).toBe('Sistema de Turnos');
  });

  // Nombre: trim, 1–100 (S-01)
  it('test_product_datos_invalidos_rechazados', () => {
    expect(parseProductName(' x ')).toBe('x');
    expect(parseProductName('x'.repeat(100))).toHaveLength(100);

    expect(() => parseProductName('')).toThrow(InvalidProductData);
    expect(() => parseProductName('   ')).toThrow(InvalidProductData);
    expect(() => parseProductName('x'.repeat(101))).toThrow(InvalidProductData);
    expect(() => parseProductName(null as unknown as string)).toThrow(InvalidProductData);
    expect(() => newProduct('')).toThrow(InvalidProductData);
    expect(() => newProduct('x'.repeat(101))).toThrow(InvalidProductData);
    expect(() => newProduct().withData({ name: ' ', price: Price.parse('1', 'ARS') })).toThrow(InvalidProductData);
  });

  it('DuplicateProductName tiene nombre y mensaje en español', () => {
    const error = new DuplicateProductName();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DuplicateProductName');
    expect(error.message).toBe('Ya existe un producto con ese nombre');
  });

  it('Product copia createdAt: mutar la Date pasada no cambia el producto', () => {
    const date = new Date('2026-11-16T12:00:00.000Z');
    const product = Product.create({ id: 'p-2', name: 'Turnos', price: Price.parse('1', 'ARS'), createdAt: date });

    date.setTime(0);

    expect(product.createdAt.toISOString()).toBe('2026-11-16T12:00:00.000Z');
  });

  it('Product.create queda Activo; withData, deactivated y reactivated son inmutables e idempotentes', () => {
    const product = newProduct();
    expect(product.status).toBe('activo');
    expect(product.isActive()).toBe(true);
    expect(product.price.toDecimalString()).toBe('15000.50');
    expect(product.price.currency).toBe('ARS');
    expect(product.createdAt.toISOString()).toBe('2026-11-16T12:00:00.000Z');

    const changed = product.withData({ name: 'Turnos Pro', price: Price.parse('99.9', 'USD') });
    expect(changed).not.toBe(product);
    expect(changed.id).toBe('p-1');
    expect(changed.name).toBe('Turnos Pro');
    expect(changed.nameNormalized).toBe('turnos pro');
    expect(changed.price.toDecimalString()).toBe('99.90');
    expect(changed.price.currency).toBe('USD');
    expect(product.name).toBe('Sistema de Turnos');

    const inactive = product.deactivated();
    expect(inactive.status).toBe('inactivo');
    expect(product.status).toBe('activo');
    expect(inactive.deactivated()).toBe(inactive);
    const active = inactive.reactivated();
    expect(active.status).toBe('activo');
    expect(active.reactivated()).toBe(active);
  });
});
