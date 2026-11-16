import { CheckPasswordResetToken } from '../../src/application/auth/CheckPasswordResetToken.js';
import type { PasswordResetLog } from '../../src/application/auth/PasswordResetLog.js';
import { RequestPasswordReset } from '../../src/application/auth/RequestPasswordReset.js';
import { ResetPasswordWithToken } from '../../src/application/auth/ResetPasswordWithToken.js';
import { createAuthContext } from './authContext.js';
import { FakeEmailSender } from './FakeEmailSender.js';
import { FakeResetTokenGenerator } from './FakeResetTokenGenerator.js';
import { RecordingPasswordResetLog } from './RecordingPasswordResetLog.js';
import { SequentialIdGenerator } from './SequentialIdGenerator.js';

export const TEST_APP_URL = 'http://localhost:5173';

/** El contexto de auth en memoria más los tres casos de uso de la recuperación (FEAT-008). */
export function createPasswordResetContext(options: { appUrl?: string; resetLog?: PasswordResetLog } = {}) {
  const ctx = createAuthContext();
  const resetTokenGenerator = new FakeResetTokenGenerator();
  const emailSender = new FakeEmailSender();
  const resetLog = new RecordingPasswordResetLog();
  const resetIds = new SequentialIdGenerator('rt');
  const appUrl = options.appUrl ?? TEST_APP_URL;

  const requestPasswordReset = new RequestPasswordReset({
    users: ctx.users,
    resetTokens: ctx.resetTokens,
    uow: ctx.uow,
    resetTokenGenerator,
    ids: resetIds,
    clock: ctx.clock,
    emailSender,
    resetLog: options.resetLog ?? resetLog,
    appUrl,
  });
  const checkPasswordResetToken = new CheckPasswordResetToken({
    users: ctx.users,
    resetTokens: ctx.resetTokens,
    resetTokenGenerator,
    clock: ctx.clock,
  });
  const resetPasswordWithToken = new ResetPasswordWithToken({
    users: ctx.users,
    resetTokens: ctx.resetTokens,
    uow: ctx.uow,
    hasher: ctx.hasher,
    resetTokenGenerator,
    clock: ctx.clock,
  });

  /** El token en claro del último email enviado (lo saca de la URL). */
  function lastSentToken(): string {
    const last = emailSender.sent.at(-1);
    if (!last) throw new Error('no se envió ningún email');
    const match = /\/recuperar\/([A-Za-z0-9_-]+)/.exec(last.text);
    if (!match?.[1]) throw new Error('el email no tiene la URL de recuperación');
    return match[1];
  }

  return {
    ...ctx,
    resetTokenGenerator,
    emailSender,
    resetLog,
    appUrl,
    requestPasswordReset,
    checkPasswordResetToken,
    resetPasswordWithToken,
    lastSentToken,
  };
}
