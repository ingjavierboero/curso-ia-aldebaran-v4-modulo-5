import { IVA_CONDITIONS, type IvaCondition, type IvaConditionCode } from '../shared/IvaCondition.js';
import { InvalidIssuerIvaCondition } from './errors.js';

/** Códigos con los que la empresa emisora emite Factura C (FR-06). */
const ISSUER_CODES: readonly IvaConditionCode[] = [4, 6, 13, 16];

/**
 * Las condiciones frente al IVA admitidas para la empresa emisora, en orden de código: IVA Sujeto
 * Exento, Responsable Monotributo, Monotributista Social y Monotributo Trabajador Independiente
 * Promovido. Son las mismas instancias de `IVA_CONDITIONS`.
 */
export const ISSUER_IVA_CONDITIONS: readonly IvaCondition[] = Object.freeze(
  IVA_CONDITIONS.filter((condition) => ISSUER_CODES.includes(condition.code)),
);

/**
 * Value object: condición frente al IVA de la empresa emisora. Envuelve un `IvaCondition` de la
 * lista `ISSUER_IVA_CONDITIONS`; cualquier otro código, aunque sea válido para un cliente, se
 * rechaza con el mismo `InvalidIssuerIvaCondition` (W11).
 */
export class IssuerIvaCondition {
  private constructor(readonly condition: IvaCondition) {
    Object.freeze(this);
  }

  /** Una sola instancia congelada por código, como `IvaCondition`; comparables con `===`. */
  private static readonly INSTANCES: ReadonlyMap<number, IssuerIvaCondition> = new Map(
    ISSUER_IVA_CONDITIONS.map((condition) => [condition.code, new IssuerIvaCondition(condition)]),
  );

  static of(code: number): IssuerIvaCondition {
    if (typeof code !== 'number' || !Number.isInteger(code)) throw new InvalidIssuerIvaCondition();
    const found = IssuerIvaCondition.INSTANCES.get(code);
    if (found === undefined) throw new InvalidIssuerIvaCondition();
    return found;
  }

  get code(): IvaConditionCode {
    return this.condition.code;
  }

  get name(): string {
    return this.condition.name;
  }

  equals(other: IssuerIvaCondition): boolean {
    return this.condition.equals(other.condition);
  }
}
