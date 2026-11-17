# Verification FEAT-016

| Field | Value |
|---|---|
| Module | server/src/domain/payment/DuplicatePaymentPolicy.ts |
| Line coverage | 100% |
| Branch coverage | 100% |
| Function coverage | 100% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean; `npm run typecheck` (`tsc -b`) — clean |

Suite completa 719/719. Tests en `server/test/domain/DuplicatePaymentPolicy.test.ts`.

## Acceptance criteria
- ✅ AC-01 — `test_pago_reenviado_identico_es_duplicado` (`evaluateReceipt` → `decide`, DuplicatePaymentPolicy.ts:79); verifica `kind` y `matched`
- ✅ AC-02 — `test_numero_de_operacion_con_otro_formato_es_duplicado` (`normalizeOperationNumber`, :36); " 0012 3456 " y "00123456" duplicado, "123456" nuevo
- ✅ AC-03 — `test_numero_de_operacion_con_otro_formato_es_duplicado`; "AB12" contra "ab-12" duplicado
- ✅ AC-04 — `test_pago_con_otra_fecha_u_operacion_es_nuevo` (`matchesOnSharedData`, :65); otra fecha, otra operación y un centavo de diferencia dan nuevo
- ✅ AC-05 — `test_pago_reenviado_identico_es_duplicado`; sin imputados da nuevo
- ✅ AC-06 — `test_datos_faltantes_o_monto_invalido_rechazado`; sin número de operación, con " - " y sin fecha dan posible_duplicado
- ✅ AC-07 — `test_pago_con_otra_fecha_u_operacion_es_nuevo`; sin número y sin coincidencia da nuevo
- ✅ AC-08 — `test_email_con_varios_comprobantes_y_determinismo` (`evaluateEmailReceipts`, :115); [duplicado, nuevo] y [nuevo, duplicado]
- ✅ AC-09 — `test_datos_faltantes_o_monto_invalido_rechazado` (`normalize`, :42); monto null, 0, -10000 y no entero, CUIT null, "" y "   " dan datos_no_extraidos
- ✅ AC-10 — `test_email_con_varios_comprobantes_y_determinismo`; misma decisión dos veces contra 1000 imputados, cada una bajo 50 ms
- ✅ AC-11 — `test_datos_faltantes_o_monto_invalido_rechazado` (`sameIfBothPresent`, :56); imputado sin número de operación da posible_duplicado, y con otra fecha da nuevo
- ✅ AC-12 — `test_datos_faltantes_o_monto_invalido_rechazado`; sin fecha ni número da posible_duplicado y verifica `matched`

## Spec blocks
- ✅ Block 1 — tipos, constantes, las tres funciones exportadas y los 5 tests de la spec: `test_pago_reenviado_identico_es_duplicado`, `test_numero_de_operacion_con_otro_formato_es_duplicado`, `test_pago_con_otra_fecha_u_operacion_es_nuevo`, `test_datos_faltantes_o_monto_invalido_rechazado`, `test_email_con_varios_comprobantes_y_determinismo`

## Tests
- ✅ Sad-path tests: `test_datos_faltantes_o_monto_invalido_rechazado` cubre monto inválido y CUIT faltante (datos no extraídos)
- ⚠️ W-VER-03: el umbral de 50 ms de AC-10 depende de la máquina; se mantiene porque lo fija NFR-02 (docs/daw/specs/decisions-FEAT-016.md)
- ✅ W-1 cerrado en la ronda 2 (8b19e5a): `test_datos_faltantes_o_monto_invalido_rechazado` cubre el imputado inválido (DuplicatePaymentPolicy.ts:92) y `test_email_con_varios_comprobantes_y_determinismo` el comprobante inválido dentro del email (:122)
- ✅ W-2 cerrado en la ronda 2 (8b19e5a): `test_pago_reenviado_identico_es_duplicado` comprueba que el duplicado exacto gana sobre la coincidencia parcial y que `matched` es el completo (:83)
- ⚠️ W-3: evidencia TDD de la ronda 1 parcial (los 5 tests en rojo por "Cannot find module"; AC-11 por aserción). En la ronda 2, cada caso nuevo se vio en rojo con una mutación del código, que se restauró sin diff

Ronda 1 (b268c9a): PASSED con W-1 a W-3; el usuario eligió volver a CODE para agregar los tests.

Result: PASSED
