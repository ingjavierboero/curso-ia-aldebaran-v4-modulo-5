# Parent PRD: CI en cuatro jobs encadenados: lint, unit, integration y e2e

| Metric | Value |
|--------|-------|
| Ticket | FEAT-017 |
| Date | 2026-11-17 |
| Status | Split |
| Acceptance criteria to cover | 16 |

## Sub-tickets

| Sub-ticket | Title | PRD | ACs | Dependencies | Status |
|---|---|---|---|---|---|
| FEAT-017a | Tests separados en unit e integration, y CI en lint → unit → integration | prd-FEAT-017a.md | AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-13, AC-15, AC-16 | none | done — merged to main (PR #18, 3ee3070) |
| FEAT-017b | Etapa e2e en el CI con Playwright y prueba de humo de inicio de sesión | prd-FEAT-017b.md | AC-01, AC-09, AC-10, AC-11, AC-12, AC-14 | depends on a | active |

Los 16 criterios salen del PRD original de FEAT-017 (validado el 2026-11-17, W-PRD-06 por 16 AC);
la partición la decidió el usuario ese mismo día (D-05). FEAT-017a queda en 10 criterios porque
mover los tests sin las etapas que los usan no cambia nada visible en el PR, y las etapas sin la
reorganización no tienen carpetas que correr.

## Suggested implementation order
a → b

## Original context

La verificación de pull requests (FEAT-002) es una sola etapa que corre lint, tipos y todos los
tests juntos: cuando falla no se sabe en qué. Los tests están ordenados por capa y no por tipo, y no
hay ninguna prueba de punta a punta en navegador. El usuario pidió cuatro etapas encadenadas (lint,
unit, integration, e2e), cada una corriendo solo su carpeta, sin secretos y sin llamar al modelo
real. Decisiones del usuario: tests movidos a carpetas `unit/` e `integration/` según lo que tocan
(D-01, D-02), e2e de humo de inicio de sesión (D-03), chequeo de tipos dentro de lint (D-04).
