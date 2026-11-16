import type { FormRule } from 'antd';
import { USER_PASSWORD_MAX_LENGTH, USER_PASSWORD_MIN_LENGTH } from './userRules';

/**
 * Reglas de formulario de una contraseña nueva y su repetición, compartidas por "Mi perfil" (FEAT-007)
 * y el cambio con el enlace de recuperación (FEAT-008). Fuera de los componentes: un módulo de
 * componentes que exporta otra cosa rompe el Fast Refresh.
 */

/** Requerida y de 8 a 1024 caracteres, los límites del server. */
export const NEW_PASSWORD_RULES: FormRule[] = [
  { required: true, message: 'Ingresá la contraseña nueva' },
  {
    min: USER_PASSWORD_MIN_LENGTH,
    max: USER_PASSWORD_MAX_LENGTH,
    message: `La contraseña debe tener entre ${USER_PASSWORD_MIN_LENGTH} y ${USER_PASSWORD_MAX_LENGTH} caracteres`,
  },
];

/** Campo que la repetición tiene que igualar; va en `dependencies` del `Form.Item` de la repetición. */
export const NEW_PASSWORD_FIELD = 'newPassword';

/** Requerida e igual a `NEW_PASSWORD_FIELD`. */
export const CONFIRM_PASSWORD_RULES: FormRule[] = [
  { required: true, message: 'Repetí la contraseña nueva' },
  ({ getFieldValue }) => ({
    validator(_rule, value: unknown) {
      if (!value || getFieldValue(NEW_PASSWORD_FIELD) === value) return Promise.resolve();
      return Promise.reject(new Error('Las contraseñas no coinciden'));
    },
  }),
];
