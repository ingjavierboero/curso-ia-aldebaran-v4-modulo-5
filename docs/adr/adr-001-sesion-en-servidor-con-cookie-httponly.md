# ADR-001: Sesión en el servidor con cookie httpOnly

| Field | Value |
|-------|-------|
| Date | 2026-11-04 |
| Ticket | FEAT-001 |
| Status | Accepted |

## Context
FEAT-001 introdujo el inicio de sesión. El PRD pide que una sesión cerrada deje de servir de inmediato (AC-04) y que venza a las 24 h sin actividad (FR-09); el `PRD.md` del proyecto además pide cerrar todas las sesiones de un usuario dado de baja (RF-18) o que cambia su contraseña (RF-21).

## Options considered

### Option 1: sesión guardada en el servidor (tabla `sessions`) + cookie httpOnly
- **Pros:** revocación inmediata (borrar la fila); el vencimiento deslizante es un `UPDATE` de `last_activity_at`; RF-18/RF-21 son un `DELETE` por `user_id`; el token es opaco y no expone datos.
- **Cons:** una consulta a SQLite por solicitud autenticada; estado en el servidor.

### Option 2: JWT firmado en cookie o header
- **Pros:** sin consulta por solicitud; sin estado en el servidor.
- **Cons:** no se puede revocar antes de su vencimiento sin una lista de revocación (que reintroduce el estado); el vencimiento deslizante obliga a reemitir el token; un secreto de firma más que custodiar.

## Decision
Se eligió la opción 1, decidida por el usuario el 2026-11-04: los requisitos de revocación de AC-04, RF-18 y RF-21 son el caso que un JWT no resuelve sin estado, y una sola instancia con SQLite local hace despreciable el costo de la consulta por solicitud.

## Consequences
- Tabla `sessions` con `token_hash` (SHA-256 del token, nunca el token) y `last_activity_at` — `server/src/infrastructure/db/schema.ts`.
- Cookie `aldebaran_sid` httpOnly, SameSite=Strict, Secure en producción — `server/src/infrastructure/http/sessionCookie.ts`.
- `authMiddleware.ts` consulta la base en cada solicitud a `/api`.
- Escalar a varias instancias requeriría una base compartida para `sessions`.
