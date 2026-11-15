# PRD FEAT-007: Cambio de la propia contraseña

| Field | Value |
|-------|-------|
| Ticket | FEAT-007 |
| Tracker | none |
| Date | 2026-11-15 |
| PRD loops | 1 |
| Loops since last human decision | 0 |

## Context and Problem

Hoy un usuario de Aldebaran no puede cambiar su contraseña. La contraseña la elige el primer Admin al
registrarse (FEAT-001) o la pone un Admin al dar de alta a otro usuario (FEAT-006), y desde ese
momento queda fija. Un usuario que recibió una contraseña inicial de un Admin no tiene forma de
reemplazarla por una que solo él conozca, y un usuario que sospecha que su contraseña se filtró no
puede cambiarla ni sacar de sus sesiones a quien la esté usando.

Tampoco existe una pantalla con los datos del propio usuario: el único lugar donde se ven datos de
usuarios es la pantalla de usuarios, y esa es solo para Admin.

Este ticket implementa RF-21 y RF-22 del PRD general (`PRD.md`) para el cambio de contraseña desde el
perfil. La recuperación de la contraseña por email (RF-23 a RF-33) va en FEAT-008.

## Goals

- Que cualquier usuario autenticado, de cualquier perfil, pueda cambiar su propia contraseña.
- Que al cambiarla queden cerradas sus otras sesiones abiertas y siga abierta la sesión desde la que
  la cambió.
- Que cada usuario tenga una pantalla propia con sus datos.

## Functional Requirements

- FR-01: La aplicación web debe ofrecer a un usuario autenticado de cualquier perfil (Admin, Editor o Consulta) una pantalla "Mi perfil", con acceso desde todas las pantallas autenticadas (decisión D-01).
- FR-02: La pantalla "Mi perfil" debe mostrar el nombre, el email y el perfil del usuario autenticado, sin permitir modificarlos.
- FR-03: El sistema debe permitir a un usuario autenticado de cualquier perfil cambiar su propia contraseña ingresando la contraseña actual y la nueva (RF-21).
- FR-04: El sistema debe rechazar el cambio si la contraseña actual ingresada no es la del usuario, sin modificar la contraseña (RF-21).
- FR-05: El sistema debe rechazar el cambio si la contraseña nueva tiene menos de 8 o más de 1024 caracteres (RF-22).
- FR-06: El sistema debe rechazar el cambio si la contraseña nueva es igual a la actual (decisión D-03).
- FR-07: Al cambiar la contraseña, el sistema debe cerrar todas las demás sesiones abiertas del usuario y mantener abierta la sesión desde la que se hizo el cambio (RF-21, AC-249 del PRD general).
- FR-08: La pantalla "Mi perfil" debe pedir la contraseña nueva dos veces y no enviar el cambio mientras las dos no coincidan (decisión D-03).
- FR-09: El sistema debe registrar en el log de autenticación cada intento de cambio de contraseña con su resultado (cambiada, contraseña actual incorrecta, contraseña nueva inválida, error), sin incluir ninguna contraseña (decisión D-02).
- FR-10: La pantalla "Mi perfil" debe informar al usuario si el cambio se realizó o, si fue rechazado, el motivo: contraseña actual incorrecta, contraseña nueva demasiado corta o demasiado larga, o contraseña nueva igual a la actual.

## Non-Functional Requirements

- NFR-01: La contraseña nueva se guarda con el mismo hash seguro que el resto de las contraseñas (argon2id, FEAT-001 NFR-01); 0 contraseñas en texto plano en la base, en los logs o en las respuestas.
- NFR-02: Un usuario solo puede cambiar su propia contraseña: 0 formas de cambiar la contraseña de otro usuario desde esta funcionalidad, cualquiera sea su perfil.
- NFR-03: La regla de largo de la contraseña nueva es la misma que en el registro del primer Admin y en el alta de usuarios: de 8 a 1024 caracteres.

## Acceptance Criteria
*(EARS — see `.daw/rules/validation-rules.instructions.md` §1 for the five patterns)*

- AC-01 (FR-01): WHEN un usuario Consulta abre la aplicación, THE aplicación SHALL mostrarle el acceso a "Mi perfil", y lo mismo SHALL ocurrir para un Editor y para un Admin.
- AC-02 (FR-02): WHEN un usuario Editor llamado "Ana Pérez" con email ana@empresa.com abre "Mi perfil", THE aplicación SHALL mostrar "Ana Pérez", ana@empresa.com y el perfil Editor, sin campos para modificarlos.
- AC-03 (FR-03): WHEN un usuario autenticado cambia su contraseña ingresando la contraseña actual correcta y una nueva de 8 caracteres distinta de la actual, THE sistema SHALL guardar la nueva, y el usuario SHALL poder iniciar sesión con la nueva y no con la anterior.
- AC-04 (FR-03, NFR-02): WHEN un usuario Consulta cambia su contraseña con la contraseña actual correcta, THE sistema SHALL realizar el cambio.
- AC-05 (FR-04): IF un usuario autenticado intenta cambiar su contraseña con una contraseña actual incorrecta, THEN THE sistema SHALL rechazar el cambio, la contraseña SHALL no cambiar y ninguna sesión SHALL cerrarse.
- AC-06 (FR-05): IF un usuario autenticado intenta cambiar su contraseña con una nueva de 7 caracteres, THEN THE sistema SHALL rechazar el cambio y la contraseña SHALL no cambiar.
- AC-07 (FR-05): IF un usuario autenticado intenta cambiar su contraseña con una nueva de 1025 caracteres, THEN THE sistema SHALL rechazar el cambio y la contraseña SHALL no cambiar.
- AC-08 (FR-06): IF un usuario autenticado intenta cambiar su contraseña con una nueva igual a la actual, THEN THE sistema SHALL rechazar el cambio.
- AC-09 (FR-07): WHEN un usuario con 2 sesiones abiertas cambia su contraseña desde una de ellas, THE sistema SHALL rechazar como no autenticada la siguiente solicitud de la otra sesión, y la sesión desde la que hizo el cambio SHALL seguir abierta.
- AC-10 (FR-08): IF en "Mi perfil" la contraseña nueva y su repetición no coinciden, THEN THE aplicación SHALL no enviar el cambio e indicar que no coinciden.
- AC-11 (FR-09): WHEN un usuario intenta cambiar su contraseña con una contraseña actual incorrecta, THE sistema SHALL registrar en el log el intento con el resultado "contraseña actual incorrecta", y el registro SHALL no contener ninguna de las contraseñas ingresadas.
- AC-12 (FR-09, NFR-01): WHEN un usuario cambia su contraseña con éxito, THE sistema SHALL registrar en el log el intento con el resultado "cambiada", y ni el log, ni la respuesta, ni la base SHALL contener la contraseña nueva en texto plano.
- AC-13 (FR-10): WHEN el cambio se realiza, THE aplicación SHALL mostrar un mensaje de confirmación y vaciar el formulario.
- AC-14 (FR-10): IF el cambio es rechazado porque la contraseña actual es incorrecta, THEN THE aplicación SHALL mostrar que la contraseña actual es incorrecta.
- AC-15 (NFR-02): IF una solicitud de cambio de contraseña sin sesión llega al sistema, THEN THE sistema SHALL rechazarla como no autenticada y ninguna contraseña SHALL cambiar.

## Out of Scope

- Recuperación de la contraseña por email (RF-23 a RF-33): FEAT-008.
- Límite de intentos o bloqueo ante contraseñas actuales incorrectas: queda como deuda compartida con el inicio de sesión, que tampoco lo tiene (decisión D-02).
- Modificar el propio nombre, email o perfil desde "Mi perfil": el PRD general solo lo permite a un Admin desde la gestión de usuarios.
- Que un Admin cambie la contraseña de otro usuario.
- Reglas de complejidad de la contraseña más allá del largo (mayúsculas, números, símbolos).

## Risks and Mitigations

- Quien tiene una sesión abierta ajena puede probar contraseñas actuales sin límite: mitigado en parte porque necesita una sesión válida y cada intento queda en el log (FR-09); el límite de intentos queda fuera de alcance por decisión D-02.
- Un usuario cambia la contraseña desde una sesión que no es la que está usando ahora (otra pestaña o dispositivo): las demás sesiones se cierran y tendrá que volver a iniciar sesión en ellas. Es el comportamiento que pide RF-21.
- Decisiones del usuario (2026-11-15): D-01 pantalla "Mi perfil" para los tres perfiles con nombre, email y perfil en solo lectura; D-02 una contraseña actual incorrecta solo da error y queda en el log, sin límite de intentos; D-03 la nueva debe ser distinta de la actual y el formulario pide repetirla; D-04 (W-PRD-06, 15 criterios) se mantiene como un solo ticket, partido en bloques en la spec (server y después web).

## Dependencies

- FEAT-001 (login, sesiones, hash de contraseñas y log de autenticación).
- FEAT-006 (perfiles y layout compartido de las pantallas autenticadas).
- `PRD.md` (PRD general de Aldebaran): RF-13, RF-21 y RF-22, y AC-21, AC-22 y AC-249.
