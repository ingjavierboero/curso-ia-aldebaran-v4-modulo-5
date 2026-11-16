# Verification FEAT-010

Verificación cruzada por `daw-module-verifier` (agente que no escribió el código) sobre `426b773`, diff `5d6b4cb..HEAD`. Suite completa 628/628, `oxlint --type-aware` y `tsc -b` limpios.

| Field | Value |
|---|---|
| Module | clientes, productos y asignaciones: server/src (domain/client, domain/product, application/client, application/product, infrastructure/db, infrastructure/http) y web/src (api, pages, router, components) |
| Line coverage | 94.85% |
| Branch coverage | 92.10% |
| Function coverage | 95.92% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean; `npm run typecheck` (`tsc -b`) — clean |

Cobertura medida solo sobre los 79 archivos fuente nuevos o modificados del ticket (json-summary v8). La suite completa con el comando del reporte de tests da 95.92 / 92.52 / 96.86.

## Acceptance criteria
- ✅ AC-01 — `test_http_alta_cliente_aparece_en_listado`, `test_create_client_activo_con_fecha_de_alta`, `test_web_clientes_listado_y_alta` (CreateClient.ts:execute, routes/clients.ts)
- ✅ AC-02 — `test_http_alta_cliente_sin_campos_rechazado`, `test_client_datos_invalidos_rechazados` (Client.ts, body.ts)
- ✅ AC-03 — `test_http_modificar_cliente_y_ver_detalle`, `test_update_client_modifica_datos`, `test_web_editar_cliente`
- ✅ AC-04 — `test_http_baja_y_reactivacion_cliente`, `test_deactivate_reactivate_client`, `test_web_baja_reactivacion_cliente`
- ✅ AC-05 — `test_http_condicion_iva_invalida_rechazada`, `test_iva_condicion_invalida_rechazada` (IvaCondition.ts:of)
- ✅ AC-06 — `test_http_cuit_invalido_rechazado`, `test_cuit_digito_verificador_invalido_rechazado`, `test_cuit_prefijo_invalido_rechazado`, `test_web_alta_cliente_cuit_invalido_rechazado` (Cuit.ts:parse)
- ✅ AC-07 — `test_http_cuit_y_email_duplicados_conflict`, `test_create_client_cuit_duplicado_rechazado`, `test_update_client_email_duplicado_rechazado`, `test_web_cliente_duplicado_conflict_muestra_error`
- ✅ AC-08 — `test_http_alta_producto_precio_texto`, `test_price_ida_y_vuelta_sin_perdida`, `test_web_productos_listado_precio_formateado` (Price.ts)
- ✅ AC-09 — `test_http_precio_invalido_rechazado`, `test_price_cero_o_negativo_invalido`, `test_web_precio_invalido_rechazado`
- ✅ AC-10 — `test_http_modificar_producto_a_dolares`, `test_update_product_nombre_precio_moneda`, `test_web_editar_producto_y_desactivar`
- ✅ AC-11 — `test_http_nombre_producto_duplicado_conflict`, `test_create_product_nombre_duplicado_rechazado`, `test_product_nombre_normalizado`
- ✅ AC-12 — `test_http_desactivar_producto_asignado`, `test_deactivate_product_conserva_asignaciones`, `test_assign_producto_inactivo_rechazado_todo_o_nada`
- ✅ AC-13 — `test_http_asignar_dos_productos_a_cliente_inactivo`, `test_assign_productos_a_cliente_inactivo`, `test_web_detalle_asignar_y_desasignar`
- ✅ AC-14 — `test_http_asignar_ya_asignado_conflict`, `test_assign_producto_ya_asignado_rechazado`, `test_client_product_repo_asignacion_duplicada_rechazada`
- ✅ AC-15 — `test_http_desasignar_producto`, `test_unassign_producto`, `test_web_detalle_asignar_y_desasignar`
- ✅ AC-16 — `test_http_consulta_forbidden_en_escrituras`, `test_consulta_no_autorizado_a_modificar`, `test_authorization_permisos_de_clientes_y_productos`, `test_web_consulta_sin_acciones_de_escritura`
- ✅ AC-17 — `test_race_dos_altas_mismo_cuit_conflict`, `test_http_altas_simultaneas_mismo_cuit`, `test_client_repo_cuit_duplicado_rechazado`

Los tests HTTP verifican el body completo y el estado de la base con consultas directas, no solo el código de estado.

## Spec blocks
- ✅ Block 1 — 14/14 Required tests presentes y en verde: `test_cuit_valido_30711111111`, `test_cuit_digito_verificador_invalido_rechazado`, `test_cuit_prefijo_invalido_rechazado`, `test_cuit_formato_invalido_rechazado`, `test_iva_condicion_invalida_rechazada`, `test_price_ida_y_vuelta_sin_perdida`, `test_price_cero_o_negativo_invalido`, `test_price_formato_invalido_rechazado`, `test_currency_invalida_rechazada`, `test_client_datos_invalidos_rechazados`, `test_client_baja_y_reactivacion_idempotentes`, `test_product_nombre_normalizado`, `test_product_datos_invalidos_rechazados`, `test_authorization_permisos_de_clientes_y_productos`
- ✅ Block 2 — 9/9 Required tests presentes y en verde: `test_client_repo_contrato_insert_find_list`, `test_client_repo_cuit_duplicado_rechazado`, `test_client_repo_email_duplicado_rechazado`, `test_product_repo_contrato_insert_find_list`, `test_product_repo_nombre_duplicado_rechazado`, `test_client_product_repo_asignacion_duplicada_rechazada`, `test_client_product_repo_assign_unassign_list`, `test_migracion_clientes_productos`, `test_uow_error_revierte_clientes_productos`
- ✅ Block 3 — 20/20 Required tests presentes y en verde: `test_create_client_activo_con_fecha_de_alta`, `test_update_client_modifica_datos`, `test_update_client_mismo_cuit_propio_no_es_duplicado`, `test_create_client_cuit_duplicado_rechazado`, `test_update_client_email_duplicado_rechazado`, `test_deactivate_reactivate_client`, `test_client_inexistente_no_encontrado`, `test_create_product_activo`, `test_update_product_nombre_precio_moneda`, `test_create_product_nombre_duplicado_rechazado`, `test_deactivate_product_conserva_asignaciones`, `test_assign_productos_a_cliente_inactivo`, `test_assign_producto_inactivo_rechazado_todo_o_nada`, `test_assign_producto_ya_asignado_rechazado`, `test_assign_producto_inexistente_no_encontrado`, `test_unassign_producto`, `test_unassign_producto_no_asignado_rechazado`, `test_consulta_no_autorizado_a_modificar`, `test_consulta_puede_listar_y_ver_detalle`, `test_race_dos_altas_mismo_cuit_conflict`
- ✅ Block 4 — 20/20 Required tests presentes y en verde: `test_http_alta_cliente_aparece_en_listado`, `test_http_alta_cliente_sin_campos_rechazado`, `test_http_modificar_cliente_y_ver_detalle`, `test_http_baja_y_reactivacion_cliente`, `test_http_condicion_iva_invalida_rechazada`, `test_http_cuit_invalido_rechazado`, `test_http_cuit_y_email_duplicados_conflict`, `test_http_alta_producto_precio_texto`, `test_http_precio_invalido_rechazado`, `test_http_modificar_producto_a_dolares`, `test_http_nombre_producto_duplicado_conflict`, `test_http_desactivar_producto_asignado`, `test_http_asignar_dos_productos_a_cliente_inactivo`, `test_http_asignar_ya_asignado_conflict`, `test_http_asignar_lista_invalida_rechazada`, `test_http_desasignar_producto`, `test_http_desasignar_no_asignado_no_encontrado`, `test_http_consulta_forbidden_en_escrituras`, `test_http_altas_simultaneas_mismo_cuit`, `test_http_listados_1000_registros_rapidos`
- ✅ Block 5 — 12/12 Required tests presentes y en verde: `test_web_clientes_listado_y_alta`, `test_web_alta_cliente_cuit_invalido_rechazado`, `test_web_cliente_duplicado_conflict_muestra_error`, `test_web_editar_cliente`, `test_web_baja_reactivacion_cliente`, `test_web_detalle_asignar_y_desasignar`, `test_web_productos_listado_precio_formateado`, `test_web_precio_invalido_rechazado`, `test_web_editar_producto_y_desactivar`, `test_web_consulta_sin_acciones_de_escritura`, `test_web_respuesta_invalida_error_generico`, `test_web_rutas_catalogo_requieren_sesion`

Los 75 identificadores aparecen en los archivos de test; ninguno falta. Desvíos y supuestos aprobados en `docs/daw/specs/decisions-FEAT-010.md`.

## Tests
- ✅ Sad-path tests: cada endpoint y función con entrada tiene casos inválidos — campos faltantes o en blanco, CUIT con dígito o prefijo inválido, condición IVA fuera de la lista o como texto, precio cero, negativo, numérico o con 3 decimales, moneda EUR, lista de asignación vacía, repetida o de 51 ids, `:id` de más de 64 caracteres, PATCH vacío, duplicados (409), inexistentes (404), Consulta (403); en la web CUIT y precio inválidos, 409, 403 y respuesta con forma inválida.

## Warnings
- ⚠️ W-VER-01 — métodos de dominio sin uso en producción (`Cuit.toString`, `IvaCondition.equals`, `Price.equals`) y exports web usados solo en tests (`isValidCuit`, `isValidPrice`).
- ⚠️ W-VER-02 — lógica central entre 66% y 88% en algún eje: `spanishOrder.ts` (ramas, el desempate por id no se ejercita), `Cuit.ts`, `IvaCondition.ts`, `Price.ts` y `Email.ts` (funciones, por los métodos de W-VER-01). `Client.ts` y `Product.ts` al 100%.
- ⚠️ W-VER-03 — el test de `sortBySpanishText` no puede detectar si se quita el desempate (Array.sort es estable); test de 1000 registros con tiempo real (mitigado con calentamiento y mediana); AC-17 con carrera emulada (aceptado en decisions); `web/src/test/antdQueries.ts` depende de clases internas de antd.
- ℹ️ `ClientsPage.tsx` y `ClientDetailPage.tsx` con 78.57% de ramas por archivo (401/403 al cargar, guardas de carga obsoleta, cancelar el modal); el agregado del ticket supera el piso.
- ℹ️ `server/src/main.ts` sin cobertura (raíz de composición; `testApp.ts` replica el armado).
- ℹ️ Deuda registrada en decisions: piezas compartidas no aplicadas a usuarios, `users.ts` sin `boundedParam`, `DrizzleUserRepository` duplicado y con email corrupto → 400, value objects a `domain/shared` al empezar facturación, dos borrados con `rm`.

Result: PASSED
