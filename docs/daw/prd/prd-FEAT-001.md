# PRD FEAT-001: Login de usuarios (inicio/cierre de sesión y registro del primer Admin)

| Field | Value |
|-------|-------|
| Ticket | FEAT-001 |
| Tracker | none |
| Date | 2026-11-04 |
| PRD loops | 2 |
| Loops since last human decision | 0 |

## Context and Problem
Aldebaran todavía no tiene código. Todo lo que el sistema va a hacer (clientes, facturación, control
de pagos) tiene que estar detrás de una sesión de usuario (RF-01 del `PRD.md` del proyecto). Sin un
inicio de sesión no hay forma de proteger ninguna pantalla, y sin un primer usuario no hay nadie que
pueda iniciarla.

Este ticket es el primer paso del MVP: deja un sistema al que solo se entra con email y contraseña,
que permite crear el primer Admin cuando no existe ningún usuario, y que cierra la sesión a pedido o
por inactividad.

Origen de los requerimientos (`PRD.md` raíz): RF-01, RF-02, RF-03, RF-04, RF-05, RF-07, RF-22 (solo
para el registro del primer Admin), RNF-09 y RNF-10; criterios de origen AC-01, AC-02, AC-03, AC-05,
AC-211, AC-212, AC-222, AC-223 y AC-224. RNF-12 (zona horaria) no aplica a este ticket: el
vencimiento de FR-09 es una duración de 24 h y no depende de la zona horaria.

## Goals
- Que ninguna pantalla ni funcionalidad del sistema sea accesible sin una sesión iniciada.
- Que el primer usuario se pueda registrar como Admin sin intervención técnica.
- Que un usuario Activo pueda entrar con su email y su contraseña y salir cuando quiera.
- Que una sesión abandonada deje de ser válida a las 24 h sin actividad.

## Functional Requirements
- FR-01: El sistema debe exigir una sesión iniciada para acceder a cualquier pantalla o funcionalidad, excepto el inicio de sesión y, mientras no exista ningún usuario, el registro del primer Admin.
- FR-02: El sistema debe permitir iniciar sesión a un usuario Activo con su email y su contraseña, sin distinguir mayúsculas de minúsculas en el email (decisión D-01).
- FR-03: El sistema debe rechazar el inicio de sesión cuando la contraseña es incorrecta, el email no corresponde a ningún usuario o el usuario está Inactivo, con el mismo mensaje en los tres casos (decisión D-02).
- FR-04: El sistema debe permitir a un usuario autenticado cerrar su sesión, que deja de ser válida.
- FR-05: Mientras no exista ningún usuario, el sistema debe mostrar, en lugar del inicio de sesión, una pantalla para registrar el primer usuario con su nombre, email y contraseña, que queda Activo y con perfil Admin.
- FR-06: Una vez que existe al menos un usuario, el sistema no debe permitir acceder al registro del primer Admin ni registrar usuarios por esa vía.
- FR-07: El sistema debe rechazar en el registro del primer Admin cualquier contraseña de menos de 8 caracteres.
- FR-08: El sistema no debe incluir el hash de la contraseña en ninguna respuesta, pantalla ni dato que entregue.
- FR-09: El sistema debe dar por vencida la sesión de un usuario cuando pasaron 24 h desde su última actividad.

## Non-Functional Requirements
- NFR-01: Las contraseñas deben almacenarse con hash seguro (bcrypt con costo ≥ 12, o argon2id), nunca en texto plano.

## Acceptance Criteria
*(EARS — see `.daw/rules/validation-rules.instructions.md` §1 for the five patterns)*

- AC-01 (FR-02): WHEN un usuario Activo ingresa su email y su contraseña correctos, THE sistema SHALL iniciar su sesión y darle acceso a la pantalla principal.
- AC-02 (FR-02): WHEN un usuario Activo registrado como `admin@empresa.com` ingresa `Admin@Empresa.com` y su contraseña correcta, THE sistema SHALL iniciar su sesión.
- AC-03 (FR-03): IF un visitante intenta iniciar sesión con una contraseña incorrecta, con un email que no corresponde a ningún usuario o con un usuario Inactivo, THEN THE sistema SHALL rechazar el inicio de sesión mostrando en los tres casos el mismo mensaje "Email o contraseña incorrectos", sin crear ninguna sesión.
- AC-04 (FR-04): WHEN un usuario autenticado cierra su sesión, THE sistema SHALL llevarlo al inicio de sesión y rechazar cualquier solicitud posterior hecha con esa sesión.
- AC-05 (FR-05): WHILE no exista ningún usuario, THE sistema SHALL mostrar la pantalla de registro del primer Admin en lugar del inicio de sesión, y al registrar un nombre, un email y una contraseña de 8 caracteres SHALL dejar ese usuario Activo, con perfil Admin y en condiciones de iniciar sesión.
- AC-06 (FR-07): IF en el registro del primer Admin se ingresa una contraseña de 7 caracteres, THEN THE sistema SHALL rechazar el registro y no crear ningún usuario.
- AC-07 (FR-06): IF existe al menos un usuario y un visitante intenta abrir el registro del primer Admin o invocar esa funcionalidad directamente, THEN THE sistema SHALL rechazar el acceso y no crear ningún usuario.
- AC-08 (FR-01): IF un visitante sin sesión iniciada intenta acceder a cualquier pantalla o funcionalidad distinta del inicio de sesión y, mientras no exista ningún usuario, del registro del primer Admin, THEN THE sistema SHALL rechazar el acceso sin devolver ningún dato.
- AC-09 (FR-09): IF un usuario autenticado no tuvo actividad durante 24 h, THEN THE sistema SHALL exigirle iniciar sesión de nuevo cuando realiza una nueva acción.
- AC-10 (FR-09): WHILE la última actividad de un usuario autenticado fue hace 23 h, THE sistema SHALL ejecutar su nueva acción sin pedirle que inicie sesión.
- AC-11 (FR-08): WHEN el sistema entrega los datos de un usuario (al iniciar sesión, al registrar el primer Admin o al consultar la sesión actual), THE sistema SHALL omitir el hash de la contraseña.
- AC-12 (NFR-01): WHEN se lee el registro almacenado de un usuario creado con una contraseña, THE sistema SHALL tener en el campo de contraseña un hash bcrypt con costo ≥ 12 o un hash argon2id, y no la contraseña en texto plano.

### Decisiones (usuario, 2026-11-04)
- D-01: el email del inicio de sesión no distingue mayúsculas de minúsculas (el `PRD.md` lo establece para el email de facturación de los clientes; se extiende a los usuarios).
- D-02: el rechazo usa un único mensaje genérico para contraseña incorrecta, email inexistente y usuario Inactivo, para no revelar qué emails están registrados.
- D-03 (W-PRD-06): se mantiene como un solo ticket con 12 AC. El único corte entregable por separado (vencimiento por inactividad, 2 AC) dejaba la parte principal en 10 AC, y esa parte no se puede achicar sin dejar de ser entregable.

## Out of Scope
- Alta, modificación, baja y reactivación de usuarios por un Admin (RF-14 a RF-20) y el cierre de sesiones que provoca la baja (RF-18).
- Cambio de contraseña desde el perfil (RF-21) y recuperación de contraseña por email (RF-23 a RF-33). Mientras no existan, sus pantallas no forman parte de las excepciones de FR-01.
- Permisos por perfil Admin, Editor y Consulta (RF-06, RF-08 a RF-13): en este ticket todo usuario autenticado accede a lo mismo.
- Limitación de intentos fallidos de inicio de sesión o bloqueo de cuenta (no está en el `PRD.md`).
- Comportamiento específico del modo mock.

## Risks and Mitigations
- Fuerza bruta sobre el inicio de sesión: no hay límite de intentos en este alcance. Mitigación: el hash costoso de NFR-01 y el mensaje genérico de FR-03; se registra como riesgo para el threat model de PLAN.
- Carrera en el registro del primer Admin (dos registros simultáneos con el sistema vacío): podría dejar dos Admin. Mitigación: FR-06 debe valer también ante solicitudes concurrentes; a resolver en PLAN.
- Repo sin código: este ticket es el primero y arrastra la estructura base del proyecto, lo que agranda el cambio. Mitigación: la estructura se acota en PLAN a lo que este login necesita.

## Dependencies
- `PRD.md` del proyecto: fuente de los requerimientos citados (RF-01 a RF-07, RF-22, RNF-09, RNF-10 y sus AC).
- Ninguna funcionalidad previa. El stack es el declarado en `AGENTS.md` → "Stack"; la estructura base del proyecto se define en PLAN.
