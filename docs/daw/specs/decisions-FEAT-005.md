# Decisions FEAT-005

- Agrupar las actualizaciones: como máximo 1 PR de npm y 1 de GitHub Actions por semana (grupo `patterns: ["*"]`, `open-pull-requests-limit: 1`), mayores incluidas — usuario — 2026-11-15 — CLASSIFY (aplicado en Block 1).
- Supuesto marcado en el PRD, sin objeción del usuario: la revisión semanal corre el día por defecto de Dependabot (lunes), sin `day` ni `time` — asistente — 2026-11-15 — Block 1.
- Deuda aceptada: `dependabot.test.ts` duplica los helpers de YAML-texto de `ci.test.ts` (WARN del arch-auditor); se sugiere un ticket aparte para extraerlos a un módulo compartido — asistente, dentro del "mismo enfoque" de la spec — 2026-11-15 — Block 1.
