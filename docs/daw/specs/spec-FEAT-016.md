# Spec FEAT-016: No imputar dos veces un pago reenviado

| Field | Value |
|-------|-------|
| Ticket | FEAT-016 |
| PRD | docs/daw/prd/prd-FEAT-016.md |
| Tier | FEATURE |
| Date | 2026-11-17 |
| Spec loops | 0 |
| Loops since last human decision | 0 |

## Summary
Una política de dominio pura, `DuplicatePaymentPolicy`, recibe los datos extraídos de un
comprobante y los comprobantes ya imputados del cliente, y devuelve una decisión: pago nuevo, pago
duplicado, posible pago duplicado o datos no extraídos. No persiste nada ni cambia facturas: el
control de pagos (ticket futuro) consume la decisión (D-07). Un solo bloque. Por decisión del
usuario, este ticket escribe primero los 5 tests y se detiene a mostrar cómo fallan.

## Coverage: PRD → blocks
| Requirement | Covered by |
|---|---|
| FR-01 | Block 1 |
| FR-02 | Block 1 |
| FR-03 | Block 1 |
| FR-04 | Block 1 |
| FR-05 | Block 1 |
| FR-06 | Block 1 |
| FR-07 | Block 1 |
| FR-08 | Block 1 |
| NFR-01 | Strategy: función pura sin reloj ni aleatoriedad; el test evalúa dos veces y compara |
| NFR-02 | Strategy: recorrido lineal sobre los imputados; el test mide con `performance.now()` contra 1000 imputados preparados fuera de la medición, umbral 50 ms |

## Dependencies between blocks
None — Block 1 stands alone.

## Block 1 — Política de pago duplicado (dominio)

**Files**
- `server/src/domain/payment/DuplicatePaymentPolicy.ts` (new) — tipos `PaymentReceipt` y `PaymentVerdict`, constantes `DUPLICATE_PAYMENT_MARK = 'pago duplicado'` y `POSSIBLE_DUPLICATE_REASON = 'posible pago duplicado'`, funciones `normalizeOperationNumber`, `evaluateReceipt` y `evaluateEmailReceipts`.
- `server/test/domain/DuplicatePaymentPolicy.test.ts` (new) — los 5 tests de abajo.

**Logic**
- `PaymentReceipt`: `payerCuit: string | null`, `amountCents: number | null`, `paymentDate: string | null` (`YYYY-MM-DD`), `operationNumber: string | null`. Tipos crudos: el CUIT no pasa por `Cuit.parse`, se normaliza a sus dígitos.
- `PaymentVerdict`: unión discriminada por `kind`: `'nuevo'`, `'duplicado'` (con `matched: PaymentReceipt`), `'posible_duplicado'` (con `matched`), `'datos_no_extraidos'`.
- `normalizeOperationNumber(raw)`: deja solo `[a-z0-9]` ASCII en minúsculas, conserva los ceros a la izquierda; vacío tras normalizar → `null` (FR-02).
- `evaluateReceipt(receipt, imputedForClient)` (FR-01, FR-03, FR-04, FR-05, FR-08):
  1. CUIT vacío o monto que no es un entero seguro mayor que 0 → `datos_no_extraidos`, sin comparar.
  2. Con fecha y número de operación: un imputado igual en CUIT, monto, fecha y número normalizado → `duplicado`; si no → `nuevo`.
  3. Sin número de operación o sin fecha (D-08): un imputado igual en CUIT, monto y el dato restante → `posible_duplicado`; si no → `nuevo`.
  - JSDoc de `imputedForClient`: comprobantes ya imputados del mismo cliente, sin límite de tiempo (S-01); imputado = llevó facturas a Pago recibido o Pagada (S-03).
- `evaluateEmailReceipts(receipts, imputedForClient)`: una decisión por comprobante, en orden (FR-06); cada comprobante se compara también contra los anteriores del mismo email que resultaron `nuevo` (FR-07, D-09).

**Data model**
- Sin modelo persistente: la política no lee ni escribe la base; no hay tabla, columna ni índice nuevo.

**Input validation**
- `payerCuit`: string; se toman sus dígitos; vacío o `null` → dato no extraído.
- `amountCents`: entero seguro mayor que 0; `null`, 0, negativo o no entero → dato no extraído.
- `paymentDate`: string `YYYY-MM-DD` o `null` (null = falta la fecha).
- `operationNumber`: string libre o `null`; se normaliza a `[a-z0-9]`.

**Error handling**
- Monto vacío, cero, negativo o no entero, o CUIT vacío — la política devuelve `datos_no_extraidos` sin comparar y sin lanzar excepciones (FR-08).

**Required tests**
- [ ] test_pago_reenviado_identico_es_duplicado — validates AC-01, AC-05
- [ ] test_numero_de_operacion_con_otro_formato_es_duplicado — validates AC-02, AC-03
- [ ] test_pago_con_otra_fecha_u_operacion_es_nuevo — validates AC-04, AC-07
- [ ] test_datos_faltantes_o_monto_invalido_rechazado — validates AC-06, AC-09 (sad path: monto inválido o CUIT faltante rechazado como datos no extraídos)
- [ ] test_email_con_varios_comprobantes_y_determinismo — validates AC-08, AC-10

**Completion criterion**
Los 5 tests existen y corren. Por decisión del usuario, este ticket se detiene primero con los 5
tests en rojo, para mostrar cómo fallan; la política se implementa recién cuando el usuario lo
pida, y entonces los 5 tests pasan.

## Final verification
`validate_spec.py --tier FEATURE` pasa sobre este documento, y `npm test` corre los 5 tests de
`DuplicatePaymentPolicy.test.ts`.
