import { Router, type Request, type Response } from 'express';
import type { AssignProducts } from '../../../application/client/AssignProducts.js';
import type { CreateClient } from '../../../application/client/CreateClient.js';
import type { DeactivateClient } from '../../../application/client/DeactivateClient.js';
import type { GetClient } from '../../../application/client/GetClient.js';
import type { ListClients } from '../../../application/client/ListClients.js';
import type { ReactivateClient } from '../../../application/client/ReactivateClient.js';
import type { UnassignProduct } from '../../../application/client/UnassignProduct.js';
import type { UpdateClient } from '../../../application/client/UpdateClient.js';
import { CLIENT_ADDRESS_MAX_LENGTH, CLIENT_BUSINESS_NAME_MAX_LENGTH } from '../../../domain/client/Client.js';
import { Email } from '../../../domain/shared/Email.js';
import {
  InvalidBody,
  bodyObject,
  boundedParam,
  ID_MAX_LENGTH,
  optionalInteger,
  optionalString,
  requiredInteger,
  requiredString,
  requiredStringArray,
} from '../body.js';
import { sessionContext } from '../sessionContext.js';

/** Tope de forma del CUIT antes del dominio: 11 dígitos más guiones y espacios (S-03). */
const CUIT_MAX_LENGTH = 20;
/** Productos por asignación (todo o nada). */
const ASSIGN_MAX_ITEMS = 50;

export interface ClientsRoutesDeps {
  listClients: Pick<ListClients, 'execute'>;
  getClient: Pick<GetClient, 'execute'>;
  createClient: Pick<CreateClient, 'execute'>;
  updateClient: Pick<UpdateClient, 'execute'>;
  deactivateClient: Pick<DeactivateClient, 'execute'>;
  reactivateClient: Pick<ReactivateClient, 'execute'>;
  assignProducts: Pick<AssignProducts, 'execute'>;
  unassignProduct: Pick<UnassignProduct, 'execute'>;
}

/**
 * Clientes y sus asignaciones (FEAT-010), con sesión obligatoria (`authMiddleware`). Sin lógica de
 * negocio: primero la forma del body y de los parámetros (400), después el caso de uso con el `Actor`
 * de `sessionContext`, que autoriza (403) y aplica las reglas del dominio.
 */
export function clientsRoutes(deps: ClientsRoutesDeps): Router {
  const router = Router();

  router.get('/clients', (req: Request, res: Response) => {
    const clients = deps.listClients.execute(sessionContext(req).actor);
    res.status(200).json({ clients });
  });

  router.get('/clients/:id', (req: Request<{ id: string }>, res: Response) => {
    const id = boundedParam(req.params.id, 'id', ID_MAX_LENGTH);
    const client = deps.getClient.execute(sessionContext(req).actor, id);
    res.status(200).json({ client });
  });

  router.post('/clients', (req: Request, res: Response) => {
    const body = bodyObject(req.body);
    // Acá, tipo y máximos; el dominio aplica el resto (CUIT, condición IVA, email, largos mínimos).
    const businessName = requiredString(body, 'businessName', CLIENT_BUSINESS_NAME_MAX_LENGTH);
    const cuit = requiredString(body, 'cuit', CUIT_MAX_LENGTH);
    const address = requiredString(body, 'address', CLIENT_ADDRESS_MAX_LENGTH);
    const billingEmail = requiredString(body, 'billingEmail', Email.MAX_LENGTH);
    const ivaCondition = requiredInteger(body, 'ivaCondition');

    const client = deps.createClient.execute(sessionContext(req).actor, {
      businessName,
      cuit,
      address,
      billingEmail,
      ivaCondition,
    });
    res.status(201).json({ client });
  });

  router.patch('/clients/:id', (req: Request<{ id: string }>, res: Response) => {
    const id = boundedParam(req.params.id, 'id', ID_MAX_LENGTH);
    const body = bodyObject(req.body);
    const input = {
      businessName: optionalString(body, 'businessName', CLIENT_BUSINESS_NAME_MAX_LENGTH),
      cuit: optionalString(body, 'cuit', CUIT_MAX_LENGTH),
      address: optionalString(body, 'address', CLIENT_ADDRESS_MAX_LENGTH),
      billingEmail: optionalString(body, 'billingEmail', Email.MAX_LENGTH),
      ivaCondition: optionalInteger(body, 'ivaCondition'),
    };
    if (Object.values(input).every((value) => value === undefined)) {
      throw new InvalidBody(
        'Indicá al menos uno de los campos "businessName", "cuit", "address", "billingEmail" o "ivaCondition"',
      );
    }

    const client = deps.updateClient.execute(sessionContext(req).actor, id, input);
    res.status(200).json({ client });
  });

  // Baja y reactivación no leen el body (`{}` por contrato), igual que en usuarios.
  router.post('/clients/:id/deactivate', (req: Request<{ id: string }>, res: Response) => {
    const id = boundedParam(req.params.id, 'id', ID_MAX_LENGTH);
    const client = deps.deactivateClient.execute(sessionContext(req).actor, id);
    res.status(200).json({ client });
  });

  router.post('/clients/:id/reactivate', (req: Request<{ id: string }>, res: Response) => {
    const id = boundedParam(req.params.id, 'id', ID_MAX_LENGTH);
    const client = deps.reactivateClient.execute(sessionContext(req).actor, id);
    res.status(200).json({ client });
  });

  // Asignación todo o nada; responde el detalle del cliente con sus productos (FR-13, FR-17).
  router.post('/clients/:id/products', (req: Request<{ id: string }>, res: Response) => {
    const id = boundedParam(req.params.id, 'id', ID_MAX_LENGTH);
    const body = bodyObject(req.body);
    const productIds = requiredStringArray(body, 'productIds', {
      maxItems: ASSIGN_MAX_ITEMS,
      maxLength: ID_MAX_LENGTH,
    });

    const client = deps.assignProducts.execute(sessionContext(req).actor, id, productIds);
    res.status(200).json({ client });
  });

  // Desasignar por POST (sin DELETE): el cliente web y `requireJson` no cambian (FR-15).
  router.post(
    '/clients/:id/products/:productId/unassign',
    (req: Request<{ id: string; productId: string }>, res: Response) => {
      const id = boundedParam(req.params.id, 'id', ID_MAX_LENGTH);
      const productId = boundedParam(req.params.productId, 'productId', ID_MAX_LENGTH);
      deps.unassignProduct.execute(sessionContext(req).actor, id, productId);
      res.status(204).end();
    },
  );

  return router;
}
