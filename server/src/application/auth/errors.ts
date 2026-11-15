/** Mismo error para email inexistente, contraseña incorrecta y usuario Inactivo (D-02). */
export class InvalidCredentials extends Error {
  override readonly name = 'InvalidCredentials';

  constructor(message = 'Email o contraseña incorrectos') {
    super(message);
  }
}

/** Al cambiar la propia contraseña, la actual no verifica (FEAT-007, FR-04). */
export class IncorrectCurrentPassword extends Error {
  override readonly name = 'IncorrectCurrentPassword';

  constructor(message = 'La contraseña actual es incorrecta') {
    super(message);
  }
}

export class Unauthenticated extends Error {
  override readonly name = 'Unauthenticated';

  constructor(message = 'No autenticado') {
    super(message);
  }
}

export class FirstAdminAlreadyExists extends Error {
  override readonly name = 'FirstAdminAlreadyExists';

  constructor(message = 'El primer Admin ya fue registrado') {
    super(message);
  }
}
