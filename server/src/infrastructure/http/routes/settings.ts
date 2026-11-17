import { Router, type Request, type Response } from 'express';
import type { GetBillingSettings } from '../../../application/settings/GetBillingSettings.js';
import type {
  UpdateBillingSettings,
  UpdateBillingSettingsInput,
} from '../../../application/settings/UpdateBillingSettings.js';
import { ACTIVITY_START_MIN_DATE } from '../../../domain/settings/ActivityStartDate.js';
import { IIBB_MAX_LENGTH, ISSUER_TEXT_MAX_LENGTH } from '../../../domain/settings/issuerText.js';
import { InvalidBody, bodyObject, optionalInteger, optionalObject, optionalString } from '../body.js';
import { sessionContext } from '../sessionContext.js';

/** Tope de forma de la fecha `YYYY-MM-DD` (10 caracteres) antes del dominio. */
const DATE_MAX_LENGTH = ACTIVITY_START_MIN_DATE.length;
/** Tope de la hora: margen de forma; el formato HH:MM lo valida BillingHour. */
const BILLING_HOUR_MAX_LENGTH = 10;

export interface SettingsRoutesDeps {
  getBillingSettings: Pick<GetBillingSettings, 'execute'>;
  updateBillingSettings: Pick<UpdateBillingSettings, 'execute'>;
}

/**
 * Configuración de facturación (FEAT-011), con sesión obligatoria (`authMiddleware`). Sin lógica de
 * negocio: la ruta valida la forma del body (400) y el caso de uso autoriza (403) y aplica las reglas
 * del dominio. Responde el DTO de la configuración, sin envoltorio.
 */
export function settingsRoutes(deps: SettingsRoutesDeps): Router {
  const router = Router();

  router.get('/settings/billing', (req: Request, res: Response) => {
    const settings = deps.getBillingSettings.execute(sessionContext(req).actor);
    res.status(200).json(settings);
  });

  router.patch('/settings/billing', (req: Request, res: Response) => {
    const input = toUpdateInput(bodyObject(req.body));
    const settings = deps.updateBillingSettings.execute(sessionContext(req).actor, input);
    res.status(200).json(settings);
  });

  return router;
}

/** Tipo y máximos de cada campo; las claves desconocidas se ignoran. Al menos un campo, también en `issuer`. */
function toUpdateInput(body: Record<string, unknown>): UpdateBillingSettingsInput {
  const billingHour = optionalString(body, 'billingHour', BILLING_HOUR_MAX_LENGTH);
  const pointOfSale = optionalInteger(body, 'pointOfSale');
  const rawIssuer = optionalObject(body, 'issuer');

  let issuer: UpdateBillingSettingsInput['issuer'];
  if (rawIssuer !== undefined) {
    issuer = {
      legalName: optionalString(rawIssuer, 'legalName', ISSUER_TEXT_MAX_LENGTH),
      address: optionalString(rawIssuer, 'address', ISSUER_TEXT_MAX_LENGTH),
      ivaCondition: optionalInteger(rawIssuer, 'ivaCondition'),
      iibb: optionalString(rawIssuer, 'iibb', IIBB_MAX_LENGTH),
      activityStartDate: optionalString(rawIssuer, 'activityStartDate', DATE_MAX_LENGTH),
      tradeName: optionalString(rawIssuer, 'tradeName', ISSUER_TEXT_MAX_LENGTH),
    };
    if (Object.values(issuer).every((value) => value === undefined)) {
      throw new InvalidBody(
        'Indicá al menos uno de los campos de "issuer": "legalName", "address", "ivaCondition", "iibb", ' +
          '"activityStartDate" o "tradeName"',
      );
    }
  }

  if (billingHour === undefined && pointOfSale === undefined && issuer === undefined) {
    throw new InvalidBody('Indicá al menos uno de los campos "billingHour", "pointOfSale" o "issuer"');
  }
  return { billingHour, pointOfSale, issuer };
}
