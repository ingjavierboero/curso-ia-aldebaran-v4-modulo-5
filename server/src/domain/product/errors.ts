/** Precio cero, negativo, con más de 2 decimales, de más de 999.999.999,99 o con otro formato (FR-10, S-02). */
export class InvalidPrice extends Error {
  override readonly name = 'InvalidPrice';

  constructor(message = 'El precio debe ser mayor a cero, con hasta 2 decimales y como máximo 999999999.99') {
    super(message);
  }
}

/** Moneda distinta de pesos (ARS) o dólares (USD) (FR-08). */
export class InvalidCurrency extends Error {
  override readonly name = 'InvalidCurrency';

  constructor(message = 'La moneda debe ser ARS o USD') {
    super(message);
  }
}

/** Otro producto ya tiene ese nombre, sin distinguir mayúsculas (FR-11, NFR-01). */
export class DuplicateProductName extends Error {
  override readonly name = 'DuplicateProductName';

  constructor(message = 'Ya existe un producto con ese nombre') {
    super(message);
  }
}

/** Nombre de producto vacío o de más de 100 caracteres (FR-08, S-01). */
export class InvalidProductData extends Error {
  override readonly name = 'InvalidProductData';

  constructor(message = 'El nombre del producto debe tener entre 1 y 100 caracteres') {
    super(message);
  }
}
