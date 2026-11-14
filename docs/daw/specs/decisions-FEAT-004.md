# Decisiones de implementación — FEAT-004

Supuestos declarados por el implementador, revisados por el orquestador (autonomy `minimal`) y
mostrados al usuario en la conversación.

- El test de FEAT-003 `test_get_health_lectura_de_corridas_con_error_degrada` conserva su nombre y cambia su expectativa a `db: 'disponible'` con el proceso en `readFailed: true` (FR-05) — orquestador (minimal) — 2026-11-14 — Block 1
- `test_get_health_lectura_fallida_registra_nombre_y_tipo_de_error` cubre también un valor lanzado que no es `Error` (`errorType: 'string'`) — orquestador (minimal) — 2026-11-14 — Block 1
- El puerto exporta el tipo `JobReadFailedEvent = { jobName; errorType }` en lugar de la firma en línea de la spec — orquestador (minimal) — 2026-11-14 — Block 1
- Deuda aceptada (WARN 1 del arch-auditor): `err.name` se evalúa fuera del `try` interno de `GetHealth`; un error con getter `name` que lanza haría lanzar `execute()`. Los errores vienen de los repositorios propios, caso patológico — orquestador (minimal) — 2026-11-14 — Block 1
- El typecheck de `server/` queda en rojo entre Block 1 y Block 2 (4 construcciones de `GetHealth` sin `log` en archivos que la spec asigna al Block 2); se cierra en el Block 2 — orquestador (minimal) — 2026-11-14 — Block 1
- `test_health_fecha_invalida_registra_invalid_stored_date` inserta una fila real con `finished_at='zzz-no-es-fecha'` y desvía con `vi.spyOn` las lecturas de `t.jobRuns` (en memoria) a un `DrizzleJobRunRepository` sobre la base del testApp; el resto de los tests de lectura fallida simulan el fallo con un spy que lanza — orquestador (minimal) — 2026-11-14 — Block 2
- `InvalidStoredDate` vive en `parseIsoDate.ts`, junto a quien la lanza — orquestador (minimal) — 2026-11-14 — Block 2
- Deuda aceptada (WARN del arch-auditor): `health.test.ts` usa `vi.spyOn` sin `vi.restoreAllMocks()` en el `afterEach`; hoy aislado porque cada test crea su `t.jobRuns` — orquestador (minimal) — 2026-11-14 — Block 2
