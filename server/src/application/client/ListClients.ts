import { assertCan } from '../../domain/auth/Authorization.js';
import type { ClientRepository } from '../../domain/client/ClientRepository.js';
import type { Actor } from '../shared/Actor.js';
import { sortBySpanishText } from '../shared/spanishOrder.js';
import { type PublicClient, toPublicClient } from './dto/PublicClient.js';

export interface ListClientsDeps {
  clients: ClientRepository;
}

/** Listado de clientes Activos e Inactivos, por razón social (FR-16), para los tres perfiles (FR-19). */
export class ListClients {
  constructor(private readonly deps: ListClientsDeps) {}

  execute(actor: Actor): PublicClient[] {
    assertCan(actor.role, 'clients.read');
    return sortBySpanishText(this.deps.clients.list(), (client) => client.businessName).map(toPublicClient);
  }
}
