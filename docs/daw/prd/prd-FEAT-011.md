# PRD FEAT-011: Configuración de facturación

| Field | Value |
|-------|-------|
| Ticket | FEAT-011 |
| Tracker | none |
| Date | 2026-11-16 |
| PRD loops | 0 |
| Loops since last human decision | 0 |

## Context and Problem

Aldebaran va a emitir cada mes una Factura C por cliente en ARCA. Para eso necesita saber quién
factura (los datos de la empresa emisora), en qué punto de venta y a qué hora corre el proceso del
día 15. Hoy el sistema no guarda ninguno de esos datos: no hay pantalla de configuración ni lugar
donde cargarlos, y sin ellos ninguna factura se puede generar (RF-219 del PRD general).

Este ticket es el primero de los cinco en que se partió la facturación (decisión D-05): implementa
RF-62, RF-73, RF-91 y RF-221 del PRD general (`PRD.md`). El uso de estos datos —el proceso que arranca
a la hora configurada, la factura emitida en el punto de venta y el PDF con los datos del emisor—
llega con los tickets siguientes.

## Goals

- Que un Admin pueda cargar y cambiar los datos de la empresa emisora, el punto de venta y la hora de facturación.
- Que no se pueda guardar un valor inválido: una hora fuera de 00:00–23:59, un punto de venta fuera de 1–99999, una condición frente al IVA que no emite Factura C o una fecha de inicio de actividades inexistente o futura.
- Que cualquier usuario vea qué datos obligatorios faltan y sepa que sin ellos no se pueden generar facturas.
- Que Editor y Consulta vean la configuración pero no puedan cambiarla.

## Functional Requirements

- FR-01: El sistema debe mostrar a los tres perfiles la pantalla de configuración con los datos de la empresa emisora, el punto de venta y la hora de facturación (AC-04, AC-257 del PRD general).
- FR-02: El sistema debe permitir a un Admin configurar la hora de facturación con un valor entre 00:00 y 23:59, en horas y minutos (RF-62).
- FR-03: El sistema debe usar 11:00 como hora de facturación mientras un Admin no haya configurado otra (glosario: hora de facturación).
- FR-04: El sistema debe permitir a un Admin configurar el punto de venta con un número entero entre 1 y 99999 (RF-73).
- FR-05: El sistema debe permitir a un Admin configurar los datos de la empresa emisora: razón social, domicilio comercial, condición frente al IVA, número de ingresos brutos, fecha de inicio de actividades y, opcionalmente, un nombre de fantasía (RF-91).
- FR-06: El sistema debe admitir como condición frente al IVA de la empresa emisora solo Responsable Monotributo, Monotributista Social, Monotributo Trabajador Independiente Promovido o IVA Sujeto Exento (RF-91).
- FR-07: El sistema debe rechazar una fecha de inicio de actividades que no existe en el calendario o que es posterior al día actual en hora de Argentina (RF-91, decisión D-02).
- FR-08: El sistema debe aceptar como número de ingresos brutos un texto libre de 1 a 50 caracteres (decisión D-03).
- FR-09: El sistema debe permitir guardar los datos de la empresa emisora aunque falte alguno de los obligatorios, validando cada dato que sí se cargó (decisión D-01).
- FR-10: El sistema debe indicar en la pantalla de configuración cuáles datos son obligatorios: razón social, domicilio comercial, condición frente al IVA, número de ingresos brutos, fecha de inicio de actividades y punto de venta (RF-221).
- FR-11: Mientras falte alguno de los datos obligatorios, el sistema debe mostrar en la pantalla de configuración un aviso que nombre los datos que faltan y advierta que sin ellos no se pueden generar facturas (RF-221, RF-219).
- FR-12: El sistema debe rechazar cualquier cambio de configuración pedido por un usuario Editor o Consulta, sin cambiar ningún valor (RF-10, RF-13).
- FR-13: Cuando el sistema rechaza un valor, debe conservar el valor anterior de ese dato y de todos los que se enviaron en el mismo guardado (AC-62, AC-71, AC-252, AC-253 del PRD general).

## Non-Functional Requirements

- NFR-01: Un guardado rechazado deja la configuración exactamente como estaba: 0 valores cambiados cuando al menos uno de los valores enviados es inválido.
- NFR-02: La configuración guardada se conserva después de reiniciar el sistema: 0 valores perdidos tras un reinicio.
- NFR-03: Leer la configuración responde en menos de 200 ms.

## Acceptance Criteria
*(EARS — see `.daw/rules/validation-rules.instructions.md` §1 for the five patterns)*

- AC-01 (FR-01, FR-03): WHEN un usuario autenticado de cualquier perfil abre la configuración de un sistema recién instalado, THE sistema SHALL mostrar la hora de facturación 11:00, el punto de venta vacío y los datos de la empresa emisora vacíos.
- AC-02 (FR-02): WHEN un Admin configura la hora de facturación en 23:59, THE sistema SHALL guardarla y mostrarla al volver a abrir la configuración.
- AC-03 (FR-02, FR-13): IF un Admin intenta configurar la hora de facturación en 24:00 o en 23:60, THEN THE sistema SHALL rechazar el valor y mantener la hora anterior.
- AC-04 (FR-04): WHEN un Admin configura el punto de venta en 5, THE sistema SHALL guardarlo y mostrarlo al volver a abrir la configuración.
- AC-05 (FR-04, FR-13): IF un Admin intenta configurar el punto de venta en 0, en 100000 o en 2,5, THEN THE sistema SHALL rechazar el valor y mantener el punto de venta anterior.
- AC-06 (FR-05): WHEN un Admin configura la razón social, el domicilio comercial, la condición frente al IVA Responsable Monotributo, el número de ingresos brutos, la fecha de inicio de actividades 29/02/2024 y el nombre de fantasía de la empresa emisora, THE sistema SHALL guardarlos y mostrarlos al volver a abrir la configuración.
- AC-07 (FR-06, FR-13): IF un Admin intenta configurar la condición frente al IVA de la empresa emisora en IVA Responsable Inscripto, THEN THE sistema SHALL rechazar el valor y mantener el anterior.
- AC-08 (FR-07, FR-13): IF un Admin intenta configurar la fecha de inicio de actividades en 31/02/2020 o en el día siguiente al actual, THEN THE sistema SHALL rechazar el valor y mantener el anterior; y con la fecha del día actual SHALL guardarla.
- AC-09 (FR-08): IF un Admin intenta configurar el número de ingresos brutos con un texto vacío o de 51 caracteres, THEN THE sistema SHALL rechazar el valor y mantener el anterior; y con "CM 901-123456-7" SHALL guardarlo.
- AC-10 (FR-09, FR-11): WHEN un Admin guarda los datos de la empresa emisora sin el número de ingresos brutos, THE sistema SHALL guardar los demás datos y mostrar el aviso que indica que no se pueden generar facturas porque falta el número de ingresos brutos.
- AC-11 (FR-11): WHEN un Admin completa el último dato obligatorio que faltaba y guarda, THE sistema SHALL dejar de mostrar el aviso.
- AC-12 (FR-10, FR-11): WHILE falten el punto de venta y la fecha de inicio de actividades, THE pantalla de configuración SHALL marcar los seis datos obligatorios y mostrar un aviso que nombre el punto de venta y la fecha de inicio de actividades.
- AC-13 (FR-12): IF un usuario Editor o Consulta intenta cambiar la hora de facturación, el punto de venta o cualquier dato de la empresa emisora, THEN THE sistema SHALL rechazar la acción y ningún valor SHALL cambiar; y THE usuario SHALL poder ver la configuración.
- AC-14 (FR-13, NFR-01): IF un Admin guarda en un mismo envío una razón social válida y una condición frente al IVA inválida, THEN THE sistema SHALL rechazar el guardado y no cambiar ni la razón social ni la condición frente al IVA.
- AC-15 (NFR-02): WHEN el sistema se reinicia después de que un Admin guardó la configuración, THE sistema SHALL mostrar los mismos valores guardados.

## Out of Scope

- Ejecutar el proceso de facturación a la hora configurada (AC-61 del PRD general): llega con el proceso de facturación (FEAT-014).
- Emitir facturas en el punto de venta configurado y validar sus datos al facturar (AC-71 en su parte de emisión, RF-219): llegan con ARCA y el proceso de facturación (FEAT-013, FEAT-014).
- Incluir los datos de la empresa emisora en el PDF (RF-92, AC-83 en su parte de PDF) y usar el nombre de fantasía como remitente (RF-215): llegan con el PDF y el email de la factura (FEAT-015).
- El CUIT de la empresa emisora: viene de la variable de entorno ARCA_CUIT y llega con ARCA (FEAT-013).
- Los demás valores de configuración (intervalo de revisión de la casilla, hora de recordatorios, cantidad de reintentos, espera entre reintentos): llegan con sus funcionalidades (decisión D-04).
- Auditoría de los cambios de configuración (fuera del alcance del PRD general).
- Borrar datos ya guardados de la empresa emisora para dejarlos vacíos.

## Risks and Mitigations

- Una factura generada con datos del emisor incompletos: el aviso de faltantes (FR-11) y, al facturar, RF-219 en FEAT-014.
- Un Editor o Consulta que cambia la configuración: solo el Admin escribe, con autorización deny-by-default por perfil (FR-12).
- Un guardado a medias que deja datos inconsistentes: todo o nada por guardado (FR-13, NFR-01).
- Decisiones del usuario (2026-11-16): D-01 se pueden guardar los datos de la empresa emisora con obligatorios vacíos, y el aviso nombra los que faltan; D-02 la fecha de inicio de actividades no puede ser posterior al día actual (hora de Argentina); D-03 el número de ingresos brutos es texto libre de 1 a 50 caracteres; D-04 la pantalla muestra solo los valores de este ticket; D-05 la facturación se parte en cinco tickets y este es el primero (CLASSIFY).
- Supuestos marcados (no los dijo el usuario): S-01 razón social, domicilio comercial y nombre de fantasía de 1 a 200 caracteres, sin espacios al inicio ni al final (como los clientes de FEAT-010); S-02 la fecha de inicio de actividades no puede ser anterior al 01/01/1900; S-03 un dato opcional o un obligatorio que no se envía conserva su valor anterior.

## Dependencies

- FEAT-001 (sesiones, deny-by-default), FEAT-006 (perfiles Admin, Editor y Consulta) y FEAT-010 (condiciones frente al IVA).
- `PRD.md` (PRD general de Aldebaran): RF-62, RF-73, RF-91, RF-221, RF-10, RF-13; AC-04, AC-62, AC-71, AC-252, AC-253, AC-257, AC-215; glosario (Empresa emisora, Configuración, Punto de venta, Proceso de facturación).
- Siguen a este ticket: FEAT-012 (cotización), FEAT-013 (ARCA), FEAT-014 (proceso de facturación) y FEAT-015 (PDF y email).
