import { InvalidCurrency, InvalidPrice } from './errors.js';

export const CURRENCIES = ['ARS', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

// Texto decimal con punto, hasta 9 dígitos enteros y hasta 2 decimales (S-02). Sin signo, sin
// exponente, sin separador de miles: nunca pasa por un float.
const PRICE_FORMAT = /^(\d{1,9})(?:\.(\d{1,2}))?$/;
/** 999.999.999,99 en centavos. */
const MAX_CENTS = 99_999_999_999;

/** Moneda: exactamente `ARS` o `USD` (sin normalizar); si no, `InvalidCurrency`. */
export function parseCurrency(raw: string): Currency {
  if (typeof raw !== 'string' || !(CURRENCIES as readonly string[]).includes(raw)) throw new InvalidCurrency();
  return raw as Currency;
}

/**
 * Value object: precio de la cuota mensual en centavos enteros y su moneda (NFR-03). Entra y sale
 * como texto decimal para no perder precisión.
 */
export class Price {
  private constructor(
    readonly cents: number,
    readonly currency: Currency,
  ) {}

  /** De texto (`"15000.5"`) a centavos; mayor a cero. Si no, `InvalidPrice` / `InvalidCurrency`. */
  static parse(text: string, currency: string): Price {
    if (typeof text !== 'string') throw new InvalidPrice();
    const match = PRICE_FORMAT.exec(text);
    if (match === null) throw new InvalidPrice();
    const [, integerPart = '', decimalPart = ''] = match;
    const cents = Number(integerPart) * 100 + Number(decimalPart.padEnd(2, '0'));
    return Price.fromCents(cents, parseCurrency(currency));
  }

  /** Rehidrata un precio guardado en centavos: entero, entre 1 y 999999999.99. */
  static fromCents(cents: number, currency: Currency): Price {
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) throw new InvalidPrice();
    return new Price(cents, parseCurrency(currency));
  }

  /** Siempre con 2 decimales y punto: `"15000.50"`. */
  toDecimalString(): string {
    const integerPart = Math.floor(this.cents / 100);
    const decimalPart = String(this.cents % 100).padStart(2, '0');
    return `${String(integerPart)}.${decimalPart}`;
  }

  equals(other: Price): boolean {
    return this.cents === other.cents && this.currency === other.currency;
  }
}
