# PRD FEAT-009: Límite de intentos en login, primer Admin y cambio de contraseña

| Field | Value |
|-------|-------|
| Ticket | FEAT-009 |
| Tracker | none |
| Date | 2026-11-15 |
| PRD loops | 1 |
| Loops since last human decision | 0 |

## Context and Problem

Las tres operaciones de Aldebaran que verifican una contraseña o crean credenciales —iniciar sesión,
registrar el primer Admin y cambiar la propia contraseña— aceptan intentos sin límite. Quien quiera
adivinar una contraseña puede probar todas las que quiera, y cada intento obliga al sistema a correr
un hash costoso a propósito, lo que además sirve para cargarlo.

El análisis de seguridad del repositorio marca las tres como vulnerabilidad de severidad alta por falta
de límite de intentos: dos ya están en la rama principal (inicio de sesión y primer Admin) y la
tercera frena el merge del cambio de contraseña (FEAT-007). En FEAT-007 el usuario aceptó ese riesgo
de forma transitoria y luego decidió resolverlo antes de integrar.

## Goals

- Que desde una misma dirección no se puedan probar contraseñas sin límite en ninguna de las tres
  operaciones.
- Que un bloqueo no le cueste al sistema el hash de la contraseña.
- Que un usuario que se equivoca algunas veces y después acierta no quede penalizado.

## Functional Requirements

- FR-01: El sistema debe contar, por cada dirección IP y por separado para cada una de las tres operaciones (iniciar sesión, registrar el primer Admin, cambiar la propia contraseña), los intentos fallidos de los últimos 15 minutos (decisiones D-01, D-02, D-03).
- FR-02: El sistema debe considerar intento fallido de inicio de sesión el rechazado por credenciales incorrectas (email inexistente, contraseña incorrecta o usuario Inactivo), y no el rechazado por datos con forma inválida (decisión D-04).
- FR-03: El sistema debe considerar intento fallido de cambio de contraseña el rechazado porque la contraseña actual es incorrecta, y no el rechazado por la contraseña nueva o por datos con forma inválida (decisión D-04).
- FR-04: El sistema debe considerar intento fallido de registro del primer Admin cualquier intento rechazado, incluido el que llega cuando ya existe un usuario (decisión D-04).
- FR-05: Cuando una IP acumula 5 intentos fallidos de una operación dentro de 15 minutos, el sistema debe rechazar los intentos de esa operación desde esa IP durante los 15 minutos siguientes al quinto fallo (decisión D-02).
- FR-06: Mientras una IP está bloqueada para una operación, el sistema debe rechazar el intento sin verificar la contraseña ni modificar ningún dato (supuesto S-01).
- FR-07: El rechazo por bloqueo debe indicar que hubo demasiados intentos y en cuántos minutos se puede volver a intentar, redondeado hacia arriba (supuesto S-01).
- FR-08: Un intento exitoso de una operación debe poner en cero el contador de esa operación para esa IP, sin afectar los contadores de las otras dos (decisión D-03).
- FR-09: El bloqueo de una operación no debe impedir las otras dos operaciones desde la misma IP (decisión D-03).
- FR-10: El sistema debe registrar en el log de autenticación cada intento rechazado por bloqueo, con la operación, la IP y la fecha, sin contraseñas (supuesto S-02).
- FR-11: La aplicación web debe mostrar el mensaje de rechazo por bloqueo en las pantallas de inicio de sesión, registro del primer Admin y "Mi perfil".

## Non-Functional Requirements

- NFR-01: Un intento rechazado por bloqueo responde en menos de 50 ms medidos en el server, porque no ejecuta el hash de la contraseña (FR-06).
- NFR-02: Los contadores y bloqueos se guardan solo en la memoria del proceso: 0 escrituras en la base por intento fallido, y un reinicio del server los borra (decisión D-05).
- NFR-03: La memoria usada por los contadores está acotada: las entradas sin intentos en los últimos 15 minutos y sin bloqueo vigente se descartan, de modo que ninguna IP ocupa memoria más de 30 minutos después de su último intento.

## Acceptance Criteria
*(EARS — see `.daw/rules/validation-rules.instructions.md` §1 for the five patterns)*

- AC-01 (FR-01, FR-02, FR-05): WHEN una misma IP falla 5 veces el inicio de sesión con contraseña incorrecta dentro de 15 minutos, THE sistema SHALL rechazar por bloqueo el sexto intento aunque la contraseña sea correcta.
- AC-02 (FR-05): WHEN pasan 15 minutos desde el quinto fallo de una IP bloqueada, THE sistema SHALL volver a aceptar el inicio de sesión desde esa IP con las credenciales correctas.
- AC-03 (FR-01): WHEN una IP falla 4 veces el inicio de sesión y el primero de esos fallos tiene más de 15 minutos, THE sistema SHALL no contar ese fallo y SHALL aceptar el siguiente intento correcto.
- AC-04 (FR-02): IF una IP envía 5 inicios de sesión con un email con formato inválido, THEN THE sistema SHALL rechazarlos por datos inválidos sin contarlos, y SHALL aceptar a continuación un inicio de sesión correcto desde esa IP.
- AC-05 (FR-03, FR-05): WHEN un usuario con sesión falla 5 veces la contraseña actual al cambiarla desde la misma IP dentro de 15 minutos, THE sistema SHALL rechazar por bloqueo el sexto intento aunque la contraseña actual sea correcta, y la contraseña SHALL no cambiar.
- AC-06 (FR-03): IF un usuario envía 5 cambios con una contraseña nueva de 7 caracteres, THEN THE sistema SHALL rechazarlos sin contarlos, y SHALL aceptar a continuación un cambio válido desde esa IP.
- AC-07 (FR-04, FR-05): WHEN ya existe un usuario y una IP intenta 5 veces registrar el primer Admin dentro de 15 minutos, THE sistema SHALL rechazar por bloqueo el sexto intento.
- AC-08 (FR-06, NFR-01): WHILE una IP está bloqueada para el inicio de sesión, THE sistema SHALL rechazar sus intentos sin verificar la contraseña y en menos de 50 ms.
- AC-09 (FR-07): WHEN el sistema rechaza un intento por bloqueo con 14 minutos y 10 segundos de bloqueo restantes, THE respuesta SHALL indicar que hubo demasiados intentos y que se puede volver a intentar en 15 minutos.
- AC-10 (FR-08): WHEN una IP falla 4 veces el inicio de sesión y luego inicia sesión con éxito, THE sistema SHALL poner su contador en cero, de modo que 4 fallos más no la bloquean.
- AC-11 (FR-09): WHILE una IP está bloqueada para el inicio de sesión, THE sistema SHALL seguir aceptando desde esa IP el cambio de contraseña de un usuario con sesión.
- AC-12 (FR-10): WHEN el sistema rechaza un intento por bloqueo, THE log de autenticación SHALL registrar la operación, la IP, la fecha y el resultado "bloqueado", sin ninguna contraseña.
- AC-13 (FR-11): WHEN el server rechaza por bloqueo un intento hecho desde la pantalla de inicio de sesión, la de registro del primer Admin o "Mi perfil", THE aplicación SHALL mostrar el mensaje recibido con los minutos de espera.
- AC-14 (NFR-02): IF el server se reinicia mientras una IP está bloqueada, THEN THE sistema SHALL aceptar el siguiente intento correcto desde esa IP.
- AC-15 (NFR-03): WHEN pasan más de 30 minutos desde el último intento de una IP sin bloqueo vigente, THE sistema SHALL no conservar ningún contador para esa IP.

## Out of Scope

- Contar intentos por cuenta o por email (decisión D-01: solo por IP).
- Bloqueo creciente o permanente, CAPTCHA, o aviso por email al usuario.
- Persistir contadores entre reinicios o compartirlos entre varias instancias del server (decisión D-05).
- Configurar los umbrales desde la pantalla de configuración: quedan fijos en 5 intentos y 15 minutos.
- Detectar la IP real detrás de un proxy o balanceador (supuesto S-03).
- Límite de intentos para la recuperación de contraseña por email: llega con FEAT-008.

## Risks and Mitigations

- Varios usuarios detrás de la misma IP (oficina con NAT) se bloquean entre sí: con 5 fallos en 15 minutos y contadores separados por operación el impacto es acotado, y el bloqueo dura 15 minutos.
- Un atacante que cambia de IP puede seguir probando: aceptado por decisión D-01; el bloqueo por IP igual frena el ataque desde una sola máquina y elimina el costo del hash en los bloqueados.
- Si el server queda detrás de un proxy, todos los clientes compartirían la IP del proxy: supuesto S-03 marcado; configurar la IP real queda fuera de alcance.
- Decisiones del usuario (2026-11-15): D-01 por IP; D-02 5 fallos en 15 minutos bloquean 15 minutos; D-03 contadores separados por operación y un éxito reinicia el de su operación; D-04 qué cuenta como fallo en cada operación; D-05 en memoria, se borran al reiniciar.
- D-06 (W-PRD-06, 15 criterios): se mantiene como un solo ticket, partido en bloques en la spec — usuario — 2026-11-15.
- Supuestos marcados y confirmados por el usuario el 2026-11-15: S-01 mientras dura el bloqueo se rechaza sin verificar y la respuesta dice en cuántos minutos se puede reintentar; S-02 cada rechazo por bloqueo queda en el log de autenticación; S-03 la IP es la que ve el server, sin proxy de por medio.

## Dependencies

- FEAT-001 (inicio de sesión, registro del primer Admin y log de autenticación).
- FEAT-007 (cambio de la propia contraseña y pantalla "Mi perfil"; este ticket parte de su rama y se integra antes que el PR #11).
- Análisis de seguridad del repositorio (CodeQL): alertas #2, #3 y #5, `js/missing-rate-limiting`.
