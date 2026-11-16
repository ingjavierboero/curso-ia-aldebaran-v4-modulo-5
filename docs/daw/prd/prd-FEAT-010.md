# PRD FEAT-010: Clientes y productos

| Field | Value |
|-------|-------|
| Ticket | FEAT-010 |
| Tracker | none |
| Date | 2026-11-16 |
| PRD loops | 1 |
| Loops since last human decision | 0 |

## Context and Problem

Aldebaran factura cada mes a sus clientes por los productos que tienen asignados, pero todavía no
tiene dónde registrar clientes ni productos: solo existen usuarios y sesiones. Sin clientes con CUIT,
email de facturación y condición frente al IVA válidos, y sin productos con su cuota, no se puede
construir la facturación ni el control de pagos, que dependen de esos datos.

Este ticket implementa RF-34 a RF-50 del PRD general (`PRD.md`) y los listados que hacen falta para
operarlos (RF-158 sin la deuda vigente, RF-159 y RF-214). Los efectos sobre las facturas (que la
siguiente factura use los datos nuevos) llegan con la facturación.

## Goals

- Que un Admin o un Editor pueda dar de alta, modificar, dar de baja y reactivar clientes y productos.
- Que no se pueda registrar un cliente con un CUIT inválido o repetido, un email de facturación repetido o una condición frente al IVA que ARCA no admite para una Factura C.
- Que se puedan asignar y desasignar productos Activos a los clientes, como base de la facturación.
- Que los tres perfiles vean los clientes y productos, y que Consulta no pueda modificarlos.

## Functional Requirements

- FR-01: El sistema debe permitir a un Admin o Editor dar de alta un cliente con razón social, CUIT, domicilio, email de facturación y condición frente al IVA, todos obligatorios; el cliente queda Activo y registra su fecha de alta (RF-34).
- FR-02: El sistema debe permitir a un Admin o Editor modificar la razón social, el CUIT, el domicilio, el email de facturación y la condición frente al IVA de un cliente (RF-35).
- FR-03: El sistema debe permitir a un Admin o Editor dar de baja un cliente Activo, que pasa a Inactivo, y reactivar un cliente Inactivo, que pasa a Activo (RF-36, RF-37).
- FR-04: El sistema debe admitir como condición frente al IVA solo los códigos 1, 4, 5, 6, 7, 8, 9, 10, 13, 15 y 16, mostrados con su nombre (RF-38).
- FR-05: El sistema debe rechazar el alta o la modificación de un cliente con un CUIT que no tiene 11 dígitos, que no empieza con 20, 23, 24, 27, 30, 33 o 34, o cuyo dígito verificador no es válido (RF-39, decisión D-05).
- FR-06: El sistema debe rechazar el alta o la modificación de un cliente con un CUIT que ya tiene otro cliente (RF-40).
- FR-07: El sistema debe rechazar el alta o la modificación de un cliente con un email de facturación que ya tiene otro cliente, sin distinguir mayúsculas de minúsculas (RF-41).
- FR-08: El sistema debe permitir a un Admin o Editor dar de alta un producto con nombre, precio de la cuota mensual y moneda (pesos o dólares); el producto queda Activo (RF-42, RF-43).
- FR-09: El sistema debe permitir a un Admin o Editor modificar el nombre, el precio y la moneda de un producto (RF-45, RF-46).
- FR-10: El sistema debe rechazar el alta o la modificación de un producto con un precio igual o menor a cero (RF-44).
- FR-11: El sistema debe rechazar el alta o la modificación de un producto con un nombre que ya tiene otro producto, sin distinguir mayúsculas de minúsculas (decisión D-02).
- FR-12: El sistema debe permitir a un Admin o Editor desactivar un producto Activo, que pasa a Inactivo, y reactivar un producto Inactivo, que pasa a Activo, sin quitar sus asignaciones (RF-47, RF-48).
- FR-13: El sistema debe permitir a un Admin o Editor asignar a un cliente, Activo o Inactivo, uno o varios productos Activos que todavía no tiene asignados (RF-49, decisión D-03).
- FR-14: El sistema debe rechazar la asignación de un producto Inactivo a un cliente (RF-47).
- FR-15: El sistema debe permitir a un Admin o Editor desasignar un producto de un cliente (RF-50).
- FR-16: El sistema debe mostrar a los tres perfiles el listado de clientes, Activos e Inactivos, con razón social, CUIT, email de facturación, condición frente al IVA y estado (RF-158, sin la deuda vigente; decisión D-01).
- FR-17: El sistema debe mostrar a los tres perfiles el detalle de un cliente con razón social, CUIT, domicilio, email de facturación, condición frente al IVA, estado, fecha de alta y productos asignados (RF-214).
- FR-18: El sistema debe mostrar a los tres perfiles el listado de productos, Activos e Inactivos, con nombre, precio, moneda y estado (RF-159).
- FR-19: El sistema debe rechazar cualquier alta, modificación, baja, reactivación, asignación o desasignación de clientes y productos pedida por un usuario Consulta, sin cambiar nada (RF-13).

## Non-Functional Requirements

- NFR-01: Dos altas o modificaciones simultáneas que dejarían el mismo CUIT, el mismo email de facturación o el mismo nombre de producto en dos registros terminan con a lo sumo 1 registro con ese valor: 0 duplicados en la base.
- NFR-02: Los listados de clientes y de productos responden en menos de 500 ms con 1000 registros cada uno.
- NFR-03: El precio de un producto se guarda sin pérdida de precisión con hasta 2 decimales: 0 diferencias de redondeo entre lo ingresado y lo mostrado.

## Acceptance Criteria
*(EARS — see `.daw/rules/validation-rules.instructions.md` §1 for the five patterns)*

- AC-01 (FR-01, FR-16): WHEN un Admin o Editor da de alta un cliente con todos sus datos válidos, THE sistema SHALL registrarlo como Activo y mostrarlo en el listado de clientes.
- AC-02 (FR-01): IF un Admin o Editor intenta dar de alta un cliente sin razón social, sin CUIT, sin domicilio, sin email de facturación o sin condición frente al IVA, THEN THE sistema SHALL rechazar el alta y no registrar ningún cliente.
- AC-03 (FR-02): WHEN un Admin o Editor modifica el domicilio y la razón social de un cliente, THE detalle del cliente SHALL mostrar los datos nuevos.
- AC-04 (FR-03): WHEN un Admin o Editor da de baja un cliente Activo, THE cliente SHALL pasar a Inactivo y seguir apareciendo en el listado con ese estado; y WHEN lo reactiva, SHALL volver a Activo.
- AC-05 (FR-04): IF un Admin o Editor intenta dar de alta o modificar un cliente con la condición frente al IVA 2 o 99, THEN THE sistema SHALL rechazar la acción y nada SHALL cambiar.
- AC-06 (FR-05): IF un Admin o Editor intenta dar de alta un cliente con el CUIT 30711111118 (dígito verificador incorrecto) o 00000000000 (prefijo no válido), o modificar un cliente para que tenga alguno de esos CUIT, THEN THE sistema SHALL rechazar la acción y nada SHALL cambiar; y con el CUIT 30711111111 la acción SHALL realizarse.
- AC-07 (FR-06, FR-07): IF existe un cliente con el CUIT 30711111111 y el email pagos@losandes.com y un Admin o Editor intenta dar de alta otro cliente con ese CUIT o con el email Pagos@LosAndes.com, o modificar otro cliente para que tenga alguno de esos datos, THEN THE sistema SHALL rechazar la acción y nada SHALL cambiar.
- AC-08 (FR-08, FR-18): WHEN un Admin o Editor da de alta un producto con nombre, precio 15000,50 y moneda pesos, THE producto SHALL quedar Activo y aparecer en el listado de productos con precio 15000,50 y moneda pesos.
- AC-09 (FR-10): IF un Admin o Editor intenta dar de alta un producto con precio 0 o -100, o modificar el precio de un producto a 0, THEN THE sistema SHALL rechazar la acción y nada SHALL cambiar; y con precio 0,01 la acción SHALL realizarse.
- AC-10 (FR-09): WHEN un Admin o Editor modifica el nombre, el precio y la moneda de un producto de pesos a dólares, THE listado de productos SHALL mostrar los valores nuevos.
- AC-11 (FR-11): IF existe un producto llamado "Sistema de Turnos" y un Admin o Editor intenta dar de alta otro producto llamado "sistema de turnos", o renombrar otro producto con ese nombre, THEN THE sistema SHALL rechazar la acción y nada SHALL cambiar.
- AC-12 (FR-12, FR-14): WHEN un Admin o Editor desactiva un producto Activo asignado a un cliente, THE producto SHALL pasar a Inactivo, seguir asignado a ese cliente y no poder asignarse a otro cliente; y WHEN lo reactiva, SHALL volver a Activo y poder asignarse.
- AC-13 (FR-13, FR-17): WHEN un Admin o Editor asigna dos productos Activos a un cliente Inactivo, THE detalle del cliente SHALL mostrar los dos productos asignados.
- AC-14 (FR-13): IF un Admin o Editor intenta asignar a un cliente un producto que ya tiene asignado, THEN THE sistema SHALL rechazar la acción y el cliente SHALL conservar una sola asignación de ese producto.
- AC-15 (FR-15): WHEN un Admin o Editor desasigna uno de los dos productos asignados a un cliente, THE detalle del cliente SHALL mostrar solo el producto que sigue asignado.
- AC-16 (FR-19): IF un usuario Consulta intenta dar de alta, modificar, dar de baja, reactivar, asignar o desasignar un cliente o un producto, THEN THE sistema SHALL rechazar la acción y nada SHALL cambiar; y THE usuario Consulta SHALL poder ver los listados y el detalle del cliente.
- AC-17 (NFR-01): WHEN dos Admins dan de alta al mismo tiempo dos clientes con el mismo CUIT, THE sistema SHALL registrar uno solo y rechazar el otro.

## Out of Scope

- Efectos sobre facturas (AC-35 a AC-37, AC-39, AC-45, AC-46, AC-49 y AC-50 del PRD general): llegan con la facturación.
- Deuda vigente en el listado de clientes (parte de RF-158): llega con la facturación.
- Historial del cliente (`client_events`, RF-162 y siguientes): ticket de historial.
- Conversión de cuotas en dólares a pesos (RF-63): llega con la cotización y la facturación.
- Modo mock.
- Búsqueda, filtros, orden configurable y paginación de los listados.
- Borrar clientes o productos: solo se dan de baja o se desactivan.

## Risks and Mitigations

- CUIT mal cargado que después rompe la factura en ARCA: validación del dígito verificador (FR-05).
- Email de facturación repetido que haría ambiguo a qué cliente pertenece un pago: unicidad sin distinguir mayúsculas (FR-07).
- Altas simultáneas que crean duplicados: NFR-01 y AC-17.
- Un Consulta que modifica datos: deny-by-default por perfil (FR-19).
- Decisiones del usuario (2026-11-16): D-01 incluir los listados (RF-158 sin la deuda vigente, RF-159 y RF-214); D-02 el nombre del producto no se repite, sin distinguir mayúsculas; D-03 se pueden asignar y desasignar productos a clientes Activos o Inactivos; D-04 un solo ticket partido en bloques, elegido en CLASSIFY; D-05 el CUIT, además del dígito verificador, debe empezar con un prefijo válido (20, 23, 24, 27, 30, 33 o 34), decidido en PLAN (vuelta a DEFINE).
- Supuestos marcados (no los dijo el usuario): S-01 razón social y domicilio de 1 a 200 caracteres y nombre de producto de 1 a 100, sin espacios al inicio ni al final; S-02 precio con hasta 2 decimales y como máximo 999.999.999,99; S-03 el CUIT se ingresa con o sin guiones y se guarda solo con los 11 dígitos; S-04 el email de facturación se valida y normaliza con las mismas reglas que el email de los usuarios.

## Dependencies

- FEAT-001 (sesiones, deny-by-default) y FEAT-006 (perfiles Admin, Editor y Consulta, autorización en el dominio).
- `PRD.md` (PRD general de Aldebaran): RF-34 a RF-50, RF-158, RF-159, RF-214, RF-09, RF-11, RF-13; AC-34 a AC-50 y AC-217; glosario (Cliente, Producto, Asignación, Condición frente al IVA).
