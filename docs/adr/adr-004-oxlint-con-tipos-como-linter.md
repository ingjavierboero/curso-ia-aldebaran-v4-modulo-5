# ADR-004: oxlint con tipos como linter, en lugar de ESLint + typescript-eslint

| Field | Value |
|-------|-------|
| Date | 2026-11-11T23:59Z |
| Ticket | FEAT-002 |
| Status | Accepted |

## Context

FEAT-002 (`docs/daw/prd/prd-FEAT-002.md`) sumó un linter estricto que usa la información de tipos y
bloquea el CI desde el día uno. La primera elección fue ESLint con `typescript-eslint`
(`strict-type-checked`). Al planificar se comprobó que `typescript-eslint` 8.72.2 (y su canary)
declara como peer `typescript >=4.8.4 <6.1.0`, mientras que el repo usa TypeScript 7.0.2, la
reescritura nativa que no expone la API de JavaScript de la que depende ese parser.

## Options considered

### Option 1: ESLint + typescript-eslint con un TypeScript 6 aislado solo para el lint
- **Pros:** conservaba la elección original y el set `strict-type-checked` completo.
- **Cons:** dos versiones de TypeScript conviviendo; el lint podía interpretar tipos distinto que `tsc` 7; un parche a mantener hasta que typescript-eslint soportara TS 7.

### Option 2: oxlint en modo con tipos (`oxlint-tsgolint`)
- **Pros:** construido sobre el TypeScript 7 nativo (tsgo), una sola versión de TypeScript; incluye las reglas con tipos relevantes (promesas sin manejar, `any` inseguros); mucho más rápido.
- **Cons:** su set de reglas no es idéntico a `strict-type-checked`; herramienta más joven que ESLint.

### Option 3: postergar el lint
- **Pros:** CI inmediato con install, typecheck y tests, sin dependencia nueva.
- **Cons:** dejaba sin cubrir un objetivo del PRD hasta un ticket futuro.

## Decision

El usuario eligió la opción 2 (2026-11-11): oxlint en modo con tipos. Pesó que es la herramienta que
funciona sobre el TypeScript que el repo ya usa, sin un segundo compilador que mantener.

## Consequences

- El repo suma `oxlint` y `oxlint-tsgolint` como devDependencies, una config de oxlint en la raíz y un script `lint`.
- Las reglas con tipos activas son las que oxlint implementa, no el set exacto de `strict-type-checked`.
- Si en el futuro typescript-eslint soporta TS 7, migrar a ESLint requiere un ADR nuevo que reemplace a este.
