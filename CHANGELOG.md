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

### Changed
- [FIX-001] La pantalla de login se titula "Iniciar sesión en Aldebaran".
- [FEAT-002] El código existente cumple el lint con tipos (67 violaciones corregidas sin cambio de comportamiento).
- [FEAT-004] El banner de salud confirma la sesión antes de culpar a la base: con la sesión vencida lleva al login sin banner, con la sesión válida (o si la confirmación responde 5xx) nombra "Base de datos", y ante un fallo de red conserva lo último que mostró.
- [FEAT-004] Si falla la lectura de corridas de un proceso, se degrada solo ese proceso (`readFailed` en `/api/health`, nombrado en el banner) y la base sigue "disponible"; el fallo queda en el log del servidor como `health_job_read_failed` con el proceso y el tipo de error, sin el mensaje ni datos de sesión.
