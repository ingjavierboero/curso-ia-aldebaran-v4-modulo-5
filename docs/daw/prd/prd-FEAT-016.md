# PRD FEAT-016: No imputar dos veces un pago reenviado

| Field | Value |
|-------|-------|
| Ticket | FEAT-016 |
| Tracker | none |
| Date | 2026-11-17 |
| PRD loops | 1 |
| Loops since last human decision | 0 |

## Context and Problem

Aldebaran valida con un LLM los comprobantes de pago que los clientes responden por email y los
imputa a sus facturas adeudadas (control de pagos, RF-99 a RF-140 del PRD general). El PRD general
solo evita procesar dos veces **el mismo email** (RF-109, por Message-ID). Si un cliente reenvía el
mismo comprobante en otro email —por ejemplo, porque no recibió respuesta— y todavía tiene otra
factura adeudada del mismo monto (la cuota del mes siguiente), el sistema imputaría el mismo pago a
esa otra factura: el cliente figuraría con dos pagos cuando pagó una vez.

Este ticket define la regla que decide si un comprobante es un pago ya imputado. El control de
pagos todavía no está implementado: la regla se construye ahora, con sus tests, y el control de
pagos aplica su decisión cuando llegue ese módulo (decisión D-07).

## Goals

- Que el mismo pago, reenviado en otro email, nunca se decida como pago nuevo.
- Que un pago legítimo nuevo del mismo cliente y del mismo monto (otro mes, otra operación) no se decida como duplicado por error.
- Que, cuando no se puede saber si es el mismo pago, la decisión sea "posible pago duplicado", para que decida una persona.

## Functional Requirements

- FR-01: El sistema debe considerar que un comprobante es el mismo pago que otro ya imputado del mismo cliente cuando coinciden el CUIT del ordenante, el monto, la fecha del pago y el número de operación (decisión D-01).
- FR-02: El sistema debe comparar los números de operación tomando solo sus letras y dígitos, sin distinguir mayúsculas de minúsculas y respetando los ceros a la izquierda (decisión D-05).
- FR-03: El sistema debe decidir "pago duplicado" para un comprobante que es el mismo pago que otro ya imputado, y esa decisión indica que no se usa para imputar ninguna factura (decisiones D-03 y D-07).
- FR-04: Si un comprobante no tiene número de operación o no tiene fecha del pago, y existe un comprobante ya imputado del mismo cliente que coincide en los datos que sí tiene (CUIT del ordenante, monto y el dato restante), el sistema debe decidir "posible pago duplicado" (decisiones D-02 y D-08).
- FR-05: El sistema debe decidir "pago nuevo" para un comprobante que difiere de todos los ya imputados del cliente en al menos uno de los datos que tiene.
- FR-06: Cuando un email trae varios comprobantes, el sistema debe dar una decisión por comprobante, en el mismo orden, sin que el duplicado cambie la decisión de los demás (decisión D-04).
- FR-07: Cuando un email trae dos comprobantes iguales entre sí, el sistema debe decidir como "pago duplicado" el segundo, aunque ninguno esté ya imputado (decisión D-09).
- FR-08: El sistema debe decidir "datos no extraídos" para un comprobante con monto vacío, cero, negativo o no entero en centavos, o con el CUIT del ordenante vacío (RF-132 del PRD general), sin compararlo como posible duplicado (supuesto S-02).

## Non-Functional Requirements

- NFR-01: La regla da siempre el mismo resultado para los mismos datos: 0 diferencias entre dos evaluaciones del mismo comprobante contra los mismos pagos imputados.
- NFR-02: Evaluar un comprobante contra 1000 comprobantes ya imputados del cliente lleva menos de 50 ms.

## Acceptance Criteria
*(EARS — see `.daw/rules/validation-rules.instructions.md` §1 for the five patterns)*

- AC-01 (FR-01, FR-03): WHEN un cliente reenvía un comprobante con el CUIT 30711111111, el monto 15000,50, la fecha 10/11/2026 y el número de operación 00123456, y ya existe un comprobante imputado del cliente con esos cuatro datos, THE sistema SHALL decidir "pago duplicado".
- AC-02 (FR-02): WHEN el comprobante ya imputado tiene el número de operación "0012-3456" y el nuevo trae " 0012 3456 " o "00123456" con los mismos CUIT, monto y fecha, THE sistema SHALL decidir "pago duplicado"; y con "123456" SHALL decidir "pago nuevo".
- AC-03 (FR-02): WHEN el número de operación ya imputado es "ab-12" y el nuevo es "AB12", con los mismos CUIT, monto y fecha, THE sistema SHALL decidir "pago duplicado".
- AC-04 (FR-05): WHEN un comprobante coincide con uno ya imputado en CUIT, monto y número de operación pero tiene otra fecha (o en CUIT, monto y fecha pero otro número de operación), THE sistema SHALL decidir "pago nuevo".
- AC-05 (FR-05): WHEN el cliente no tiene ningún comprobante imputado, THE sistema SHALL decidir "pago nuevo".
- AC-06 (FR-04): IF un comprobante no trae número de operación (o no trae fecha del pago) y existe uno ya imputado del cliente que coincide en los datos que sí trae, THEN THE sistema SHALL decidir "posible pago duplicado".
- AC-07 (FR-04, FR-05): IF un comprobante no trae número de operación y ningún comprobante ya imputado del cliente coincide en CUIT, monto y fecha, THEN THE sistema SHALL decidir "pago nuevo".
- AC-08 (FR-06, FR-07): WHEN un email trae dos comprobantes, uno igual a un pago ya imputado y otro nuevo, THE sistema SHALL decidir ["pago duplicado", "pago nuevo"]; y WHEN trae dos comprobantes iguales entre sí sin pagos imputados, SHALL decidir ["pago nuevo", "pago duplicado"].
- AC-09 (FR-08): IF un comprobante trae un monto vacío, 0 o -100, o el CUIT del ordenante vacío, THEN THE sistema SHALL decidir "datos no extraídos" y no "pago duplicado", aunque haya un comprobante imputado con los demás datos iguales.
- AC-10 (NFR-01, NFR-02): WHEN el sistema evalúa el mismo comprobante dos veces contra los mismos 1000 comprobantes imputados, THE sistema SHALL dar la misma decisión las dos veces, en menos de 50 ms cada una.

## Out of Scope

- Aplicar la decisión: registrar el comprobante con la marca "pago duplicado", no imputarlo y pasar las facturas adeudadas a Revisión manual con el motivo "posible pago duplicado" lo hace el control de pagos al consumir la decisión (decisión D-07).
- Conectar la regla al procesamiento de la casilla (revisión de la casilla, clasificación del email, coincidencia de monto): llega con el control de pagos (RF-99 a RF-140).
- Que el LLM extraiga la fecha del pago y el número de operación de cada comprobante: se suma a la extracción cuando se implemente el control de pagos.
- Mostrar la marca "pago duplicado" en la interfaz de revisión y en el historial del cliente: llegan con esas pantallas.
- Detectar duplicados entre clientes distintos (el mismo comprobante enviado desde el email de otro cliente).
- Comparar el archivo del comprobante (huella del contenido) en lugar de los datos extraídos (decisión del usuario en CLASSIFY: mismos datos extraídos).

## Risks and Mitigations

- Descartar un pago legítimo: la regla exige los cuatro datos iguales, incluido el número de operación (FR-01); si falta un dato decide una persona (FR-04).
- Imputar dos veces porque el número de operación vino con otro formato: comparación por letras y dígitos sin mayúsculas (FR-02).
- Un error de extracción del LLM en la fecha o el número genera un pago "nuevo" que en realidad es duplicado: la coincidencia de monto existente (RF-134 a RF-137) y la confirmación humana del pago (RF-143) siguen siendo la última barrera.
- Decisiones del usuario (2026-11-17): D-01 el mismo pago se define por CUIT del ordenante, monto, fecha del pago y número de operación; D-02 sin número de operación y con un pago anterior de mismo CUIT, monto y fecha → "posible pago duplicado" (Revisión manual); D-03 el duplicado se registra como "pago duplicado", sin cambiar facturas ni avisar al cliente; D-04 en un email con varios comprobantes se descarta solo el duplicado; D-05 el número de operación se compara solo con letras y dígitos, sin mayúsculas, y los ceros a la izquierda cuentan; D-06 se trabaja como ticket aparte, antes del control de pagos, con los tests de unidad primero (CLASSIFY); D-07 los criterios describen la decisión de la regla, y aplicar la marca o la Revisión manual queda fuera de alcance (PLAN); D-08 sin fecha del pago se trata igual que sin número de operación (PLAN); D-09 dentro de un mismo email cuenta un solo comprobante igual: el segundo es duplicado (PLAN).
- Supuestos marcados (no los dijo el usuario): S-01 se compara contra todos los comprobantes ya imputados del mismo cliente, sin límite de tiempo; S-02 un monto vacío, cero o negativo, o un CUIT vacío, cuenta como dato no extraído (RF-132); S-03 "comprobante ya imputado" es uno que llevó facturas a Pago recibido o Pagada.

## Dependencies

- `PRD.md` (PRD general de Aldebaran): RF-109, RF-127, RF-132, RF-134 a RF-137, RF-143; glosario (Comprobante, Clasificación del email, Email validable, Coincidencia de monto, Revisión manual, Motivo).
- FEAT-010 (clientes y CUIT) para el CUIT del cliente.
- El control de pagos (ticket futuro) conecta esta regla al procesamiento de la casilla, aplica su decisión y amplía la extracción del LLM.
