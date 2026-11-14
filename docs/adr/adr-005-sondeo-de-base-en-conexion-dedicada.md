# ADR-005: El sondeo de salud de la base usa una conexión dedicada de solo lectura

| Field | Value |
|-------|-------|
| Date | 2026-11-14 |
| Ticket | FEAT-003 |
| Status | Accepted |

## Context

FEAT-003 (`docs/daw/prd/prd-FEAT-003.md`, NFR-01) pide que la consulta de salud responda en menos de
1 s aun cuando la base no responde, cortando la verificación a los 500 ms. better-sqlite3 es
síncrono (ADR-003): un `setTimeout` o `Promise.race` no puede interrumpir una consulta en curso, así
que el único corte posible es el `busy_timeout` de SQLite. La app abre hoy una sola conexión
(`server/src/infrastructure/db/client.ts`) con el timeout por defecto de 5 s, del que dependen las
escrituras y la transacción IMMEDIATE de `RegisterFirstAdmin`.

## Options considered

### Option 1: aplicar `busy_timeout = 500` sobre la conexión compartida
- **Pros:** no abre nada nuevo.
- **Cons:** bajaba a 500 ms el tiempo de espera de todas las escrituras de la app y debilitaba la transacción IMMEDIATE; un cambio de salud alteraba el comportamiento de auth.

### Option 2: conexión dedicada de solo lectura para el sondeo
- **Pros:** el corte de 500 ms queda acotado al sondeo; abrirla `readonly` impide que el sondeo escriba; una lectura real (`sqlite_master`) detecta un archivo bloqueado o ilegible, cosa que `SELECT 1` no hace.
- **Cons:** una segunda conexión abierta al mismo archivo; mientras espera, bloquea el event loop hasta 500 ms por consulta de salud.

## Decision

Se eligió la opción 2: `SqliteDatabaseProbe` abre su propia conexión `readonly` con
`busy_timeout = 500` y verifica con `SELECT 1 FROM sqlite_master LIMIT 1`. El bloqueo del event loop
de hasta 500 ms se aceptó porque solo ocurre cuando la base ya está con problemas.

## Consequences

- `server/src/infrastructure/db/SqliteDatabaseProbe.ts` crea la conexión en el composition root (`main.ts`) y la cierra al terminar el proceso.
- La conexión principal conserva su timeout de 5 s y nada de auth cambia.
- Si en el futuro la app pasa a una base remota, el sondeo se reemplaza por otro adaptador del mismo puerto.
