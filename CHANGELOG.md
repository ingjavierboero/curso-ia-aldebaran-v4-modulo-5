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

### Changed
- [FIX-001] La pantalla de login se titula "Iniciar sesión en Aldebaran".
- [FEAT-002] El código existente cumple el lint con tipos (67 violaciones corregidas sin cambio de comportamiento).
