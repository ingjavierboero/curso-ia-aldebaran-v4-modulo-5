import { describe, expect, it } from 'vitest';
import {
  evaluateEmailReceipts,
  evaluateReceipt,
  type PaymentReceipt,
} from '../../src/domain/payment/DuplicatePaymentPolicy.js';

// Comprobante base de los criterios del PRD: CUIT 30711111111, $15000,50, 10/11/2026, op 00123456.
const base: PaymentReceipt = {
  payerCuit: '30711111111',
  amountCents: 1_500_050,
  paymentDate: '2026-11-10',
  operationNumber: '00123456',
};

const receipt = (overrides: Partial<PaymentReceipt> = {}): PaymentReceipt => ({ ...base, ...overrides });

describe('DuplicatePaymentPolicy', () => {
  // AC-01 (FR-01, FR-03) y AC-05 (FR-05)
  it('test_pago_reenviado_identico_es_duplicado', () => {
    const imputed = [receipt()];

    const verdict = evaluateReceipt(receipt(), imputed);
    expect(verdict.kind).toBe('duplicado');
    expect(verdict.kind === 'duplicado' && verdict.matched).toEqual(imputed[0]);

    // Sin pagos imputados, el mismo comprobante es un pago nuevo.
    expect(evaluateReceipt(receipt(), []).kind).toBe('nuevo');
  });

  // AC-02 y AC-03 (FR-02): formato raro del número de operación
  it('test_numero_de_operacion_con_otro_formato_es_duplicado', () => {
    const imputedWithDash = [receipt({ operationNumber: '0012-3456' })];

    expect(evaluateReceipt(receipt({ operationNumber: ' 0012 3456 ' }), imputedWithDash).kind).toBe('duplicado');
    expect(evaluateReceipt(receipt({ operationNumber: '00123456' }), imputedWithDash).kind).toBe('duplicado');
    // Los ceros a la izquierda cuentan: "123456" es otra operación.
    expect(evaluateReceipt(receipt({ operationNumber: '123456' }), imputedWithDash).kind).toBe('nuevo');

    // Sin distinguir mayúsculas de minúsculas.
    const imputedLetters = [receipt({ operationNumber: 'ab-12' })];
    expect(evaluateReceipt(receipt({ operationNumber: 'AB12' }), imputedLetters).kind).toBe('duplicado');
  });

  // AC-04 y AC-07 (FR-04, FR-05): límite exacto, un solo dato distinto
  it('test_pago_con_otra_fecha_u_operacion_es_nuevo', () => {
    const imputed = [receipt()];

    expect(evaluateReceipt(receipt({ paymentDate: '2026-11-11' }), imputed).kind).toBe('nuevo');
    expect(evaluateReceipt(receipt({ operationNumber: '00123457' }), imputed).kind).toBe('nuevo');
    // Un centavo de diferencia ya es otro pago.
    expect(evaluateReceipt(receipt({ amountCents: 1_500_051 }), imputed).kind).toBe('nuevo');

    // Sin número de operación y sin ningún imputado que coincida en CUIT, monto y fecha.
    expect(
      evaluateReceipt(receipt({ operationNumber: null, paymentDate: '2026-12-10' }), imputed).kind,
    ).toBe('nuevo');
  });

  // AC-06 (FR-04) y AC-09 (FR-08): vacío, cero, negativo
  it('test_datos_faltantes_o_monto_invalido_rechazado', () => {
    const imputed = [receipt()];

    // Falta un dato y el resto coincide: decide una persona.
    expect(evaluateReceipt(receipt({ operationNumber: null }), imputed).kind).toBe('posible_duplicado');
    expect(evaluateReceipt(receipt({ operationNumber: ' - ' }), imputed).kind).toBe('posible_duplicado');
    expect(evaluateReceipt(receipt({ paymentDate: null }), imputed).kind).toBe('posible_duplicado');

    // AC-12: sin fecha ni número de operación, con el mismo CUIT y monto.
    const withoutBoth = evaluateReceipt(receipt({ paymentDate: null, operationNumber: null }), imputed);
    expect(withoutBoth.kind).toBe('posible_duplicado');
    expect(withoutBoth.kind === 'posible_duplicado' && withoutBoth.matched).toEqual(imputed[0]);

    // AC-11: al pago ya imputado le falta el número de operación (anterior a esta regla).
    const imputedWithoutOperation = [receipt({ operationNumber: null })];
    expect(evaluateReceipt(receipt(), imputedWithoutOperation).kind).toBe('posible_duplicado');
    expect(evaluateReceipt(receipt({ paymentDate: '2026-11-11' }), imputedWithoutOperation).kind).toBe('nuevo');

    // Monto vacío, cero, negativo o no entero, o CUIT vacío: datos no extraídos, nunca duplicado.
    for (const amountCents of [null, 0, -10_000, 1_500_050.5]) {
      expect(evaluateReceipt(receipt({ amountCents }), imputed).kind).toBe('datos_no_extraidos');
    }
    for (const payerCuit of [null, '', '   ']) {
      expect(evaluateReceipt(receipt({ payerCuit }), imputed).kind).toBe('datos_no_extraidos');
    }
  });

  // AC-08 (FR-06, FR-07) y AC-10 (NFR-01, NFR-02): duplicado dentro del email y límite de tiempo
  it('test_email_con_varios_comprobantes_y_determinismo', () => {
    const otherPayment = receipt({ operationNumber: '00999999', paymentDate: '2026-11-12' });

    // Uno ya imputado y otro nuevo: se descarta solo el primero.
    expect(evaluateEmailReceipts([receipt(), otherPayment], [receipt()]).map((v) => v.kind)).toEqual([
      'duplicado',
      'nuevo',
    ]);
    // Dos iguales en el mismo email, sin imputados: cuenta uno solo.
    expect(evaluateEmailReceipts([receipt(), receipt()], []).map((v) => v.kind)).toEqual(['nuevo', 'duplicado']);

    // Mil imputados del cliente, preparados fuera de la medición.
    const thousand = Array.from({ length: 1000 }, (_, i) =>
      receipt({ operationNumber: String(i).padStart(8, '0'), amountCents: 100_000 + i }),
    );
    const candidate = receipt({ operationNumber: '00000999', amountCents: 100_999 });

    const t0 = performance.now();
    const first = evaluateReceipt(candidate, thousand);
    const t1 = performance.now();
    const second = evaluateReceipt(candidate, thousand);
    const t2 = performance.now();

    expect(second).toEqual(first);
    expect(first.kind).toBe('duplicado');
    expect(t1 - t0).toBeLessThan(50);
    expect(t2 - t1).toBeLessThan(50);
  });
});
