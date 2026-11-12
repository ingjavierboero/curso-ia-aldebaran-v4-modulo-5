import { create } from 'zustand';
import type { PublicUser } from '../api/types';

/** Estado de la sesión en la web. Es UX: la autorización real la hace `authMiddleware` del server. */
export interface AuthState {
  user: PublicUser | null;
  status: 'loading' | 'anon' | 'authed';
  setUser: (user: PublicUser) => void;
  setAnon: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  status: 'loading',
  setUser: (user) => {
    set({ user, status: 'authed' });
  },
  setAnon: () => {
    set({ user: null, status: 'anon' });
  },
}));
