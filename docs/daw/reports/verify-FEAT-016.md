# Verification FEAT-016

| Field | Value |
|---|---|
| Module | server/src/domain/payment/DuplicatePaymentPolicy.ts |
| Line coverage | 100% |
| Branch coverage | 94.87% |
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
- ⚠️ W-1 (verificación independiente): sin test propio para un imputado con datos inválidos que se descarta del pool (DuplicatePaymentPolicy.ts:92) ni para un comprobante inválido dentro de `evaluateEmailReceipts` (:122)
- ⚠️ W-2 (verificación independiente): sin test propio para que un duplicado exacto gane sobre una coincidencia parcial (:83)
- ⚠️ W-3 (verificación independiente): evidencia TDD parcial: los 5 tests se vieron en rojo antes de implementar, pero por "Cannot find module" (sin aserción ejecutada); solo AC-11 se vio fallar por aserción

Result: PASSED
