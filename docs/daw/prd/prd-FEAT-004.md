# PRD FEAT-004: Banner de salud con sesión inválida y errores de lectura visibles

| Field | Value |
|-------|-------|
| Ticket | FEAT-004 |
| Tracker | none |
| Date | 2026-11-14 |
| PRD loops | 0 |
| Loops since last human decision | 0 |

## Context and Problem

FEAT-003 (`docs/daw/prd/prd-FEAT-003.md`) agregó la consulta de salud y el banner de la pantalla
principal. La revisión del PR #6 encontró dos defectos de comportamiento:

1. **El banner culpa a la base de datos cuando el problema es la sesión.** La consulta de salud
   responde solo el estado general, sin detalle, en dos casos distintos: cuando la base de datos no
   responde y cuando la sesión enviada no es válida (vencida, cerrada, de un usuario Inactivo, o que
   no se pudo validar). El banner trata a los dos igual y nombra "Base de datos". Ejemplo concreto:
   un usuario deja la pantalla principal abierta, la consulta de salud no renueva la sesión, la
   sesión vence a las 24 h sin actividad y, si en ese momento un proceso está atrasado, el banner
   dice "Con problemas: Base de datos" con la base funcionando bien.
2. **Un fallo al leer las corridas se informa como base caída y no deja rastro.** Si la base
   responde pero falla la lectura de las corridas de un proceso (por ejemplo, una corrida guardada
   con una fecha ilegible), toda la base se informa como no disponible, el banner nombra
   "Base de datos" y no queda ningún registro del error para diagnosticarlo.

## Goals

- Que el banner nombre "Base de datos" solo cuando la base es lo que falla, y que un usuario cuya
  sesión se perdió vuelva al inicio de sesión como en el resto de la aplicación.
- Que un fallo al leer las corridas de un proceso se atribuya a ese proceso y quede registrado para
  quien opera el sistema.

## Functional Requirements

- FR-01: Cuando la consulta de salud responde "degradado" sin detalle, la pantalla principal debe confirmar si la sesión del usuario sigue siendo válida antes de decidir qué muestra el banner.
- FR-02: Si esa confirmación indica que la sesión ya no es válida, la aplicación debe llevar al usuario a la pantalla de inicio de sesión, igual que cualquier otra pantalla ante una sesión perdida, sin mostrar el banner.
- FR-03: Si esa confirmación indica que la sesión es válida, el banner debe nombrar "Base de datos" como lo degradado (comportamiento de AC-05 de FEAT-003, sin cambios).
- FR-04: Si la confirmación de la sesión no se puede completar (falla de red o respuesta inesperada), el banner debe conservar lo último que mostraba.
- FR-05: Si la base de datos responde pero falla la lectura de las corridas de un proceso registrado, el sistema debe informar ese proceso como degradado por "lectura fallida", informar la base como disponible y evaluar normalmente los demás procesos.
- FR-06: Cada fallo de lectura de las corridas de un proceso debe quedar registrado en el log del servidor con el nombre del proceso, el tipo de error y la fecha y hora.
- FR-07: El banner de la pantalla principal debe nombrar a un proceso con lectura fallida entre lo degradado, igual que a un proceso atrasado o con error.

## Non-Functional Requirements

- NFR-01: La confirmación de sesión de FR-01 se hace como máximo 1 vez por cada consulta de salud que responde "degradado" sin detalle (con el ciclo de 60 s de FEAT-003, como máximo 1 por minuto por pantalla abierta), y nunca ante una respuesta "ok" o con detalle.
- NFR-02: La respuesta de la consulta de salud sin sesión sigue sin incluir ningún dato además del estado general (NFR-02 de FEAT-003): 0 nombres de procesos, 0 mensajes de error. El texto del error de lectura de FR-06 aparece solo en el log del servidor, nunca en una respuesta: 0 mensajes de error en la respuesta con sesión.
- NFR-03: El registro de FR-06 no incluye datos de la sesión ni del usuario que hizo la consulta: 0 tokens, 0 emails, 0 direcciones IP.

## Acceptance Criteria
*(EARS — see `.daw/rules/validation-rules.instructions.md` §1 for the five patterns)*

- AC-01 (FR-01): WHEN la consulta de salud responde "degradado" sin detalle, THE pantalla principal SHALL confirmar la sesión del usuario una vez antes de actualizar el banner.
- AC-02 (FR-02): IF la confirmación indica que la sesión no es válida, THEN THE aplicación SHALL llevar al usuario a la pantalla de inicio de sesión y THE banner SHALL no nombrar "Base de datos".
- AC-03 (FR-03): WHEN la confirmación indica que la sesión es válida, THE banner SHALL nombrar "Base de datos" como lo degradado.
- AC-04 (FR-04): IF la confirmación de la sesión falla por red o devuelve una respuesta inesperada, THEN THE banner SHALL conservar lo último que mostraba.
- AC-05 (NFR-01): WHILE la consulta de salud responde "ok" o "degradado" con detalle, THE pantalla principal SHALL no confirmar la sesión.
- AC-06 (FR-05): IF la base responde y falla la lectura de las corridas de un proceso, THEN THE consulta de salud con sesión SHALL informar la base como disponible, ese proceso como degradado por lectura fallida y el estado general "degradado".
- AC-07 (FR-05): IF falla la lectura de las corridas de un proceso, THEN THE sistema SHALL evaluar los demás procesos registrados con sus propias corridas, sin marcarlos degradados por ese fallo.
- AC-08 (FR-06): WHEN falla la lectura de las corridas de un proceso, THE servidor SHALL registrar en su log el nombre del proceso, el tipo de error y la fecha y hora.
- AC-09 (NFR-02): IF falla la lectura de las corridas de un proceso, THEN THE respuesta de la consulta de salud SHALL no incluir el texto del error, con o sin sesión.
- AC-10 (FR-07): WHILE un proceso tiene la lectura de sus corridas fallida, THE banner de la pantalla principal SHALL nombrar ese proceso entre lo degradado.
- AC-11 (NFR-03): WHEN se registra un fallo de lectura de corridas, THE registro SHALL no contener el token de sesión, el email del usuario ni su dirección IP.

### Decisiones (usuario, 2026-11-14)

- Hallazgo 1: ante "degradado" sin detalle, el banner confirma la sesión; si no es válida, va al
  inicio de sesión como el resto de la app; si es válida, nombra "Base de datos".
- Hallazgo 2: un fallo de lectura de corridas se loguea en el servidor y degrada solo ese proceso;
  la base sigue disponible y los demás procesos se evalúan normalmente.

### Supuestos (marcados, no decididos por el usuario)

- La confirmación de sesión puede renovar la última actividad de la sesión, como lo hace cualquier
  otra pantalla al confirmar la sesión. Ocurre solo en el caso de FR-01, no en cada consulta de
  salud.
- El scope check se mantiene en un solo ticket: 11 AC, pero dos cambios chicos sobre el mismo
  módulo que se definieron juntos (ver Scope check abajo).

### Scope check

11 criterios de aceptación sobre dos áreas (pantalla principal y consulta de salud del servidor).
Partes independientes: (a) hallazgo 1 — AC-01 a AC-05, se puede entregar solo; (b) hallazgo 2 —
AC-06 a AC-11, se puede entregar solo. El usuario pidió explícitamente arreglar los dos "en un nuevo
ticket" (singular); se mantiene como un solo ticket.

## Out of Scope

- Los hallazgos 3 a 10 de la revisión del PR #6 (logs del sondeo, corte de 500 ms en todo el camino,
  rate limit, servidor caído en el banner, sondeo de escritura, apagado ordenado, atraso por
  reinicios, log del fallo de grabación de una corrida).
- Cambiar qué informa la consulta de salud sin sesión o con la base caída.
- Una confirmación de sesión que no renueve la última actividad.
- Corregir o borrar corridas con datos ilegibles.

## Risks and Mitigations

- **Confirmar la sesión con la base bloqueada puede demorar la respuesta** (FEAT-003 midió ~5 s con
  la base bloqueada): se confirma como máximo una vez por consulta degradada sin detalle (NFR-01), no
  en cada consulta.
- **Una base que se bloquea entre el sondeo y la lectura ahora se informa como procesos con lectura
  fallida en lugar de base no disponible**: cada fallo queda en el log (FR-06) para distinguirlo.
- **Filtrar información interna en el log**: el registro lleva solo nombre del proceso, tipo de
  error y fecha (NFR-03); el texto del error no sale en ninguna respuesta (NFR-02).

## Dependencies

- FEAT-003: consulta de salud, registro de corridas y banner de la pantalla principal.
- FEAT-001: sesión y redirección al inicio de sesión ante una sesión perdida.
