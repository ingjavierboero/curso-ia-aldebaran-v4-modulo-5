import { Router, type Request, type Response } from 'express';
import { Unauthenticated } from '../../../application/auth/errors.js';
import type { Actor } from '../../../application/shared/Actor.js';
import type { CreateUser } from '../../../application/user/CreateUser.js';
import type { DeactivateUser } from '../../../application/user/DeactivateUser.js';
import type { ListUsers } from '../../../application/user/ListUsers.js';
import type { ReactivateUser } from '../../../application/user/ReactivateUser.js';
import type { UpdateUser } from '../../../application/user/UpdateUser.js';
import { Email } from '../../../domain/user/Email.js';
import { PasswordPolicy } from '../../../domain/user/PasswordPolicy.js';
import { USER_NAME_MAX_LENGTH } from '../../../domain/user/User.js';
import { bodyObject, InvalidBody, optionalString, requiredString } from '../body.js';

/** Tope de forma para `role` antes de llegar al dominio; el valor exacto lo valida `parseUserRole`. */
const ROLE_MAX_LENGTH = 20;

export interface UsersRoutesDeps {
  listUsers: Pick<ListUsers, 'execute'>;
  createUser: Pick<CreateUser, 'execute'>;
  updateUser: Pick<UpdateUser, 'execute'>;
  deactivateUser: Pick<DeactivateUser, 'execute'>;
  reactivateUser: Pick<ReactivateUser, 'execute'>;
}

/**
 * Gestión de usuarios (FEAT-006), con sesión obligatoria (`authMiddleware`). Sin lógica de negocio:
 * primero la forma del body (400), después el caso de uso con `req.user` como `Actor`, que autoriza
 * (403) y aplica las reglas. Como `authMiddleware` relee al usuario en cada solicitud, un cambio de
 * perfil o una baja rigen desde la siguiente (FR-12).
 */
export function usersRoutes(deps: UsersRoutesDeps): Router {
  const router = Router();

  router.get('/users', (req: Request, res: Response) => {
    const users = deps.listUsers.execute(actorOf(req));
    res.status(200).json({ users });
  });

  router.post('/users', async (req: Request, res: Response) => {
    const body = bodyObject(req.body);
    // Acá, tipo y máximos; el dominio aplica el resto (NFR-03).
    const name = requiredString(body, 'name', USER_NAME_MAX_LENGTH);
    const email = requiredString(body, 'email', Email.MAX_LENGTH);
    const role = requiredString(body, 'role', ROLE_MAX_LENGTH);
    const password = requiredString(body, 'password', PasswordPolicy.MAX_LENGTH);

    const user = await deps.createUser.execute(actorOf(req), { name, email, role, password });
    res.status(201).json({ user });
  });

  router.patch('/users/:id', (req: Request<{ id: string }>, res: Response) => {
    const body = bodyObject(req.body);
    const name = optionalString(body, 'name', USER_NAME_MAX_LENGTH);
    const email = optionalString(body, 'email', Email.MAX_LENGTH);
    const role = optionalString(body, 'role', ROLE_MAX_LENGTH);
    if (name === undefined && email === undefined && role === undefined) {
      throw new InvalidBody('Indicá al menos uno de los campos "name", "email" o "role"');
    }

    const user = deps.updateUser.execute(actorOf(req), req.params.id, { name, email, role });
    res.status(200).json({ user });
  });

  // Baja y reactivación no leen el body (`{}` por contrato), igual que `/auth/logout`; el
  // `Content-Type: application/json` lo sigue exigiendo `requireJson` (R-07).
  router.post('/users/:id/deactivate', (req: Request<{ id: string }>, res: Response) => {
    const user = deps.deactivateUser.execute(actorOf(req), req.params.id);
    res.status(200).json({ user });
  });

  router.post('/users/:id/reactivate', (req: Request<{ id: string }>, res: Response) => {
    const user = deps.reactivateUser.execute(actorOf(req), req.params.id);
    res.status(200).json({ user });
  });

  return router;
}

/** El usuario de la sesión como `Actor`. `authMiddleware` lo garantiza; si faltara, 401 y no 500. */
function actorOf(req: Request): Actor {
  if (req.user === undefined) throw new Unauthenticated();
  return { id: req.user.id, role: req.user.role };
}
