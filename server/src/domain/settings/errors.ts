/** Hora de facturación fuera de `HH:MM` o del rango 00:00–23:59 (FR-02). */
export class InvalidBillingHour extends Error {
  override readonly name = 'InvalidBillingHour';

  constructor(message = 'La hora de facturación debe estar entre 00:00 y 23:59, con el formato HH:MM') {
    super(message);
  }
}

/** Punto de venta que no es un entero entre 1 y 99999 (FR-04). */
export class InvalidPointOfSale extends Error {
  override readonly name = 'InvalidPointOfSale';

  constructor(message = 'El punto de venta debe ser un número entero entre 1 y 99999') {
    super(message);
  }
}

/** Condición frente al IVA con la que la empresa emisora no emite Factura C (FR-06, W11). */
export class InvalidIssuerIvaCondition extends Error {
  override readonly name = 'InvalidIssuerIvaCondition';

  constructor(
    message = 'La condición frente al IVA de la empresa emisora debe ser IVA Sujeto Exento, Responsable ' +
      'Monotributo, Monotributista Social o Monotributo Trabajador Independiente Promovido',
  ) {
    super(message);
  }
}

/** Fecha de inicio de actividades inexistente, posterior a hoy o anterior a 1900 (FR-07, S-02). */
export class InvalidActivityStartDate extends Error {
  override readonly name = 'InvalidActivityStartDate';

  constructor(
    message = 'La fecha de inicio de actividades debe ser una fecha existente entre el 01/01/1900 y hoy',
  ) {
    super(message);
  }
}

/** Número de ingresos brutos vacío o de más de 50 caracteres, después del trim (FR-08, D-07). */
export class InvalidIibb extends Error {
  override readonly name = 'InvalidIibb';

  constructor(message = 'El número de ingresos brutos debe tener entre 1 y 50 caracteres') {
    super(message);
  }
}

/** Razón social, domicilio comercial o nombre de fantasía vacío o de más de 200 caracteres (S-01). */
export class InvalidIssuerText extends Error {
  override readonly name = 'InvalidIssuerText';

  constructor(message = 'Los datos de la empresa emisora no son válidos') {
    super(message);
  }
}
