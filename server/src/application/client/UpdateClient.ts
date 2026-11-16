import { assertCan } from '../../domain/auth/Authorization.js';
import { parseAddress, parseBusinessName } from '../../domain/client/Client.js';
import { Cuit } from '../../domain/client/Cuit.js';
import { IvaCondition } from '../../domain/shared/IvaCondition.js';
import { Email } from '../../domain/shared/Email.js';
import type { Actor } from '../shared/Actor.js';
import { requireActor } from '../shared/requireActor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { assertUniqueClient } from './assertUniqueClient.js';
import { type PublicClient, toPublicClient } from './dto/PublicClient.js';
import { ClientNotFound } from './errors.js';

export interface UpdateClientDeps {
  uow: UnitOfWork;
}

/** Los campos ausentes no cambian. "Al menos uno" es forma del body y lo valida la ruta. */
export interface UpdateClientInput {
  businessName?: string;
  cuit?: string;
  address?: string;
  billingEmail?: string;
  ivaCondition?: number;
}

/**
 * Modifica los datos de un cliente (FR-02), Activo o Inactivo, por un Admin o Editor (FR-19). Valida
 * con el dominio antes de la transacción y, dentro de ella, relee al actor y rechaza un CUIT o un email
 * de facturación de OTRO cliente (FR-06, FR-07): el propio no es un duplicado.
 */
export class UpdateClient {
  constructor(private readonly deps: UpdateClientDeps) {}

  execute(actor: Actor, id: string, input: UpdateClientInput): PublicClient {
    assertCan(actor.role, 'clients.manage');

    const businessName = input.businessName === undefined ? undefined : parseBusinessName(input.businessName);
    const cuit = input.cuit === undefined ? undefined : Cuit.parse(input.cuit);
    const address = input.address === undefined ? undefined : parseAddress(input.address);
    const billingEmail = input.billingEmail === undefined ? undefined : Email.create(input.billingEmail);
    const ivaCondition = input.ivaCondition === undefined ? undefined : IvaCondition.of(input.ivaCondition);

    const updated = this.deps.uow.run(({ users, clients }) => {
      requireActor(users, actor, 'clients.manage');
      const current = clients.findById(id);
      if (!current) throw new ClientNotFound();

      const next = current.withData({
        businessName: businessName ?? current.businessName,
        cuit: cuit ?? current.cuit,
        address: address ?? current.address,
        billingEmail: billingEmail ?? current.billingEmail,
        ivaCondition: ivaCondition ?? current.ivaCondition,
      });
      assertUniqueClient(clients, next);
      clients.update(next);
      return next;
    });

    return toPublicClient(updated);
  }
}
