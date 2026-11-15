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

export class InvalidRole extends Error {
  override readonly name = 'InvalidRole';

  constructor(message = 'El perfil debe ser admin, editor o consulta') {
    super(message);
  }
}

/** Otro usuario ya tiene ese email (sin distinguir mayúsculas, FR-03). */
export class EmailAlreadyInUse extends Error {
  override readonly name = 'EmailAlreadyInUse';

  constructor(message = 'Ya existe un usuario con ese email') {
    super(message);
  }
}

/** La acción dejaría al sistema sin ningún Admin Activo (FR-09). */
export class LastActiveAdmin extends Error {
  override readonly name = 'LastActiveAdmin';

  constructor(message = 'No se puede dejar el sistema sin un Admin Activo') {
    super(message);
  }
}

export class UserNotFound extends Error {
  override readonly name = 'UserNotFound';

  constructor(message = 'El usuario no existe') {
    super(message);
  }
}
