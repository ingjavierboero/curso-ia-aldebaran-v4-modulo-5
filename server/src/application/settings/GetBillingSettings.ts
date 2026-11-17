import type { SettingsRepository } from '../../domain/settings/SettingsRepository.js';
import type { UserRepository } from '../../domain/user/UserRepository.js';
import type { Actor } from '../shared/Actor.js';
import { requireActor } from '../shared/requireActor.js';
import { type BillingSettingsDto, toBillingSettingsDto } from './dto/BillingSettingsDto.js';

export interface GetBillingSettingsDeps {
  users: UserRepository;
  settings: SettingsRepository;
}

/**
 * La configuración de facturación (FR-01) para los tres perfiles (`settings.read`, FR-13). Lectura de
 * una sola fila, sin transacción, como `ListClients`. El puerto no expone la fecha del último guardado,
 * así que `updatedAt` sale `null`.
 */
export class GetBillingSettings {
  constructor(private readonly deps: GetBillingSettingsDeps) {}

  execute(actor: Actor): BillingSettingsDto {
    requireActor(this.deps.users, actor, 'settings.read');
    return toBillingSettingsDto(this.deps.settings.get(), null);
  }
}
