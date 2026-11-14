/** `RunTrackedJob` recibió el nombre de un proceso que no está en `JobRegistry`. */
export class UnknownJob extends Error {
  override readonly name = 'UnknownJob';

  constructor(jobName: string) {
    super(`No hay un proceso registrado con el nombre ${JSON.stringify(jobName)}`);
  }
}

/**
 * El job terminó bien pero su corrida no se pudo grabar. Distingue "falló el registro" de "falló el
 * job"; el error de grabación queda en `cause`.
 */
export class JobRunNotRecorded extends Error {
  override readonly name = 'JobRunNotRecorded';

  constructor(jobName: string, cause: unknown) {
    super(`El proceso ${JSON.stringify(jobName)} terminó, pero no se pudo grabar su corrida`, { cause });
  }
}
