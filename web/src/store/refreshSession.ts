import { getSession } from '../api/authApi';
import { useAuthStore } from './authStore';

/**
 * Tras un 403 en una escritura (el perfil cambió con la pantalla abierta), vuelve a leer la sesión
 * para que la UI deje de ofrecer acciones que el server ya no permite. Un 401 ya lleva al login
 * (`client`); ante otro error se deja el usuario como estaba.
 */
export async function refreshSessionAfterForbidden(): Promise<void> {
  try {
    const user = await getSession();
    useAuthStore.getState().setUser(user);
  } catch {
    // Sin sesión el cliente ya navegó al login; un error de red no cambia nada en pantalla.
  }
}
