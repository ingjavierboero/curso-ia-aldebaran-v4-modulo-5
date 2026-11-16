/** El email no tiene un formato válido o supera los 254 caracteres (usuarios y email de facturación). */
export class InvalidEmail extends Error {
  override readonly name = 'InvalidEmail';

  constructor(message = 'El email no tiene un formato válido') {
    super(message);
  }
}
