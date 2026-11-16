import type { Client } from '../../domain/client/Client.js';
import type { ClientRepository } from '../../domain/client/ClientRepository.js';
import { DuplicateBillingEmail, DuplicateCuit } from '../../domain/client/errors.js';

/**
 * Control previo de unicidad (FR-06, FR-07, NFR-01), dentro de `uow.run`: ningún OTRO cliente tiene
 * ese email de facturación ni ese CUIT. Primero el email, para dar el mismo error que el repositorio
 * cuando chocan los dos. El UNIQUE de la base sigue siendo la última barrera.
 */
export function assertUniqueClient(clients: ClientRepository, client: Client): void {
  const emailOwner = clients.findByBillingEmail(client.billingEmail);
  if (emailOwner && emailOwner.id !== client.id) throw new DuplicateBillingEmail();
  const cuitOwner = clients.findByCuit(client.cuit);
  if (cuitOwner && cuitOwner.id !== client.id) throw new DuplicateCuit();
}
