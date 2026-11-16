/** No existe un producto con ese id (FEAT-010). */
export class ProductNotFound extends Error {
  override readonly name = 'ProductNotFound';

  constructor(message = 'El producto no existe') {
    super(message);
  }
}

/** Un producto Inactivo no se puede asignar a un cliente (FR-14, AC-12). */
export class ProductInactive extends Error {
  override readonly name = 'ProductInactive';

  constructor(message = 'El producto está Inactivo y no se puede asignar') {
    super(message);
  }
}
