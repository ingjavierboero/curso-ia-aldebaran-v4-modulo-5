import { describe, expect, it } from 'vitest';
import { resolveGmailCredentials } from '../../../src/infrastructure/email/emailConfig.js';
import { UnconfiguredEmailSender } from '../../../src/infrastructure/email/UnconfiguredEmailSender.js';

describe('UnconfiguredEmailSender', () => {
  // sad path: sin las dos credenciales no hay SMTP y cada envío falla con EmailUnconfigured
  it('test_credenciales_faltantes_sender_sin_configurar', async () => {
    expect(resolveGmailCredentials({ GMAIL_USER: 'sistema@gmail.com' })).toBeNull();
    expect(resolveGmailCredentials({ GMAIL_APP_PASSWORD: 'abcd efgh' })).toBeNull();
    expect(resolveGmailCredentials({ GMAIL_USER: 'sistema@gmail.com', GMAIL_APP_PASSWORD: '' })).toBeNull();
    expect(resolveGmailCredentials({ GMAIL_USER: '  ', GMAIL_APP_PASSWORD: 'abcd efgh' })).toBeNull();
    expect(resolveGmailCredentials({})).toBeNull();

    const sender = new UnconfiguredEmailSender();
    const result = sender.send({ to: 'ana@empresa.com', subject: 'Asunto', text: 'Cuerpo secreto' });

    await expect(result).rejects.toBeInstanceOf(Error);
    await expect(result).rejects.toMatchObject({ name: 'EmailUnconfigured' });
    const err: unknown = await result.catch((e: unknown) => e);
    expect((err as Error).message).not.toContain('Cuerpo secreto');
  });
});
