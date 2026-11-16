# Changelog

Todos los cambios relevantes de este proyecto se registran en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased]

### Added
- [FEAT-001] Login de usuarios: inicio y cierre de sesión con cookie httpOnly y SameSite=Strict. La sesión vence a las 24 h sin actividad (vencimiento deslizante) y las contraseñas se guardan con argon2id.
- [FEAT-001] Registro del primer Admin cuando el sistema no tiene usuarios.
- [FEAT-001] API protegida por defecto (deny-by-default) y log estructurado de cada intento de autenticación.
- [FEAT-001] Web con pantallas de login y de registro del primer Admin, y pantalla principal protegida.
- [FEAT-001] Scaffolding del monorepo (`server/` y `web/`) y base SQLite con migraciones de Drizzle.
- [FEAT-002] CI en GitHub Actions en cada pull request: `npm ci`, lint, typecheck y tests, con permisos de solo lectura, sin secretos y actions fijadas por SHA.
- [FEAT-002] Linter oxlint con información de tipos (`npm run lint`), con reglas equivalentes a `strict-type-checked` que bloquean el CI.
- [FEAT-003] Consulta de salud `GET`/`HEAD /api/health`: sin sesión responde solo el estado general (200 ok / 503 degradado); con sesión, el detalle de la base y de cada proceso automático. Con la base caída responde en menos de 1 s y sin validar la sesión.
- [FEAT-003] Registro de corridas de procesos automáticos (tabla `job_runs`): un proceso cuenta como atrasado tras más de 2 intervalos sin corrida exitosa, y una última corrida con error también degrada el estado.
- [FEAT-003] Banner en la pantalla principal que nombra lo degradado (base de datos o procesos) y se actualiza cada 60 s. La consulta no renueva la sesión.
- [FEAT-005] Dependabot (`.github/dependabot.yml`): una vez por semana propone las actualizaciones de las dependencias npm (raíz, cubre `server/` y `web/`) y de las acciones del CI, agrupadas en un solo PR por ecosistema y con como máximo 1 abierto a la vez. Las acciones siguen fijadas por SHA.
- [FEAT-006] Gestión de usuarios para Admin (`/usuarios` y `/api/users`): listado de usuarios Activos e Inactivos, alta con nombre, email, perfil y contraseña inicial, modificación de nombre, email y perfil, baja (cierra todas sus sesiones) y reactivación. El email no se repite sin distinguir mayúsculas y nunca queda el sistema sin un Admin Activo, tampoco ante acciones simultáneas.
- [FEAT-006] Permisos por perfil (Admin, Editor, Consulta) con autorización deny-by-default en el dominio: solo Admin ve y gestiona usuarios (Editor y Consulta reciben 403 sin datos), y un cambio de perfil o una baja rigen desde la siguiente acción del usuario.
- [FEAT-007] Pantalla "Mi perfil" (`/perfil`) para los tres perfiles: muestra nombre, email y perfil en solo lectura y permite cambiar la propia contraseña (`POST /api/auth/password`) ingresando la actual y la nueva dos veces. La nueva debe tener de 8 a 1024 caracteres y ser distinta de la actual; al cambiarla se cierran las demás sesiones del usuario y la actual sigue abierta. Cada intento queda en el log de autenticación como `password_change`, sin contraseñas.
- [FEAT-009] Límite de intentos por IP en el inicio de sesión, el registro del primer Admin y el cambio de contraseña: 5 fallos de credenciales en 15 minutos bloquean esa operación desde esa IP durante 15 minutos (429 con `Retry-After` y los minutos de espera, sin verificar la contraseña). Los datos mal formados no cuentan, un acierto reinicia el contador y cada operación lleva su propio contador en memoria. Cada bloqueo queda en el log de autenticación como `blocked`.
- [FEAT-008] Recuperación de contraseña por email: "Olvidé mi contraseña" en el login (`/recuperar`) envía desde la casilla del sistema un enlace `/recuperar/<token>` armado con `APP_URL`, nunca con el header Host. El pedido responde siempre el mismo mensaje, exista o no el usuario y aunque falle el envío. El token (256 bits, guardado solo como hash) vence a los 10 minutos, se usa una vez y queda anulado al pedir otro; cambiar la contraseña con él cierra todas las sesiones. Límites: 5 pedidos por IP en 15 minutos, 1 email cada 5 minutos por usuario y 5 tokens inválidos por IP en 15 minutos. Cada pedido y confirmación queda en el log sin token ni contraseña.
- [FEAT-008] Envío de emails por SMTP de Gmail con nodemailer (ADR-007): credenciales desde `GMAIL_USER` y `GMAIL_APP_PASSWORD`, redirección de desarrollo con `EMAIL_REDIRECT_TO`; sin credenciales el server arranca y registra `email_unconfigured`.
- [FEAT-010] Gestión de clientes (`/clientes` y `/api/clients`): listado ordenado por razón social, alta, modificación, baja y reactivación, con razón social, CUIT, domicilio, email de facturación y condición frente al IVA (los códigos que admite una Factura C). El CUIT se valida con dígito verificador y prefijo (20, 23, 24, 27, 30, 33 o 34), y ni el CUIT ni el email de facturación se repiten, tampoco con altas simultáneas. El detalle del cliente muestra la fecha de alta y sus productos asignados.
- [FEAT-010] Gestión de productos (`/productos` y `/api/products`): listado, alta, modificación, baja y reactivación, con nombre único sin distinguir mayúsculas y cuota mensual en pesos o dólares, guardada en centavos y enviada como texto con 2 decimales, sin redondeos.
- [FEAT-010] Asignación de productos a clientes, Activos o Inactivos: se asignan de 1 a 50 productos Activos a la vez (todo o nada) y se desasignan de a uno; desactivar un producto conserva sus asignaciones.
- [FEAT-010] Permisos `clients.*` y `products.*`: Admin y Editor gestionan clientes, productos y asignaciones; Consulta solo ve los listados y el detalle (403 en las escrituras, sin botones de edición en la web).

### Changed
- [FIX-001] La pantalla de login se titula "Iniciar sesión en Aldebaran".
- [FEAT-002] El código existente cumple el lint con tipos (67 violaciones corregidas sin cambio de comportamiento).
- [FEAT-004] El banner de salud confirma la sesión antes de culpar a la base: con la sesión vencida lleva al login sin banner, con la sesión válida (o si la confirmación responde 5xx) nombra "Base de datos", y ante un fallo de red conserva lo último que mostró.
- [FEAT-004] Si falla la lectura de corridas de un proceso, se degrada solo ese proceso (`readFailed` en `/api/health`, nombrado en el banner) y la base sigue "disponible"; el fallo queda en el log del servidor como `health_job_read_failed` con el proceso y el tipo de error, sin el mensaje ni datos de sesión.
