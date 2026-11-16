/**
 * Un valor guardado en la base no pasa la validación del dominio al rehidratarlo: el dato está
 * corrupto (lo escribió algo que no pasó por el dominio). Es un error de infraestructura, no de la
 * entrada del usuario: no debe responderse como un 400. El mensaje nombra `tabla.columna` y nunca el
 * valor guardado, como `InvalidStoredDate`.
 */
export class InvalidStoredValue extends Error {
  override readonly name = 'InvalidStoredValue';

  constructor(field: string, options?: { cause?: unknown }) {
    super(`Valor inválido guardado en ${field}`, options);
  }
}

/**
 * Corre la validación de dominio de un valor leído de `field` (`tabla.columna`); si lanza, la
 * envuelve en `InvalidStoredValue`. El error de dominio queda solo como `cause`.
 */
export function rehydrate<T>(field: string, parse: () => T): T {
  try {
    return parse();
  } catch (err) {
    throw new InvalidStoredValue(field, { cause: err });
  }
}
