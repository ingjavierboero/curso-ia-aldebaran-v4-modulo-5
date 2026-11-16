/**
 * Lo que devuelve el loader de `/recuperar/:token` (FEAT-008): el enlace sirve, o no se puede usar y
 * hay un motivo para mostrar. Vive fuera de `pages/` para que el router y la página lo compartan sin
 * que la página exporte nada además del componente.
 */
export type ResetTokenCheck =
  | { status: 'valid' }
  | { status: 'invalid' | 'blocked'; message: string };
