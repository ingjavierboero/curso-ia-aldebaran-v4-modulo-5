import { assertCan } from '../../domain/auth/Authorization.js';
import { Client, type ClientData, parseAddress, parseBusinessName } from '../../domain/client/Client.js';
import { Cuit } from '../../domain/client/Cuit.js';
import { IvaCondition } from '../../domain/client/IvaCondition.js';
import type { Clock } from '../../domain/shared/Clock.js';
import { Email } from '../../domain/shared/Email.js';
import type { Actor } from '../shared/Actor.js';
import type { IdGenerator } from '../shared/IdGenerator.js';
import { requireActor } from '../shared/requireActor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { assertUniqueClient } from './assertUniqueClient.js';
import { type PublicClient, toPublicClient } from './dto/PublicClient.js';

export interface CreateClientDeps {
  uow: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
}

export interface CreateClientInput {
  businessName: string;
  cuit: string;
  address: string;
  billingEmail: string;
  ivaCondition: number;
}

/**
 * Alta de un cliente Activo con su fecha de alta (FR-01) por un Admin o Editor (FR-19). Valida con el
 * dominio antes de la transacción (FR-04, FR-05) y, dentro de ella, relee al actor y controla que el
 * CUIT y el email de facturación no sean de otro cliente (FR-06, FR-07, NFR-01).
 */
export class CreateClient {
  constructor(private readonly deps: CreateClientDeps) {}

  execute(actor: Actor, input: CreateClientInput): PublicClient {
    const { uow, ids, clock } = this.deps;
    assertCan(actor.role, 'clients.manage');

    const data: ClientData = {
      businessName: parseBusinessName(input.businessName),
      cuit: Cuit.parse(input.cuit),
      address: parseAddress(input.address),
      billingEmail: Email.create(input.billingEmail),
      ivaCondition: IvaCondition.of(input.ivaCondition),
    };

    const created = uow.run(({ users, clients }) => {
      requireActor(users, actor, 'clients.manage');
      const client = Client.create({ ...data, id: ids.next(), createdAt: clock.now() });
      assertUniqueClient(clients, client);
      clients.insert(client);
      return client;
    });

    return toPublicClient(created);
  }
}
