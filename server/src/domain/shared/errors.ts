/** El email no tiene un formato válido o supera los 254 caracteres (usuarios y email de facturación). */
export class InvalidEmail extends Error {
  override readonly name = 'InvalidEmail';

  constructor(message = 'El email no tiene un formato válido') {
    super(message);
  }
}

/** Condición frente al IVA fuera de los códigos admitidos para una Factura C (FR-04 de FEAT-010). */
export class InvalidIvaCondition extends Error {
  override readonly name = 'InvalidIvaCondition';

  constructor(message = 'La condición frente al IVA no es válida') {
    super(message);
  }
}
