import type { Client, ClientStatus } from '../../../domain/client/Client.js';
import type { IvaConditionCode } from '../../../domain/shared/IvaCondition.js';

/** Lo que los casos de uso devuelven de un cliente: valores planos y la fecha de alta en ISO. */
export interface PublicClient {
  id: string;
  businessName: string;
  cuit: string;
  address: string;
  billingEmail: string;
  ivaCondition: { code: IvaConditionCode; name: string };
  status: ClientStatus;
  createdAt: string;
}

export function toPublicClient(client: Client): PublicClient {
  return {
    id: client.id,
    businessName: client.businessName,
    cuit: client.cuit.value,
    address: client.address,
    billingEmail: client.billingEmail.value,
    ivaCondition: { code: client.ivaCondition.code, name: client.ivaCondition.name },
    status: client.status,
    createdAt: client.createdAt.toISOString(),
  };
}
