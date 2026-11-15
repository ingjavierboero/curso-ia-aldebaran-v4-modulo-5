/** El perfil del usuario no permite la acción, o el usuario ya no está Activo (FR-11, FR-12). */
export class Forbidden extends Error {
  override readonly name = 'Forbidden';

  constructor(message = 'No tenés permiso para realizar esta acción') {
    super(message);
  }
}
