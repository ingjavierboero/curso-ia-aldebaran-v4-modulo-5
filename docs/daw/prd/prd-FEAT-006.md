# PRD FEAT-006: Usuarios y perfiles

| Field | Value |
|-------|-------|
| Ticket | FEAT-006 |
| Tracker | none |
| Date | 2026-11-15 |
| PRD loops | 0 |
| Loops since last human decision | 0 |

## Context and Problem

Hoy Aldebaran tiene un único usuario: el primer Admin que se registra al instalar (FEAT-001). No hay
forma de sumar a otras personas ni de darles un perfil con menos permisos, y nada en el sistema
distingue lo que puede hacer un Admin de lo que puede hacer un Editor o un usuario Consulta. Cada
módulo que se construya después (clientes, facturación, pagos, configuración) necesita esa distinción
para decidir quién puede ver y quién puede modificar.

Este ticket implementa RF-06 a RF-20 y RF-161 del PRD general (`PRD.md`) en lo que respecta a
usuarios. Los permisos de los módulos que todavía no existen se aplican cuando se construya cada uno,
con el mismo criterio de perfiles que fija este ticket.

## Goals

- Que un Admin pueda gestionar a todos los usuarios del sistema: verlos, darlos de alta,
  modificarlos, cambiarles el perfil, darlos de baja y reactivarlos.
- Que solo un Admin acceda a los datos de usuarios y a su gestión.
- Que el sistema nunca quede sin un Admin Activo.
- Que el perfil y el estado vigentes de un usuario se respeten desde su siguiente acción, sin esperar
  a que vuelva a iniciar sesión.

## Functional Requirements

- FR-01: El sistema debe mostrar a un Admin el listado de usuarios, Activos e Inactivos, con su nombre, email, perfil y estado (RF-161, RF-06).
- FR-02: El sistema debe permitir a un Admin dar de alta un usuario con nombre, email, perfil (Admin, Editor o Consulta) y contraseña inicial; el usuario queda Activo (RF-14).
- FR-03: El sistema debe rechazar el alta o la modificación de un usuario con un email que ya tiene otro usuario, sin distinguir mayúsculas de minúsculas (RF-15).
- FR-04: El sistema debe rechazar en el alta una contraseña inicial de menos de 8 caracteres (RF-22).
- FR-05: El sistema debe permitir a un Admin modificar el nombre y el email de un usuario (RF-16).
- FR-06: El sistema debe permitir a un Admin modificar el perfil de un usuario (RF-17).
- FR-07: El sistema debe permitir a un Admin dar de baja un usuario, que pasa a Inactivo, y debe cerrar todas sus sesiones abiertas (RF-18).
- FR-08: El sistema debe permitir a un Admin reactivar un usuario Inactivo, que pasa a Activo (RF-19).
- FR-09: El sistema debe rechazar cualquier acción que deje al sistema sin ningún usuario Admin Activo: dar de baja al único Admin Activo o cambiarle el perfil (RF-20).
- FR-10: El sistema no debe incluir el hash de la contraseña en ningún dato de usuario que entregue (RF-07).
- FR-11: El sistema debe rechazar que un usuario Editor o Consulta vea el listado o los datos de usuarios, o que dé de alta, modifique, dé de baja o reactive un usuario (RF-09, RF-10, RF-11, RF-13).
- FR-12: El sistema debe decidir cada acción según el perfil y el estado que el usuario tiene en ese momento, de modo que un cambio de perfil o una baja rigen desde su siguiente acción (RF-17, RF-18).
- FR-13: La aplicación web debe ofrecer a un Admin una pantalla de usuarios con el listado y las acciones de FR-02 y FR-05 a FR-08, y no debe ofrecer el acceso a esa pantalla a un Editor ni a un usuario Consulta.

## Non-Functional Requirements

- NFR-01: Las contraseñas iniciales se guardan con el mismo hash seguro que el resto (argon2id, FEAT-001 NFR-01); 0 contraseñas en texto plano en la base, en los logs o en las respuestas.
- NFR-02: La regla de FR-09 se cumple también ante 2 acciones simultáneas: con 2 Admin Activos que se dan de baja o se cambian el perfil al mismo tiempo, queda como mínimo 1 Admin Activo.
- NFR-03: Las reglas de datos del alta coinciden con las del registro del primer Admin: nombre obligatorio de 1 a 100 caracteres, email válido de hasta 254 caracteres y contraseña de 8 a 1024 caracteres.

## Acceptance Criteria
*(EARS — see `.daw/rules/validation-rules.instructions.md` §1 for the five patterns)*

- AC-01 (FR-01): WHEN un Admin abre el listado de usuarios con un usuario Activo y uno Inactivo, THE sistema SHALL mostrar ambos con su nombre, email, perfil y estado.
- AC-02 (FR-02): WHEN un Admin da de alta un usuario con nombre, email, perfil Editor y contraseña de 8 caracteres, THE sistema SHALL registrarlo Activo con perfil Editor, y ese usuario SHALL poder iniciar sesión con ese email y esa contraseña.
- AC-03 (FR-03): IF existe un usuario con el email ana@empresa.com y un Admin intenta dar de alta otro usuario con Ana@Empresa.com, THEN THE sistema SHALL rechazar el alta y no crear ningún usuario.
- AC-04 (FR-03): IF existe un usuario con el email ana@empresa.com y un Admin intenta modificar otro usuario para que tenga Ana@Empresa.com, THEN THE sistema SHALL rechazar la modificación y el otro usuario SHALL conservar su email.
- AC-05 (FR-04): IF un Admin da de alta un usuario con una contraseña de 7 caracteres, THEN THE sistema SHALL rechazar el alta y no crear ningún usuario.
- AC-06 (FR-05): WHEN un Admin modifica el nombre y el email de un usuario, THE sistema SHALL guardar los datos nuevos, mostrarlos en el listado, y el usuario SHALL poder iniciar sesión con el email nuevo.
- AC-07 (FR-06, FR-12): WHEN un Admin cambia el perfil de un usuario Editor a Consulta, THE sistema SHALL tratar la siguiente acción de ese usuario con los permisos del perfil Consulta, sin que vuelva a iniciar sesión.
- AC-08 (FR-07): WHEN un Admin da de baja a un usuario Activo con 2 sesiones abiertas, THE sistema SHALL pasarlo a Inactivo, rechazar las solicitudes de esas 2 sesiones y rechazar su inicio de sesión.
- AC-09 (FR-08): WHEN un Admin reactiva un usuario Inactivo, THE sistema SHALL pasarlo a Activo y el usuario SHALL poder iniciar sesión.
- AC-10 (FR-09): IF hay un único Admin Activo y un Admin intenta darlo de baja o cambiarle el perfil a Editor, THEN THE sistema SHALL rechazar la acción y el usuario SHALL seguir Activo con perfil Admin.
- AC-11 (FR-09): WHEN hay 2 Admin Activos y un Admin da de baja a uno de ellos, THE sistema SHALL realizar la baja.
- AC-12 (FR-10): WHEN un Admin pide el listado o los datos de un usuario, THE respuesta SHALL no incluir el hash de la contraseña ni ningún campo derivado de ella.
- AC-13 (FR-11): IF un usuario Editor o Consulta pide el listado o los datos de usuarios, THEN THE sistema SHALL rechazar el acceso y no devolver ningún dato de usuarios.
- AC-14 (FR-11): IF un usuario Editor o Consulta intenta dar de alta, modificar, dar de baja o reactivar un usuario, THEN THE sistema SHALL rechazar la acción y nada SHALL cambiar.
- AC-15 (FR-12): IF un usuario fue dado de baja mientras tenía una sesión abierta, THEN THE sistema SHALL rechazar su siguiente solicitud como no autenticada.
- AC-16 (FR-13): WHEN un Admin abre la aplicación, THE aplicación SHALL mostrarle el acceso a la pantalla de usuarios, con el listado y las acciones de alta, modificación, cambio de perfil, baja y reactivación.
- AC-17 (FR-13): WHEN un usuario Editor o Consulta abre la aplicación, THE aplicación SHALL no mostrarle el acceso a la pantalla de usuarios.
- AC-18 (NFR-02): IF 2 Admin Activos se dan de baja entre sí al mismo tiempo, THEN THE sistema SHALL realizar como máximo una de las 2 bajas y SHALL quedar al menos 1 Admin Activo.
- AC-19 (NFR-03): IF un Admin da de alta un usuario con el nombre vacío o de más de 100 caracteres, o con un email con formato inválido, THEN THE sistema SHALL rechazar el alta indicando el dato inválido.

## Out of Scope

- Cambio de la propia contraseña y recuperación de contraseña (RF-21 a RF-33): ticket aparte.
- Permisos de módulos que todavía no existen (configuración, clientes, productos, facturación, pagos, recordatorios, casilla simulada): se aplican al construir cada módulo, con los perfiles de este ticket.
- Borrar usuarios definitivamente: el PRD general solo prevé la baja (Inactivo).
- Historial o auditoría de cambios sobre usuarios.

## Risks and Mitigations

- Un Admin se da de baja a sí mismo o se quita el perfil Admin habiendo otro Admin Activo: el PRD general lo permite (solo protege al último Admin). Su sesión se cierra al darse de baja. Supuesto marcado: se respeta el PRD tal cual.
- Supuesto (el PRD general no lo dice): modificar el nombre o el email de un usuario no cierra sus sesiones; solo la baja las cierra (RF-18).
- Dos Admin que se degradan o se dan de baja a la vez podrían dejar el sistema sin Admin: mitigado por NFR-02.

## Dependencies

- FEAT-001 (login, sesiones y registro del primer Admin): usuarios, perfiles y sesiones ya existen en la base; este ticket los gestiona.
- `PRD.md` (PRD general de Aldebaran): RF-06 a RF-20, RF-22 y RF-161, y AC-04 a AC-20, AC-168, AC-213, AC-214, AC-217 y AC-249.
