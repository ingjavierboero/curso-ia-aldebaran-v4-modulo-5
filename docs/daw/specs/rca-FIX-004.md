# RCA FIX-004: El SAST bloquea solo por dependencias de producción

| Field | Value |
|-------|-------|
| Ticket | FIX-004 |
| Tracker | none |
| Date | 2026-11-17 |
| PRD loops | 0 |
| Loops since last human decision | 0 |

## Context and Problem

El cierre de CODE de FEAT-016 quedó bloqueado en el SAST: `npm audit` reporta 7 vulnerabilidades
High por GHSA-fc5q-39xc-vjpf, un ReDoS en `picomatch` (rango `<= 4.0.7`, que es la última versión
publicada, sin versión corregida). Lo traen solo herramientas de desarrollo: vite, vitest,
`@vitest/coverage-v8`, `@vitejs/plugin-react`, tinyglobby y fdir. `npm audit --omit=dev` da 0.

**Causa raíz:** el SAST audita todas las dependencias, también las de desarrollo, y el catálogo de
DAW no permite suprimir una High. Un aviso sin versión corregida en una herramienta de desarrollo
bloquea entonces el cierre de CODE de cualquier ticket, aunque no llegue a producción y aunque el
ataque necesite patrones glob que solo escribe el equipo, en la configuración de vite y vitest.

**Cadena:** el aviso se publicó el 2026-10-19 y se actualizó el 2026-11-17. FEAT-011 cerró ese día a
la mañana con `npm audit` en 0, y FEAT-016 lo encontró a la tarde. No hay `npm audit fix` posible:
lo único que ofrece `--force` es bajar de versión mayor vite y vitest.

**Componente afectado:** el alcance del audit de dependencias del SAST, declarado en `AGENTS.md`
(`## Stack`). No hay código de la app involucrado.

**PRD relacionado:** `prd-FEAT-005.md` (Dependabot). Revisa las dependencias npm todas las semanas y
propone las actualizaciones en un PR agrupado, así que la versión corregida de picomatch va a llegar
por ahí cuando se publique. **Gap en el PRD:** no.

## Goals

- Que un aviso de seguridad en una dependencia que no llega a producción no frene el cierre de los tickets.
- Que esos avisos sigan a la vista en cada reporte SAST hasta que Dependabot traiga la versión corregida.

## Functional Requirements

- FR-01: El SAST debe bloquear por las vulnerabilidades Critical y High que reporta `npm audit --omit=dev`, es decir, las de las dependencias que llegan a producción.
- FR-02: El reporte SAST debe listar las vulnerabilidades de las dependencias de desarrollo (paquete, aviso y ubicación en el lockfile), sin que bloqueen.
- FR-03: `AGENTS.md` debe declarar en `## Stack` el comando de audit que usa el SAST: `npm audit --omit=dev`.
- FR-04: La decisión debe quedar registrada en un ADR, con las opciones consideradas.

## Non-Functional Requirements

- NFR-01: Al cerrar el ticket, `npm audit --omit=dev` reporta 0 vulnerabilidades Critical o High.

## Acceptance Criteria

- AC-01 (FR-01, NFR-01): WHEN el SAST audita las dependencias, THE SAST SHALL bloquear solo si `npm audit --omit=dev` reporta al menos una vulnerabilidad Critical o High.
- AC-02 (FR-02): IF `npm audit` completo reporta una vulnerabilidad High solo en dependencias de desarrollo, THEN THE reporte SAST SHALL nombrar el paquete, el aviso y la línea del lockfile, sin dar el resultado BLOCKED.
- AC-03 (FR-03): WHEN se lee `## Stack` de `AGENTS.md`, THE archivo SHALL contener la línea `Audit: npm audit --omit=dev`.
- AC-04 (FR-04): WHEN se valida el ADR con `validate_adr.py`, THE ADR SHALL pasar y comparar al menos dos opciones.

## Out of Scope

- Cambiar las reglas de DAW en `.daw/`: el catálogo sigue sin dejar suprimir una High.
- Reemplazar picomatch por otra librería o por código propio, o forzar con `overrides` un PR sin publicar.
- Armar el build y el deploy de producción (script `start`, Dockerfile con `npm ci --omit=dev`): va en su propio ticket.
- Retomar FEAT-016: se hace después, con un SAST nuevo bajo esta regla.

## Risks and Mitigations

- Una vulnerabilidad de una herramienta de desarrollo que sí se pueda explotar (por ejemplo, en el CI) deja de bloquear: el reporte SAST la sigue listando en cada ticket (FR-02), y Dependabot propone la versión corregida apenas se publique (FEAT-005).
- Una dependencia mal clasificada como de desarrollo cuando la usa el server en producción quedaría fuera del bloqueo: `npm audit --omit=dev` se basa en `dependencies` frente a `devDependencies`, así que el build de producción tiene que instalar con `--omit=dev` (ticket del deploy).

## Dependencies

- `prd-FEAT-005.md` (Dependabot): trae la versión corregida de picomatch cuando se publique.
- `AGENTS.md` (`## Stack`).
- FEAT-016 (pausado): es el primer ticket que destraba.
