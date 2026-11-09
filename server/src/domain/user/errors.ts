export class InvalidEmail extends Error {
  override readonly name = 'InvalidEmail';

  constructor(message = 'El email no tiene un formato válido') {
    super(message);
  }
}

export class WeakPassword extends Error {
  override readonly name = 'WeakPassword';

  constructor(message = 'La contraseña debe tener entre 8 y 1024 caracteres') {
    super(message);
  }
}

export class InvalidName extends Error {
  override readonly name = 'InvalidName';

  constructor(message = 'El nombre debe tener entre 1 y 100 caracteres') {
    super(message);
  }
}
