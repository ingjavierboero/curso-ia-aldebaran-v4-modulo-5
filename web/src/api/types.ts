/** Lo único que el server devuelve de un usuario (FR-08). Lo comparten `api/` y `store/`. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'consulta';
  status: 'activo' | 'inactivo';
}
