/** CUIT sin 11 dígitos, con prefijo no admitido o con dígito verificador incorrecto (FR-05). */
export class InvalidCuit extends Error {
  override readonly name = 'InvalidCuit';

  constructor(message = 'El CUIT no es válido') {
    super(message);
  }
}

/** Condición frente al IVA fuera de los códigos admitidos para una Factura C (FR-04). */
export class InvalidIvaCondition extends Error {
  override readonly name = 'InvalidIvaCondition';

  constructor(message = 'La condición frente al IVA no es válida') {
    super(message);
  }
}

/** Otro cliente ya tiene ese CUIT (FR-06, NFR-01). */
export class DuplicateCuit extends Error {
  override readonly name = 'DuplicateCuit';

  constructor(message = 'Ya existe un cliente con ese CUIT') {
    super(message);
  }
}

/** Otro cliente ya tiene ese email de facturación, sin distinguir mayúsculas (FR-07, NFR-01). */
export class DuplicateBillingEmail extends Error {
  override readonly name = 'DuplicateBillingEmail';

  constructor(message = 'Ya existe un cliente con ese email de facturación') {
    super(message);
  }
}

/** El producto ya está asignado a ese cliente (FR-13, AC-14). */
export class ProductAlreadyAssigned extends Error {
  override readonly name = 'ProductAlreadyAssigned';

  constructor(message = 'El producto ya está asignado a ese cliente') {
    super(message);
  }
}

/** Razón social o domicilio vacíos o de más de 200 caracteres (FR-01, S-01). */
export class InvalidClientData extends Error {
  override readonly name = 'InvalidClientData';

  constructor(message = 'Los datos del cliente no son válidos') {
    super(message);
  }
}
