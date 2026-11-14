export class InvalidJobDefinition extends Error {
  override readonly name = 'InvalidJobDefinition';

  constructor(
    message = 'El proceso necesita un nombre de 1 a 64 caracteres y un intervalo entero mayor que cero',
  ) {
    super(message);
  }
}

export class DuplicateJobName extends Error {
  override readonly name = 'DuplicateJobName';

  constructor(jobName: string) {
    super(`Ya hay un proceso registrado con el nombre ${JSON.stringify(jobName)}`);
  }
}
