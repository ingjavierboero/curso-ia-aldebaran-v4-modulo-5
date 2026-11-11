# AGENTS.md — Aldebaran

## Propósito
Sistema SaaS interno que genera cada mes las facturas de los clientes (en homologación de ARCA),
se las envía por email y valida con un LLM los comprobantes de pago que responden. Spec: `PRD.md`.

## Stack
- Node 24 LTS + TypeScript 7. Monorepo con npm workspaces: `server/` y `web/`.
- Backend: Express 5 · SQLite con Drizzle ORM 0.45 + better-sqlite3 (migraciones con drizzle-kit).
- Frontend: React 19 + Vite 8 · antd 6 · zustand 5 · styled-components 6 · react-router 8.
- LLM: `@anthropic-ai/sdk`, modelo `claude-haiku-4-5-20251001` (clasificación si/no/dudoso + extracción de CUIT/monto).
- Email (Gmail con contraseña de aplicación): nodemailer (SMTP) + imapflow (IMAP).
- ARCA: WSAA/WSFEv1 implementados a mano (SOAP), solo homologación.
- Jobs: node-cron dentro del server, TZ `America/Argentina/Buenos_Aires`.
- Tests: Vitest.
- Install: npm ci
- Test: npm test
- Typecheck: npm run typecheck

## Architecture conventions
Se usa arquitectura DDD con domain, infrastructure, application

## Domain glossary

### Actores y perfiles
- **Sistema**: siempre Aldebaran.
- **Agente**: la parte del sistema que corre los procesos automáticos sin intervención de un usuario: facturación, recordatorios, revisión de la casilla, validación de comprobantes y reintentos. **Nunca marca una factura como Pagada.**
- **Usuario** (`users`): persona con nombre, email, perfil y contraseña. Inicia sesión con su email. Puede estar **Activo** o **Inactivo**.
- **Admin**: perfil con acceso total. Gestiona usuarios y configuración, cancela, reactiva y ejecuta la facturación.
- **Editor**: gestiona clientes, productos y pagos (confirma pagos, resuelve revisiones y errores). No accede a la gestión de usuarios.
- **Consulta**: perfil de solo lectura.
- **Evaluador**: persona que recorre todo el circuito en modo mock, sin credenciales reales.

### Clientes y productos
- **Cliente** (`clients`): tiene razón social, CUIT, domicilio, email de facturación y condición frente al IVA. Puede estar **Activo** o **Inactivo**. Los emails de un cliente Inactivo se procesan igual, pero no se le factura ni se le envían emails.
- **Email de facturación**: el email registrado del cliente. Se usa para enviarle sus emails y para identificar sus respuestas, sin distinguir mayúsculas de minúsculas.
- **Condición frente al IVA**: un código de ARCA (1, 4, 5, 6…), limitado a los que admite el receptor de una Factura C. La factura guarda la que se informó a ARCA al emitirla.
- **Producto** (`products`): un software que se vende con una cuota mensual, con precio en pesos o en dólares. Puede estar **Activo** o **Inactivo**.
- **Asignación** (`client_products`): la relación entre un cliente y los productos que se le facturan.
- **Cliente facturable**: cliente Activo con al menos un producto Activo asignado.

### Facturación
- **Período** (`billing_periods.period`, `YYYY-MM`): el mes y año que se factura. Define la **antigüedad** de una factura.
- **Proceso de facturación**: la generación mensual de facturas. Corre el día 15 a la **hora de facturación** (11:00 por defecto) o con **"Facturar ahora"**. Estados del período: `pendiente` → `en_curso` → `completado`, o `cancelado`.
- **Período cancelado**: período del mes en curso cuya facturación un Admin canceló antes de que empezara y no reactivó.
- **Recuperación**: si el sistema estaba caído el día 15, factura apenas vuelve, dentro del mismo mes. Si el proceso quedó a medias, lo retoma sin duplicar facturas.
- **Factura** (`invoices`): comprobante **Factura C** (`voucher_type = 11`), una por cliente y período. Lleva punto de venta, número, CAE, fecha de emisión, período de servicio y vencimiento.
- **Ítem / cuota** (`invoice_items`): una línea de la factura por cada producto Activo asignado, siempre en pesos.
- **Período de servicio**: del primer al último día del mes facturado.
- **Fecha de vencimiento**: el último día del mes facturado, o la fecha de emisión si la factura se genera más tarde.
- **Empresa emisora**: la empresa que factura. Sus datos se configuran (razón social, domicilio, IIBB, inicio de actividades, nombre de fantasía opcional) y su CUIT es `ARCA_CUIT`.
- **Snapshot**: copia de los datos del cliente y del emisor en el momento de emitir la factura (`client_snapshot`, `issuer_snapshot`).
- **Cotización** (`exchange_rates`): el dólar blue venta de dolarhoy.com, leído al generar cada factura que tenga ítems en USD.
- **Cotización de respaldo**: la última cotización registrada, que se usa si dolarhoy.com no responde. Activa el banner de cotización hasta que alguien la confirma.

### ARCA
- **ARCA**: el organismo fiscal (ex AFIP). En el MVP se trabaja solo contra el **ambiente de homologación**.
- **Homologación**: el ambiente de prueba de ARCA. Los comprobantes que emite no tienen validez fiscal y la leyenda lo aclara en el PDF y en el email. Lo que el PRD llama "modo real" es este ambiente.
- **WSAA / WSFEv1**: los web services SOAP de autenticación y de factura electrónica, implementados a mano.
- **Punto de venta**: número del 1 al 99999, que se configura, en el que se emiten las facturas.
- **CAE**: el código de 14 dígitos con el que ARCA autoriza un comprobante. Tiene fecha de vencimiento.
- **Certificado de ARCA**: el archivo de `ARCA_CERT_PATH`. Si está vencido, no se puede leer o le quedan 30 días o menos, se muestra el banner de certificado.

### Estados de una factura (`invoices.status`)
- **Generando** (`generando`): estado técnico mientras se pide el CAE. No se lista ni cuenta como adeudada.
- **Pendiente de pago** (`pendiente_de_pago`): factura emitida sin un comprobante válido. El agente sigue buscando su pago.
- **Pago recibido** (`pago_recibido`): el agente validó un comprobante que la cubre y espera que un usuario lo confirme.
- **Revisión manual** (`revision_manual`): llegó un comprobante que el agente no pudo validar. Necesita la decisión de un usuario.
- **Pagada** (`pagada`): un usuario confirmó el pago. **Solo la puede asignar un usuario.**
- **Motivo** (`manual_review_reason`): la razón de una Revisión manual. Ejemplos: "clasificación dudosa", "CUIT no coincide", "monto no coincide", "revisión manual pendiente". Desaparece cuando la factura sale de ese estado.

### Deuda
- **Factura adeudada**: factura en Pendiente de pago o en Revisión manual.
- **Deuda vigente**: el cliente tiene al menos una factura adeudada. La **deuda vigente total** es la suma de sus facturas adeudadas.
- **Cliente en revisión**: cliente con al menos una factura en Revisión manual. No recibe recordatorios, y cada email nuevo que manda se suma a su revisión pendiente.

### Emails y control de pagos
- **Casilla del sistema**: la cuenta de Gmail del sistema (`GMAIL_USER`), desde la que se envían los emails y en la que se reciben las respuestas.
- **Revisión de la casilla** (`mailbox_checks`): la lectura IMAP periódica, cada 15 minutos por defecto (configurable entre 5 y 60). La primera procesa los emails desde la emisión de la primera factura.
- **Email recibido** (`received_emails`): se procesa una sola vez, identificado por su **Message-ID**, y en orden de llegada.
- **Aviso** (`notices`): email de un remitente que no corresponde a ningún cliente. Queda **Pendiente** hasta que un usuario lo marca como **Revisado**.
- **Adjunto**: imagen (JPEG, PNG, GIF o WebP) o PDF, detectado por la firma del contenido y no por la extensión. Las imágenes embebidas en el cuerpo no cuentan.
- **Clasificación del adjunto**: la respuesta del LLM: `si`, `no` o `dudoso`. Un pago en otra moneda que no sea pesos se clasifica como `dudoso`.
- **Comprobante**: adjunto clasificado como `si`. De cada uno se extraen el **CUIT del ordenante** (quien paga, nunca el beneficiario; 11 dígitos) y el **monto**.
- **Procesamiento erróneo**: el procesamiento de un adjunto falló. Tiene prioridad sobre cualquier otra clasificación.
- **Clasificación del email**: la que resulta de sus adjuntos, en este orden de prioridad: erróneo > `dudoso` > `si` > `no`.
- **Email validable**: email con clasificación `si`, de un cliente con deuda vigente que no está en revisión, en el que se extrajeron el CUIT y el monto de todos los comprobantes y todos los CUIT coinciden con el del cliente.
- **Coincidencia de monto**: una o varias facturas adeudadas cuyo total es exactamente el monto pagado. Hay dos variantes: **por comprobante**, cuando se puede repartir las facturas entre los comprobantes del email, o **por suma**, cuando se compara contra la suma de todos los comprobantes.
- **Combinación más antigua**: el criterio de desempate cuando hay varias coincidencias de monto. Gana la que contiene la factura más antigua, comparando factura por factura. Si no hay una ganadora única, la factura va a Revisión manual.

### Recordatorios, errores y UI
- **Recordatorio** (`reminder_runs`, `sent_emails`): email con el detalle de la deuda. Puede ser **automático**, el último día del mes a la **hora de recordatorios**, o **manual**, desde el dashboard. No se envía a clientes sin deuda vigente ni a clientes en revisión.
- **Reintento** (`retry_queue`): repetición automática de una operación que falló (generación de factura, envío de factura o envío de recordatorio): 3 reintentos por defecto, con una espera configurable entre ellos.
- **Error de proceso** (`process_errors`): se registra cuando una operación automática agota sus reintentos o cuando falla la revisión de la casilla. Queda **Pendiente** hasta que pasa a **Resuelto**, por un reintento manual exitoso o porque un usuario lo marca así.
- **Acción de usuario**: operación que inicia una persona, por ejemplo un recordatorio manual. Si falla, solo muestra un error: no se reintenta ni genera un error de proceso.
- **Interfaz de revisión**: la pantalla donde se ven los pagos informados, los avisos y los errores de proceso, y donde se resuelven las revisiones manuales.
- **Banner de alerta**: aviso en el dashboard. Hay tres: **errores** (hay errores de proceso pendientes), **cotización** (se usó una cotización de respaldo sin confirmar) y **certificado** (el certificado de ARCA está vencido o por vencer).
- **Historial del cliente** (`client_events`): registro cronológico de todo lo que pasó con un cliente, con fecha, hora y el usuario o agente que lo originó.
- **Configuración** (`settings`): intervalo de revisión de la casilla, horas de facturación y de recordatorios, reintentos, espera entre reintentos, punto de venta y datos de la empresa emisora.

### Modos de ejecución
- **Modo mock** (`MOCK_MODE=true`): simula ARCA, el LLM y el email y usa su propia base, `data/aldebaran-mock.db`.
- **Casilla simulada** (`simulated_emails`): reemplaza a la casilla del sistema en modo mock. Guarda los emails enviados y los recibidos que un usuario carga a mano.
- **Clasificación mock**: en modo mock, la clasificación sale del nombre del archivo:
  - `pago_<CUIT>_<monto>.pdf` → `si`; una `x` en lugar del CUIT o del monto significa que ese dato no se pudo extraer.
  - `dudoso*` → `dudoso`.
  - `error*` → procesamiento erróneo.
  - cualquier otro nombre → `no`.
- **Redirección de emails** (`EMAIL_REDIRECT_TO`): solo para desarrollo. Envía todos los emails a una única dirección.
<!-- BEGIN DAW (managed by DAW — do not edit by hand) -->
# DAW — Dilux Agentic Workflow

This repo uses **DAW**: an agent-driven development pipeline with the phases
`CLASSIFY → DEFINE → PLAN → CODE → VERIFY → CLOSEOUT`.

Before answering, read `.daw/orchestrator.md` and run its Boot Sequence. It is a strict state
machine: it decides what you are allowed to do based on the phase recorded in `.daw-state.json`.

The project's own context — stack, architecture, domain — is elsewhere in this file. It lives here,
in `AGENTS.md`, and not in any one tool's file, on purpose: it is tool-agnostic and comes along
unchanged when the pipeline is ported to another agent.
<!-- END DAW -->
