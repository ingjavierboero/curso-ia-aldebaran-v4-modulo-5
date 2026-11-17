/**
 * Regla de pago reenviado (FEAT-016): decide si un comprobante es un pago ya imputado.
 * Es pura: no lee ni escribe nada. El control de pagos aplica la decisión (D-07).
 */

/** Marca con la que el control de pagos registra un comprobante descartado (D-03). */
export const DUPLICATE_PAYMENT_MARK = 'pago duplicado';

/** Motivo de la Revisión manual cuando no se puede saber si es el mismo pago (D-02). */
export const POSSIBLE_DUPLICATE_REASON = 'posible pago duplicado';

/** Datos extraídos de un comprobante, tal como llegan (sin validar). */
export interface PaymentReceipt {
  readonly payerCuit: string | null;
  /** Monto en centavos de peso. */
  readonly amountCents: number | null;
  /** Fecha del pago, `YYYY-MM-DD`. */
  readonly paymentDate: string | null;
  readonly operationNumber: string | null;
}

export type PaymentVerdict =
  | { readonly kind: 'nuevo' }
  | { readonly kind: 'duplicado'; readonly matched: PaymentReceipt }
  | { readonly kind: 'posible_duplicado'; readonly matched: PaymentReceipt }
  | { readonly kind: 'datos_no_extraidos' };

interface NormalizedReceipt {
  readonly cuit: string;
  readonly amountCents: number;
  readonly date: string | null;
  readonly operation: string | null;
}

/** Solo letras y dígitos ASCII, en minúsculas; los ceros a la izquierda se conservan (FR-02). */
export function normalizeOperationNumber(raw: string | null): string | null {
  if (raw === null) return null;
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized === '' ? null : normalized;
}

function normalize(receipt: PaymentReceipt): NormalizedReceipt | null {
  const cuit = (receipt.payerCuit ?? '').replace(/\D/g, '');
  const amount = receipt.amountCents;
  if (cuit === '' || amount === null || !Number.isSafeInteger(amount) || amount <= 0) return null;
  const date = receipt.paymentDate?.trim() ?? '';
  return {
    cuit,
    amountCents: amount,
    date: date === '' ? null : date,
    operation: normalizeOperationNumber(receipt.operationNumber),
  };
}

/** Un dato que falta en cualquiera de los dos no se compara (D-10, D-11). */
function sameIfBothPresent(a: string | null, b: string | null): boolean {
  return a === null || b === null || a === b;
}

function isComplete(receipt: NormalizedReceipt): boolean {
  return receipt.date !== null && receipt.operation !== null;
}

/** Coincide en CUIT, monto y en la fecha y el número de operación que tienen los dos. */
function matchesOnSharedData(candidate: NormalizedReceipt, imputed: NormalizedReceipt): boolean {
  return (
    candidate.cuit === imputed.cuit &&
    candidate.amountCents === imputed.amountCents &&
    sameIfBothPresent(candidate.date, imputed.date) &&
    sameIfBothPresent(candidate.operation, imputed.operation)
  );
}

interface PoolEntry {
  readonly original: PaymentReceipt;
  readonly normalized: NormalizedReceipt;
}

function decide(candidate: NormalizedReceipt, pool: readonly PoolEntry[]): PaymentVerdict {
  const matches = pool.filter((entry) => matchesOnSharedData(candidate, entry.normalized));
  if (matches.length === 0) return { kind: 'nuevo' };
  // Un duplicado exacto (los dos completos) gana sobre una coincidencia parcial.
  const exact = isComplete(candidate) ? matches.find((entry) => isComplete(entry.normalized)) : undefined;
  if (exact !== undefined) return { kind: 'duplicado', matched: exact.original };
  const [first] = matches;
  return { kind: 'posible_duplicado', matched: first!.original };
}

function buildPool(receipts: readonly PaymentReceipt[]): PoolEntry[] {
  return receipts.flatMap((original): PoolEntry[] => {
    const normalized = normalize(original);
    return normalized === null ? [] : [{ original, normalized }];
  });
}

/**
 * Decide un comprobante contra los pagos ya imputados del cliente.
 *
 * @param imputedForClient comprobantes ya imputados del mismo cliente, sin límite de tiempo
 *   (supuesto S-01); imputado = llevó facturas a Pago recibido o Pagada (supuesto S-03).
 */
export function evaluateReceipt(
  receipt: PaymentReceipt,
  imputedForClient: readonly PaymentReceipt[],
): PaymentVerdict {
  const candidate = normalize(receipt);
  if (candidate === null) return { kind: 'datos_no_extraidos' };
  return decide(candidate, buildPool(imputedForClient));
}

/**
 * Una decisión por comprobante del email, en el mismo orden (FR-06). Cada comprobante se compara
 * también contra los anteriores del mismo email que resultaron pago nuevo (FR-07, D-09).
 */
export function evaluateEmailReceipts(
  receipts: readonly PaymentReceipt[],
  imputedForClient: readonly PaymentReceipt[],
): PaymentVerdict[] {
  const pool = buildPool(imputedForClient);
  return receipts.map((receipt) => {
    const candidate = normalize(receipt);
    if (candidate === null) return { kind: 'datos_no_extraidos' };
    const verdict = decide(candidate, pool);
    if (verdict.kind === 'nuevo') pool.push({ original: receipt, normalized: candidate });
    return verdict;
  });
}
