# PRD FEAT-003: Chequeo de salud de la app y los jobs

| Field | Value |
|-------|-------|
| Ticket | FEAT-003 |
| Tracker | none |
| Date | 2026-11-14 |
| PRD loops | 1 |
| Loops since last human decision | 1 |

## Context and Problem

Aldebaran depende de procesos automáticos que corren sin nadie mirando: la facturación del día 15, la
revisión de la casilla cada 15 minutos y los recordatorios de fin de mes (PRD.md, RF-51 en adelante).
El PRD registra un error de proceso cuando una operación falla (RF-171 a RF-183), pero nada avisa
cuando un proceso directamente deja de ejecutarse, ni cuando la base de datos no responde. Hoy
ninguno de esos procesos existe todavía; este ticket construye la base que van a usar: un registro
de corridas, un estado de salud consultable y un aviso visible para los usuarios.

## Goals

- Que un monitor externo pueda saber, sin credenciales, si la aplicación está sana.
- Que un usuario con sesión vea qué parte no está sana: la base de datos o un proceso automático.
- Que cada proceso automático futuro tenga dónde registrar sus corridas y cuándo se lo considera atrasado.

## Functional Requirements

- FR-01: El sistema debe exponer una consulta de salud accesible sin iniciar sesión, que informa solo el estado general: "ok" o "degradado".
- FR-02: La consulta de salud, hecha con una sesión válida, debe informar además el estado de la base de datos y el de cada proceso automático registrado (nombre, última corrida, resultado de la última corrida y si está atrasado).
- FR-03: El sistema debe considerar degradado el estado general si la base de datos no responde, si algún proceso registrado está atrasado o si la última corrida de algún proceso registrado terminó con error.
- FR-04: El sistema debe permitir que cada proceso automático se registre con un nombre único y el intervalo esperado entre sus ejecuciones.
- FR-05: El sistema debe registrar cada corrida de un proceso automático: inicio, fin y resultado (exitosa o con error).
- FR-06: El sistema debe considerar atrasado un proceso registrado cuando pasaron más de 2 de sus intervalos desde su última corrida exitosa o, si nunca tuvo una, desde el arranque del sistema.
- FR-07: Mientras el estado general sea degradado, el sistema debe mostrar a todo usuario con sesión un banner en la pantalla principal que indique qué está degradado (la base de datos o el nombre de cada proceso atrasado o con error).

## Non-Functional Requirements

- NFR-01: La consulta de salud debe responder en menos de 1 segundo, aun cuando la base de datos no responde (se corta la verificación de la base a los 500 ms y se informa degradada).
- NFR-02: La respuesta sin sesión no debe incluir ningún dato además del estado general: 0 nombres de procesos, 0 horarios, 0 mensajes de error, 0 versiones.
- NFR-03: La consulta de salud debe indicar el estado también con el código de respuesta: 200 cuando es "ok" y 503 cuando es "degradado", para que un monitor externo lo detecte sin interpretar el contenido.
- NFR-04: El banner de la pantalla principal debe actualizar el estado al menos cada 60 segundos mientras la pantalla está abierta.

## Acceptance Criteria
*(EARS — see `.daw/rules/validation-rules.instructions.md` §1 for the five patterns)*

- AC-01 (FR-01): WHEN se consulta la salud sin sesión y todo está sano, THE sistema SHALL responder 200 con el estado "ok" y ningún otro dato.
- AC-02 (FR-01): WHEN se consulta la salud sin sesión y algo está degradado, THE sistema SHALL responder 503 con el estado "degradado" y ningún otro dato.
- AC-03 (FR-02): WHEN se consulta la salud con una sesión válida, THE sistema SHALL informar el estado general, el de la base de datos y, por cada proceso registrado, su nombre, su última corrida, el resultado de esa corrida y si está atrasado.
- AC-04 (FR-02): IF la sesión enviada es inválida o está vencida, THEN THE sistema SHALL responder como a una consulta sin sesión, sin ningún detalle.
- AC-05 (FR-03): IF la base de datos no responde, THEN THE sistema SHALL informar el estado general "degradado" y la base como no disponible.
- AC-06 (FR-03): IF la última corrida de un proceso registrado terminó con error, THEN THE sistema SHALL informar el estado general "degradado" aunque el proceso no esté atrasado.
- AC-07 (FR-04): IF se intenta registrar un proceso con un nombre ya registrado, THEN THE sistema SHALL rechazar el registro.
- AC-08 (FR-04): IF se intenta registrar un proceso con un intervalo menor o igual a cero, THEN THE sistema SHALL rechazar el registro.
- AC-09 (FR-05): WHEN una corrida de un proceso termina, THE sistema SHALL guardar su inicio, su fin y si fue exitosa o con error.
- AC-10 (FR-06): WHEN pasaron más de 2 intervalos desde la última corrida exitosa de un proceso, THE sistema SHALL informarlo como atrasado.
- AC-11 (FR-06): WHILE un proceso registrado nunca tuvo una corrida exitosa, THE sistema SHALL contar sus intervalos desde el arranque del sistema.
- AC-12 (FR-07): WHILE el estado general es degradado, THE pantalla principal SHALL mostrar a todo usuario con sesión un banner que nombra lo degradado.
- AC-13 (FR-07): WHILE el estado general es "ok", THE pantalla principal SHALL no mostrar el banner.
- AC-14 (NFR-01): IF la base de datos no responde en 500 ms, THEN THE sistema SHALL informarla como no disponible y responder en menos de 1 segundo.

### Decisiones (usuario, 2026-11-14)

- Sin sesión, solo el estado general; con sesión, el detalle.
- Atraso: umbral propio por proceso, 2 intervalos sin corrida exitosa.
- Banner en la pantalla principal ya en este ticket.
- Una última corrida con error también degrada el estado.

## Out of Scope

- Los procesos automáticos en sí (facturación, revisión de la casilla, recordatorios): cada uno se registra cuando se implemente.
- Notificar la degradación por email u otro canal fuera de la aplicación.
- Historial o gráficos de salud a lo largo del tiempo.
- Borrar o depurar corridas viejas.
- Reemplazar los errores de proceso de RF-171 a RF-183: la salud los complementa, no los gestiona.

## Risks and Mitigations

- **Exponer información interna sin sesión**: la respuesta pública solo trae el estado general (NFR-02), verificado por test.
- **Falso "atrasado" justo después de un arranque**: el conteo arranca desde el inicio del sistema y exige más de 2 intervalos (FR-06).
- **Una base colgada vuelve lenta la consulta y el monitor la toma como caída del servicio**: corte a los 500 ms (NFR-01).

## Dependencies

- La sesión y el middleware de autenticación de FEAT-001 (para distinguir consulta con y sin sesión).
- La pantalla principal de FEAT-001 (`HomePage`) para el banner.
- Los procesos automáticos del PRD general (PRD.md) se registrarán cuando existan.
