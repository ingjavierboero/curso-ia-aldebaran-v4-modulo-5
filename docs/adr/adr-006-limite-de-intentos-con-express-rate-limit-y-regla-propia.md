# ADR-006: Límite de intentos con express-rate-limit como compuerta y regla propia en el dominio

| Field | Value |
|-------|-------|
| Date | 2026-11-15 |
| Ticket | FEAT-009 |
| Status | Accepted |

## Context
FEAT-009 (`docs/daw/prd/prd-FEAT-009.md`) pidió bloquear por IP tras 5 fallos de credenciales en 15
minutos, durante 15 minutos desde el 5.º fallo, sin contar datos mal formados y reiniciando con un
acierto. Además tenía que cerrar las alertas #2, #3 y #5 de CodeQL (`js/missing-rate-limiting`), que
solo reconoce middlewares de librerías conocidas montados en la ruta.

## Options considered

### Option 1: contador propio sin librería
- **Pros:** semántica exacta del PRD; sin dependencia nueva.
- **Cons:** CodeQL no lo reconoce como límite de intentos; las tres alertas seguían abiertas.

### Option 2: express-rate-limit con su MemoryStore o con un Store que cuente
- **Pros:** reconocido por CodeQL; una sola pieza.
- **Cons:** la librería incrementa antes de conocer el resultado: ventana fija en el MemoryStore, y con
  un Store propio el bloqueo llegaba un pedido tarde, los intentos bloqueados y los que estaban en
  curso contaban como fallos (revisión del arch-auditor en PLAN, F1–F3).

### Option 3: express-rate-limit como compuerta + regla de intentos propia
- **Pros:** CodeQL ve el middleware de la librería en cada ruta; el conteo lo decide una regla pura
  del dominio sobre fallos confirmados, que la ruta informa cuando conoce el resultado.
- **Cons:** dos piezas que mantener coordinadas; dependencia nueva.

## Decision
Option 3. La librería quedó como compuerta: su Store no cuenta, solo consulta si la clave está
bloqueada. La regla (`domain/auth/AttemptWindow`) y el registro en memoria por operación
(`infrastructure/http/rateLimit`) deciden el bloqueo. `rate-limiter-flexible` se descartó por la misma
razón que la opción 2: su modelo cuenta en el middleware.

## Consequences
- Dependencia nueva `express-rate-limit` (`^8.7.2`) en `server/`.
- Los limitadores se crean dentro de `createApp`, uno por operación; un reinicio los borra (D-05).
- Las rutas de login, primer Admin y cambio de contraseña informan fallo o acierto al registro.
- Si un escaneo de CodeQL no reconociera la compuerta, la alternativa es exponer el middleware
  devuelto por `rateLimit` sin envolverlo.
