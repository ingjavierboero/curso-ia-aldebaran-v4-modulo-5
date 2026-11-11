# Fix FIX-001: Título del login "Iniciar sesión en Aldebaran"

- **Bug**: la pantalla de login se titula solo "Iniciar sesión" y no nombra el sistema; se quiere "Iniciar sesión en Aldebaran".
- **Change**: web/src/pages/LoginPage.tsx:38 — el `title` de `AuthCard` pasa de "Iniciar sesión" a "Iniciar sesión en Aldebaran".
- **Regression test**: `test_login_titulo_nombra_aldebaran` (web/src/pages/LoginPage.test.tsx) — espera el heading "Iniciar sesión en Aldebaran"; falla antes del cambio y pasa después.
- **Risk**: ninguno. Es un texto visible: no cambia lógica, rutas ni la API, y ningún otro test ni documento usa el título actual.
