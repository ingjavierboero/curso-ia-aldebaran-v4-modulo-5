# Decisiones FEAT-017a

- `forbiddenInUnit` sigue los imports de un test de forma transitiva solo dentro de `server/test/` (helpers), no hacia `server/src/`: `resolve-database-path` importa `client.js` sin abrir la base y debe quedar en unit. — implementador, revisado por el orquestador (autonomy minimal) — 2026-11-17 — Block 1
- Un módulo vetado matchea por segmento del especificador (`drizzle-orm/better-sqlite3/migrator` cuenta); `node:net`/`node:http` solo con esa forma exacta. — implementador, revisado por el orquestador — 2026-11-17 — Block 1
- `test_layout_unit_sin_base_ni_http` exige también la contracara: cada test de `integration/` toca algún token vetado (segunda mitad de FR-03). — implementador, revisado por module-verifier y arch-auditor — 2026-11-17 — Block 1
- `test_layout_mudanza_conserva_los_98_archivos` queda atado a la lista `test-files-before-FEAT-017a.txt`: si en el futuro se borra o renombra uno de esos tests, se actualiza la lista en el mismo commit (W-04 del arch-auditor). — orquestador — 2026-11-17 — Block 1
- `test_layout_proyectos_disjuntos_y_no_vacios` verifica además que el `vitest.config.ts` raíz liste los dos configs del server y `web` (W-05 del arch-auditor). — orquestador — 2026-11-17 — Block 1
