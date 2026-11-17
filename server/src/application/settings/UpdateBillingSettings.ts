import { assertCan } from '../../domain/auth/Authorization.js';
import { ActivityStartDate } from '../../domain/settings/ActivityStartDate.js';
import { BillingHour } from '../../domain/settings/BillingHour.js';
import type { BillingSettingsChanges } from '../../domain/settings/BillingSettings.js';
import { IssuerIvaCondition } from '../../domain/settings/IssuerIvaCondition.js';
import {
  parseIibb,
  parseIssuerAddress,
  parseIssuerLegalName,
  parseIssuerTradeName,
} from '../../domain/settings/issuerText.js';
import { PointOfSale } from '../../domain/settings/PointOfSale.js';
import { argentinaCalendarDate } from '../../domain/shared/argentinaDate.js';
import type { Clock } from '../../domain/shared/Clock.js';
import type { Actor } from '../shared/Actor.js';
import { requireActor } from '../shared/requireActor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { type BillingSettingsDto, toBillingSettingsDto } from './dto/BillingSettingsDto.js';

export interface UpdateBillingSettingsDeps {
  uow: UnitOfWork;
  clock: Clock;
}

/** Los campos ausentes no cambian. "Al menos uno" es forma del body y lo valida la ruta. */
export interface UpdateBillingSettingsInput {
  billingHour?: string;
  pointOfSale?: number;
  issuer?: {
    legalName?: string;
    address?: string;
    ivaCondition?: number;
    iibb?: string;
    activityStartDate?: string;
    tradeName?: string;
  };
}

/**
 * Modifica la configuración de facturación, solo un Admin (`settings.manage`, FR-13). Convierte cada
 * valor enviado a su value object ANTES de abrir la transacción: si uno es inválido no se escribe nada
 * (NFR-01). El tope de la fecha de inicio es hoy en Argentina (F2). Dentro de la transacción relee al
 * actor, mezcla con lo guardado y guarda una sola vez (F3).
 */
export class UpdateBillingSettings {
  constructor(private readonly deps: UpdateBillingSettingsDeps) {}

  execute(actor: Actor, input: UpdateBillingSettingsInput): BillingSettingsDto {
    // Primero el permiso del perfil, como las demás escrituras: un Editor o Consulta recibe
    // Forbidden aunque mande un valor inválido (F1 de la revisión de Block 3). `requireActor`
    // vuelve a leer al actor dentro de la transacción.
    assertCan(actor.role, 'settings.manage');
    const now = this.deps.clock.now();
    const today = argentinaCalendarDate(now);
    const changes = toChanges(input, today);

    const saved = this.deps.uow.run(({ users, settings }) => {
      requireActor(users, actor, 'settings.manage');
      const next = settings.get().withChanges(changes);
      settings.saveBilling(next, now);
      return next;
    });

    return toBillingSettingsDto(saved, now);
  }
}

function toChanges(input: UpdateBillingSettingsInput, today: string): BillingSettingsChanges {
  const issuer = input.issuer ?? {};
  return {
    billingHour: input.billingHour === undefined ? undefined : BillingHour.parse(input.billingHour),
    pointOfSale: input.pointOfSale === undefined ? undefined : PointOfSale.of(input.pointOfSale),
    issuerLegalName: issuer.legalName === undefined ? undefined : parseIssuerLegalName(issuer.legalName),
    issuerAddress: issuer.address === undefined ? undefined : parseIssuerAddress(issuer.address),
    issuerIvaCondition: issuer.ivaCondition === undefined ? undefined : IssuerIvaCondition.of(issuer.ivaCondition),
    issuerIibb: issuer.iibb === undefined ? undefined : parseIibb(issuer.iibb),
    issuerActivityStartDate:
      issuer.activityStartDate === undefined ? undefined : ActivityStartDate.parse(issuer.activityStartDate, today),
    issuerTradeName: issuer.tradeName === undefined ? undefined : parseIssuerTradeName(issuer.tradeName),
  };
}
