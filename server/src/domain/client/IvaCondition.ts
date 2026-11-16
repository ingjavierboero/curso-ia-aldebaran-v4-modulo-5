import { InvalidIvaCondition } from './errors.js';

/** Códigos de ARCA admitidos para el receptor de una Factura C, con su nombre (FR-04). */
const TABLE = [
  [1, 'IVA Responsable Inscripto'],
  [4, 'IVA Sujeto Exento'],
  [5, 'Consumidor Final'],
  [6, 'Responsable Monotributo'],
  [7, 'Sujeto No Categorizado'],
  [8, 'Proveedor del Exterior'],
  [9, 'Cliente del Exterior'],
  [10, 'IVA Liberado – Ley N° 19.640'],
  [13, 'Monotributista Social'],
  [15, 'IVA No Alcanzado'],
  [16, 'Monotributo Trabajador Independiente Promovido'],
] as const;

export type IvaConditionCode = (typeof TABLE)[number][0];

// Llave no exportada: solo este módulo puede construir instancias.
const CONSTRUCT = Symbol('IvaCondition');

/**
 * Condición frente al IVA. Hay una instancia congelada por código y no se pueden crear otras: se
 * obtienen con `IvaCondition.of` o recorriendo `IVA_CONDITIONS`.
 */
export class IvaCondition {
  readonly code: IvaConditionCode;
  readonly name: string;

  constructor(key: typeof CONSTRUCT, code: IvaConditionCode, name: string) {
    if (key !== CONSTRUCT) throw new InvalidIvaCondition();
    this.code = code;
    this.name = name;
    Object.freeze(this);
  }

  /** La condición con ese código; si no es uno de los admitidos, `InvalidIvaCondition`. */
  static of(code: number): IvaCondition {
    if (typeof code !== 'number' || !Number.isInteger(code)) throw new InvalidIvaCondition();
    const found = IVA_CONDITIONS.find((condition) => condition.code === code);
    if (found === undefined) throw new InvalidIvaCondition();
    return found;
  }

  equals(other: IvaCondition): boolean {
    return this.code === other.code;
  }
}

/** Tabla congelada código → nombre (FR-04), en orden de código. Única lista pública. */
export const IVA_CONDITIONS: readonly IvaCondition[] = Object.freeze(
  TABLE.map(([code, name]) => new IvaCondition(CONSTRUCT, code, name)),
);
