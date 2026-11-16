# PRD FEAT-008: Recuperación de contraseña por email

| Field | Value |
|-------|-------|
| Ticket | FEAT-008 |
| Tracker | none |
| Date | 2026-11-16 |
| PRD loops | 1 |
| Loops since last human decision | 0 |

## Context and Problem

Un usuario de Aldebaran que se olvida la contraseña hoy no tiene forma de volver a entrar: solo un
Admin puede crearle otro usuario, y si el que se olvidó es el único Admin, el sistema queda sin
acceso. Desde FEAT-007 cada usuario puede cambiar su contraseña, pero solo con la sesión abierta y
sabiendo la actual.

Aldebaran tampoco envía emails todavía. La recuperación es el primer flujo que lo necesita, y la
facturación y los recordatorios lo van a necesitar después. En modo mock la recuperación no está
disponible (RF-199 del PRD general), así que este ticket envía por la casilla real del sistema.

Este ticket implementa RF-22 (para la recuperación) y RF-23 a RF-33 del PRD general (`PRD.md`).

## Goals

- Que un usuario Activo que se olvidó la contraseña pueda definir una nueva desde un enlace que le
  llega por email, sin ayuda de un Admin.
- Que el pedido de recuperación no revele qué emails están registrados.
- Que un enlace robado o viejo no sirva: vence a los 10 minutos, se usa una sola vez y queda anulado
  cuando se pide otro.
- Que el sistema pueda enviar emails desde la casilla del sistema, con una redirección para desarrollo.

## Functional Requirements

- FR-01: La pantalla de inicio de sesión debe ofrecer el acceso a "Olvidé mi contraseña", donde se pide la recuperación ingresando un email (RF-23).
- FR-02: Cuando se pide la recuperación para el email de un usuario Activo, el sistema debe enviarle desde la casilla del sistema un email con una URL que contiene un token de recuperación (RF-24).
- FR-03: El sistema debe armar la URL del email con la dirección de la aplicación configurada (por defecto http://localhost:5173), nunca con datos de la solicitud recibida (RF-24).
- FR-04: Al pedir la recuperación, el sistema debe mostrar el mismo mensaje de confirmación tanto si el email corresponde a un usuario Activo como si no, y también si el envío del email falla (RF-25, decisión D-03).
- FR-05: El sistema no debe enviar ningún email cuando el email pedido no corresponde a un usuario Activo (RF-25).
- FR-06: El sistema debe invalidar el token a los 10 minutos del envío del email (RF-26).
- FR-07: El sistema debe invalidar el token una vez que se usó para cambiar la contraseña (RF-27).
- FR-08: Al enviar un token nuevo a un usuario, el sistema debe invalidar sus tokens anteriores (RF-28).
- FR-09: El sistema debe validar el token al ingresar a la URL y al confirmar la nueva contraseña (RF-29).
- FR-10: Si el token no es válido (inexistente, vencido o ya usado), el sistema debe mostrar un mensaje de error y, a los 5 segundos, redirigir al inicio de sesión (RF-30, RF-31).
- FR-11: Si el token es válido al ingresar a la URL, el sistema debe mostrar la pantalla de cambio de contraseña, que pide la nueva contraseña dos veces (RF-32).
- FR-12: El sistema debe rechazar en la recuperación una contraseña nueva de menos de 8 o más de 1024 caracteres (RF-22).
- FR-13: Una vez cambiada la contraseña con el token, el sistema debe cerrar todas las sesiones abiertas del usuario y redirigir al inicio de sesión (RF-33, decisión D-01).
- FR-14: El sistema debe aceptar como máximo 5 pedidos de recuperación por IP en 15 minutos; los pedidos de más se rechazan indicando en cuántos minutos se puede volver a intentar (decisión D-02).
- FR-15: El sistema debe enviar como máximo 1 email de recuperación cada 5 minutos a un mismo usuario; un pedido dentro de ese lapso responde el mismo mensaje de confirmación sin enviar ni generar un token nuevo (decisión D-02).
- FR-16: El sistema debe aceptar como máximo 5 confirmaciones con token inválido por IP en 15 minutos, y rechazar las siguientes durante 15 minutos sin validar el token (supuesto S-01).
- FR-17: Mientras la redirección de emails de desarrollo esté configurada, el sistema debe enviar todos los emails a esa única dirección en lugar de al destinatario original (supuesto S-04).
- FR-18: El sistema debe registrar en el log cada pedido de recuperación (con el resultado: enviado, sin usuario, limitado o envío fallido) y cada confirmación (cambiada, token inválido, contraseña inválida), sin contraseñas ni tokens.

## Non-Functional Requirements

- NFR-01: El token de recuperación tiene al menos 128 bits de aleatoriedad y se guarda solo como hash: 0 tokens en texto plano en la base o en los logs (supuesto S-02).
- NFR-02: La nueva contraseña se guarda con el mismo hash seguro que el resto (argon2id); 0 contraseñas en texto plano en la base, en los logs o en las respuestas.
- NFR-03: La respuesta al pedido de recuperación tarda lo mismo, con una diferencia de menos de 100 ms en la mediana, exista o no el email, para no revelarlo por el tiempo de respuesta.
- NFR-04: Las credenciales de la casilla del sistema se leen solo de variables de entorno; 0 credenciales en el código o en el repositorio.

## Acceptance Criteria
*(EARS — see `.daw/rules/validation-rules.instructions.md` §1 for the five patterns)*

- AC-01 (FR-01, FR-02): WHEN un usuario Activo pide la recuperación con su email desde "Olvidé mi contraseña", THE sistema SHALL enviarle un email con una URL que contiene un token de recuperación.
- AC-02 (FR-03): WHEN la dirección de la aplicación configurada es https://aldebaran.empresa.com y el pedido llega con el header Host: otro-sitio.com, THE URL del email SHALL empezar con https://aldebaran.empresa.com; y sin dirección configurada, SHALL empezar con http://localhost:5173.
- AC-03 (FR-04, FR-05): IF se pide la recuperación con un email que no corresponde a ningún usuario Activo, THEN THE sistema SHALL mostrar el mismo mensaje de confirmación que para un usuario Activo y no enviar ningún email.
- AC-04 (FR-04): IF el envío del email falla para un usuario Activo, THEN THE sistema SHALL mostrar el mismo mensaje de confirmación y registrar el error en el log.
- AC-05 (FR-06, FR-09, FR-11): WHEN un usuario ingresa a la URL con un token sin usar enviado hace 9 minutos, THE sistema SHALL mostrar la pantalla de cambio de contraseña.
- AC-06 (FR-06, FR-10): IF un usuario ingresa a la URL con un token enviado hace 11 minutos, THEN THE sistema SHALL mostrar un mensaje de error y a los 5 segundos (±1 s) redirigir al inicio de sesión.
- AC-07 (FR-07, FR-10): IF un usuario vuelve a ingresar a la URL de un token que ya usó para cambiar la contraseña, THEN THE sistema SHALL mostrar un mensaje de error y a los 5 segundos (±1 s) redirigir al inicio de sesión.
- AC-08 (FR-08, FR-10): WHEN un usuario pidió dos veces la recuperación con más de 5 minutos de diferencia, THE URL del primer email SHALL mostrar el mensaje de error y la del segundo SHALL mostrar la pantalla de cambio de contraseña.
- AC-09 (FR-09, FR-10): IF el token vence mientras la pantalla de cambio está abierta y el usuario confirma la nueva contraseña, THEN THE sistema SHALL mostrar un mensaje de error, la contraseña SHALL no cambiar y a los 5 segundos (±1 s) SHALL redirigir al inicio de sesión.
- AC-10 (FR-12): IF el usuario confirma con un token válido una contraseña nueva de 7 caracteres, THEN THE sistema SHALL rechazarla, la contraseña SHALL no cambiar y el token SHALL seguir válido.
- AC-11 (FR-13): WHEN un usuario con 2 sesiones abiertas confirma una contraseña nueva con un token válido, THE sistema SHALL cambiar la contraseña, cerrar las 2 sesiones y redirigir al inicio de sesión, y el usuario SHALL poder iniciar sesión con la nueva.
- AC-12 (FR-14): IF una misma IP envía 6 pedidos de recuperación dentro de 15 minutos, THEN THE sistema SHALL rechazar el sexto indicando en cuántos minutos se puede volver a intentar.
- AC-13 (FR-15): WHEN se pide la recuperación de un mismo usuario Activo 2 veces en 3 minutos, THE sistema SHALL mostrar el mismo mensaje las 2 veces, enviar 1 solo email y la URL de ese email SHALL seguir válida.
- AC-14 (FR-16): IF una misma IP confirma 5 veces con tokens inválidos dentro de 15 minutos, THEN THE sistema SHALL rechazar la sexta confirmación sin validar el token, aunque esta vez el token sea válido.
- AC-15 (FR-17): WHILE la redirección de emails de desarrollo apunta a dev@empresa.com, THE sistema SHALL enviar el email de recuperación de cualquier usuario a dev@empresa.com.
- AC-16 (FR-18, NFR-01): WHEN se pide una recuperación y se confirma un cambio, THE log SHALL registrar el pedido y la confirmación con su resultado, y ni el log ni la base SHALL contener el token ni la contraseña en texto plano.

## Out of Scope

- Modo mock y casilla simulada (RF-184 en adelante, incluido RF-199): ticket aparte.
- Envío de facturas y recordatorios: llegan con la facturación; este ticket deja la base de envío.
- Recuperación para usuarios Inactivos (RF-24 la limita a usuarios Activos).
- Plantillas de email con diseño (HTML con estilos o logos): el email es texto simple.
- Recuperación por otro canal que no sea email (SMS, preguntas de seguridad).

## Risks and Mitigations

- Inundar de emails la casilla de un usuario: mitigado por FR-14 (por IP) y FR-15 (1 email cada 5 minutos por usuario).
- Enumerar emails registrados: mismo mensaje y tiempo de respuesta parejo (FR-04, NFR-03).
- Robo del enlace: vence a los 10 minutos, se usa una sola vez, se anula con un pedido nuevo y el cambio cierra todas las sesiones (FR-06 a FR-08, FR-13).
- Adivinar tokens: alta aleatoriedad (NFR-01) y límite de confirmaciones inválidas por IP (FR-16).
- Gmail rechaza o no responde: el usuario ve el mismo mensaje y el error queda en el log (D-03); puede volver a pedirlo pasados 5 minutos.
- Decisiones del usuario (2026-11-16): D-01 cambiar con token cierra todas las sesiones; D-02 pedido limitado a 5 por IP en 15 minutos y 1 email cada 5 minutos por usuario; D-03 si falla el envío, mismo mensaje y log; D-04 (W-PRD-06, 16 criterios) un solo ticket con la base de envío de emails y la recuperación, elegido en CLASSIFY y partido en bloques en la spec.
- Supuestos marcados (no los dijo el usuario): S-01 límite de 5 confirmaciones con token inválido por IP en 15 minutos, como en FEAT-009; S-02 token aleatorio guardado solo como hash; S-03 email de texto simple con asunto "Recuperación de contraseña de Aldebaran", la URL y el aviso de que vence en 10 minutos; S-04 la redirección de emails es solo para desarrollo y se activa con su variable de entorno.

## Dependencies

- FEAT-001 (usuarios, sesiones, hash de contraseñas y log de autenticación).
- FEAT-007 (reglas de la contraseña nueva y cierre de sesiones).
- FEAT-009 (límite de intentos por IP; este ticket lo extiende al pedido y a la confirmación).
- `PRD.md` (PRD general de Aldebaran): RF-22 a RF-33, RF-199 y glosario (casilla del sistema, redirección de emails); AC-26 a AC-33 y AC-251.
