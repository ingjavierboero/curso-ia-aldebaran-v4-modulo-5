import { describe, expect, it } from 'vitest';
import { RedirectingEmailSender } from '../../../src/infrastructure/email/RedirectingEmailSender.js';
import { FakeEmailSender } from '../../support/FakeEmailSender.js';

describe('RedirectingEmailSender', () => {
  // AC-15: con EMAIL_REDIRECT_TO todos los emails van a la dirección de desarrollo
  it('test_redirect_envia_a_la_direccion_de_desarrollo', async () => {
    const inner = new FakeEmailSender();
    const sender = new RedirectingEmailSender(inner, 'dev@empresa.com');

    await sender.send({ to: 'ana@empresa.com', subject: 'Asunto', text: 'Cuerpo' });

    expect(inner.sent).toEqual([{ to: 'dev@empresa.com', subject: 'Asunto', text: 'Cuerpo' }]);

    // sin redirección, el destinatario original
    const passthroughInner = new FakeEmailSender();
    await new RedirectingEmailSender(passthroughInner, null).send({
      to: 'ana@empresa.com',
      subject: 'Asunto',
      text: 'Cuerpo',
    });
    expect(passthroughInner.sent.map((m) => m.to)).toEqual(['ana@empresa.com']);
  });
});
