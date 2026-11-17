# Fix-plan FIX-004: El SAST bloquea solo por dependencias de producción

| Field | Value |
|-------|-------|
| Ticket | FIX-004 |
| Tier | FIX |
| RCA | docs/daw/specs/rca-FIX-004.md |
| Date | 2026-11-17 |
| Spec loops | 0 |
| Loops since last human decision | 0 |

## Problem
`npm audit` reporta 7 High por GHSA-fc5q-39xc-vjpf (picomatch, solo dependencias de desarrollo, sin
versión corregida) y el SAST no deja cerrar CODE en ningún ticket (FR-01, FR-02).

## Root cause
El SAST audita también las dependencias de desarrollo y el catálogo no deja suprimir una High; el
alcance del audit no estaba declarado en `AGENTS.md`, aunque los SAST de FEAT-004 a FEAT-006 ya
usaban `--omit=dev`.

## Solution — steps
1. `AGENTS.md:19` — agregar debajo de `- Lint: npm run lint` la línea `- Audit: npm audit --omit=dev` (FR-03, AC-03).
2. `docs/adr/adr-009-sast-audita-solo-dependencias-de-produccion.md` — registrar la decisión con sus tres opciones (FR-04, AC-04).
3. `docs/daw/security/sast-FIX-004.md` — el SAST de este ticket ya bloquea por `npm audit --omit=dev` y lista en F-SAST-13 los avisos de desarrollo con su línea del lockfile (FR-01, FR-02, AC-01, AC-02, NFR-01).

## Dependencies between steps
El paso 3 corre después del 1, porque el SAST lee el comando de `AGENTS.md`. El paso 2 es independiente.

## Error handling
- `npm audit --omit=dev` da error (sin red o sin registry) — el SAST no concluye: el reporte queda BLOCKED con el error, nunca PASSED.
- `npm audit --omit=dev` reporta una vulnerabilidad Critical o High de producción — el SAST queda BLOCKED, igual que antes de este cambio.

Este ticket no cambia código: los "tests" son verificaciones manuales con comandos, sin
identificador `test_...`, y VERIFY las nombra por posición (Test 1 a Test 5).

## Tests
- [ ] **Regression test** — con el aviso de picomatch todavía presente, `npm audit --omit=dev` sale con código 0 y el reporte SAST de este ticket da PASSED listando GHSA-fc5q-39xc-vjpf en F-SAST-13 (AC-01, AC-02). Antes del fix, el reporte de FEAT-016 daba BLOCKED.
- [ ] `grep -n "Audit: npm audit --omit=dev" AGENTS.md` encuentra la línea dentro de `## Stack` (AC-03).
- [ ] `validate_adr.py` da PASSED sobre ADR-009 (AC-04).
- [ ] Con la red cortada, `npm audit --omit=dev` termina con error y código distinto de 0: confirma que un audit que no corre no se puede leer como limpio.
- [ ] El comando declarado no lleva `--audit-level` ni otra exclusión además de `--omit=dev`: una High en `dependencies` sigue dando error de audit y BLOCKED.

## Regression risk
Bajo: no cambia código de la app ni el CI. El riesgo es que una vulnerabilidad de una herramienta de
desarrollo deje de frenar un ticket; queda listada en cada reporte SAST y Dependabot (FEAT-005) trae
la versión corregida.

## Rollback plan *(mandatory)*
- Steps: trivial: revertir el commit de `AGENTS.md`, y marcar ADR-009 como `Superseded` por un ADR nuevo si se vuelve a auditar todo.
- Indicators: aparece una vulnerabilidad explotable en una herramienta de desarrollo o del CI que tendría que haber frenado un ticket.
