import type { EmailMessage, EmailSender } from '../../src/application/shared/EmailSender.js';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Mode =
  | { kind: 'ok' }
  | { kind: 'fail'; error: unknown }
  | { kind: 'throw'; error: unknown }
  | { kind: 'hold' };

/**
 * Doble de `EmailSender`: guarda cada mensaje en el momento de `send`. Por defecto resuelve; se le
 * puede programar que rechace (`failWith`) o que quede pendiente (`hold`) hasta `releaseAll`.
 * `settled()` espera a que terminen los envíos ya hechos (y a que corran sus `then`).
 */
export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  private mode: Mode = { kind: 'ok' };
  private readonly inFlight: Array<Promise<void>> = [];
  private readonly held: Deferred[] = [];

  failWith(error: unknown): void {
    this.mode = { kind: 'fail', error };
  }

  /** Los envíos siguientes lanzan en forma síncrona, en vez de devolver una promesa rechazada. */
  throwSync(error: unknown): void {
    this.mode = { kind: 'throw', error };
  }

  /** Los envíos siguientes quedan pendientes hasta `releaseAll` (o para siempre). */
  hold(): void {
    this.mode = { kind: 'hold' };
  }

  releaseAll(): void {
    for (const d of this.held.splice(0)) d.resolve();
  }

  send(message: EmailMessage): Promise<void> {
    this.sent.push({ ...message });
    if (this.mode.kind === 'throw') {
      // Simula un adaptador defectuoso que lanza lo que sea, no necesariamente un Error.
      // oxlint-disable-next-line typescript/only-throw-error
      throw this.mode.error;
    }
    const d = deferred();
    if (this.mode.kind === 'ok') d.resolve();
    else if (this.mode.kind === 'fail') d.reject(this.mode.error);
    else this.held.push(d);
    this.inFlight.push(d.promise);
    return d.promise;
  }

  /** Resuelve cuando todos los envíos hechos hasta ahora terminaron, bien o mal. */
  async settled(): Promise<void> {
    await Promise.allSettled(this.inFlight.slice());
    // Una vuelta más, para que los `then` registrados por el caso de uso ya hayan corrido.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
