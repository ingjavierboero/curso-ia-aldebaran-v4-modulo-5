# ADR-009: El SAST bloquea solo por las dependencias de producción

| Field | Value |
|-------|-------|
| Date | 2026-11-17 |
| Ticket | FIX-004 |
| Status | Accepted |

## Context

GHSA-fc5q-39xc-vjpf (ReDoS en `picomatch <= 4.0.7`, sin versión corregida) apareció en `npm audit`
como 7 vulnerabilidades High, todas en herramientas de desarrollo (vite, vitest y sus plugins).
`npm audit --omit=dev` daba 0. El SAST auditaba todas las dependencias y el catálogo de DAW no
permite suprimir una High, así que ningún ticket podía cerrar CODE (FEAT-016 quedó pausado). Detalle
en `docs/daw/specs/rca-FIX-004.md`.

## Options considered

### Option 1: auditar solo producción (`npm audit --omit=dev`) para bloquear
- **Pros:** bloquea exactamente por lo que corre en el servidor; los avisos de desarrollo siguen listados en cada reporte; sin código nuevo.
- **Cons:** una vulnerabilidad explotable en una herramienta de desarrollo o del CI deja de frenar un ticket.

### Option 2: esperar la versión corregida sin cambios
- **Pros:** no cambia ninguna regla.
- **Cons:** todos los tickets quedan trabados en CODE sin fecha conocida.

### Option 3: `overrides` a un commit de un PR abierto de picomatch, o un reemplazo propio
- **Pros:** `npm audit` vuelve a 0.
- **Cons:** mete en la cadena de dependencias código no revisado ni publicado, o un motor de globs propio que vite y vitest usarían para encontrar tests y medir cobertura.

## Decision

Se eligió la opción 1, por decisión del usuario. El riesgo del aviso depende de que un atacante pase
patrones glob, y en vite y vitest los patrones salen de la configuración del propio repo; además esas
herramientas no llegan a producción. Dependabot (FEAT-005) propone la versión corregida apenas se
publique.

## Consequences

- `AGENTS.md` (`## Stack`) declara `Audit: npm audit --omit=dev`.
- Cada reporte SAST sigue listando en F-SAST-13 los avisos de desarrollo, con el paquete, el aviso y la línea del lockfile.
- Lo auditado coincide con lo desplegado solo si el deploy instala con `npm ci --omit=dev`; el repo todavía no tiene deploy, así que esa condición queda para ese ticket.
- No cambian las reglas de DAW en `.daw/`.
