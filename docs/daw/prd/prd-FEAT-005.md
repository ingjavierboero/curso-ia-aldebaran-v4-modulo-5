# PRD FEAT-005: Dependabot semanal para npm y GitHub Actions

| Field | Value |
|-------|-------|
| Ticket | FEAT-005 |
| Tracker | none |
| Date | 2026-11-15 |
| PRD loops | 0 |
| Loops since last human decision | 0 |

## Context and Problem

Las dependencias npm del monorepo (`server/` y `web/`, con un único `package-lock.json` en la raíz) y
las acciones que usa el CI (`.github/workflows/ci.yml`, fijadas por SHA) solo se actualizan si
alguien se acuerda de revisarlas a mano. Una versión vieja con un arreglo de seguridad o de bugs
puede quedar meses sin aplicarse, y nadie se entera.

## Goals

- Que el repositorio proponga solo, cada semana, las actualizaciones disponibles de sus dependencias
  npm y de las acciones del CI, como pull requests que el CI verifica.
- Que esas propuestas no inunden al equipo: como mucho un pull request por ecosistema por semana.

## Functional Requirements

- FR-01: El repositorio debe revisar una vez por semana si hay versiones nuevas de las dependencias
  npm declaradas en el manifiesto y el lockfile de la raíz, que cubren los workspaces `server/` y
  `web/`.
- FR-02: El repositorio debe revisar una vez por semana si hay versiones nuevas de las acciones que
  usan los workflows de `.github/workflows/`.
- FR-03: Cada revisión semanal debe proponer las actualizaciones de un mismo ecosistema agrupadas en
  un único pull request contra `main`.
- FR-04: Las actualizaciones de las acciones deben mantener el formato de fijación por SHA que usa el
  workflow de CI.

## Non-Functional Requirements

- NFR-01: Como máximo 2 pull requests de actualizaciones de versión abiertos al mismo tiempo: 1 de
  npm y 1 de GitHub Actions.
- NFR-02: La configuración no contiene ni requiere secretos: 0 credenciales o tokens escritos en el
  repositorio.
- NFR-03: Frecuencia de revisión: exactamente 1 vez por semana por ecosistema.

## Acceptance Criteria
*(EARS — see `.daw/rules/validation-rules.instructions.md` §1 for the five patterns)*

- AC-01 (FR-01): WHEN llega el día semanal de revisión y hay versiones nuevas de dependencias npm, THE repositorio SHALL abrir un pull request contra `main` que actualiza `package.json`/`package-lock.json`.
- AC-02 (FR-02): WHEN llega el día semanal de revisión y hay versiones nuevas de las acciones del CI, THE repositorio SHALL abrir un pull request contra `main` que actualiza `.github/workflows/ci.yml`.
- AC-03 (FR-03): WHEN en una misma revisión semanal hay varias dependencias npm desactualizadas, THE repositorio SHALL proponerlas todas en un único pull request.
- AC-04 (FR-03): IF el pull request agrupado de la semana anterior sigue abierto, THEN THE repositorio SHALL actualizar ese pull request en lugar de abrir otro del mismo ecosistema.
- AC-05 (FR-04): WHEN se propone actualizar una acción fijada por SHA, THE pull request SHALL reemplazar el SHA por el de la versión nueva y actualizar el comentario de versión.
- AC-06 (FR-01): IF no hay versiones nuevas en un ecosistema, THEN THE repositorio SHALL no abrir ningún pull request de ese ecosistema esa semana.
- AC-07 (NFR-02): WHEN se inspecciona la configuración, THE configuración SHALL contener 0 credenciales o tokens.

## Out of Scope

- Las alertas y actualizaciones de seguridad de Dependabot: se activan en la configuración de GitHub
  del repositorio, no en este archivo, y llegan aparte, apenas se publican.
- Mergear automáticamente los pull requests de actualización: los revisa y mergea una persona.
- Otros ecosistemas (Docker, pip, etc.): el repositorio no los usa.
- Elegir día y hora de la revisión: se usa el valor por defecto (lunes), supuesto marcado abajo.

## Risks and Mitigations

- Un pull request agrupado con una versión mayor que rompe algo bloquea las demás actualizaciones de
  esa semana. Mitigación: el CI corre en el pull request; quien revisa puede excluir esa dependencia
  o cerrar el pull request.
- Supuesto (no lo dijo el usuario): la revisión semanal corre los lunes, valor por defecto de
  Dependabot.

## Dependencies

- El workflow de CI de FEAT-002 (`.github/workflows/ci.yml`): verifica cada pull request que abre
  Dependabot.
- Dependabot de GitHub: el repositorio está en GitHub (`ingjavierboero/curso-ia-aldebaran-v4-modulo-5`).
