/** No existe un cliente con ese id (FEAT-010). */
export class ClientNotFound extends Error {
  override readonly name = 'ClientNotFound';

  constructor(message = 'El cliente no existe') {
    super(message);
  }
}

/** Se pidió desasignar un producto que el cliente no tiene asignado (FR-15). */
export class ProductNotAssigned extends Error {
  override readonly name = 'ProductNotAssigned';

  constructor(message = 'El producto no está asignado a ese cliente') {
    super(message);
  }
}
