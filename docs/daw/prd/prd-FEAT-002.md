# PRD FEAT-002: CI en pull requests (install, lint, tests)

| Field | Value |
|-------|-------|
| Ticket | FEAT-002 |
| Tracker | none |
| Date | 2026-11-11 |
| PRD loops | 1 |
| Loops since last human decision | 1 |

## Context and Problem

Hoy ningún cambio que llega por pull request se verifica automáticamente: los tests y el chequeo de
tipos se corren solo si alguien se acuerda de hacerlo en su máquina, y el repositorio no tiene
ningún análisis estático de estilo y calidad (linter). Un PR puede mergearse con tests rotos, errores
de tipos o código que un linter hubiera marcado, y nadie se entera hasta después.

## Goals

- Que todo pull request muestre, sin intervención de nadie, si el código instala, pasa el lint, pasa
  el chequeo de tipos y pasa los tests.
- Que el repositorio tenga un linter con reglas estrictas que usan la información de tipos, y que el
  código existente lo cumpla desde el primer día.
- Que la verificación sea reproducible y no dependa de secretos ni de servicios externos.

## Functional Requirements

- FR-01: La verificación automática se ejecuta en cada pull request, al abrirlo y en cada nuevo push a
  su rama.
- FR-02: La verificación instala las dependencias exactamente como figuran en el lockfile del
  repositorio, sin modificarlo.
- FR-03: La verificación corre el linter sobre todo el código de `server/` y `web/` y falla si
  reporta al menos un error.
- FR-04: El linter aplica un conjunto de reglas estricto que usa la información de tipos del
  proyecto.
- FR-05: El código existente de `server/` y `web/` cumple el linter sin errores al cerrar este
  ticket.
- FR-06: La verificación corre el chequeo de tipos de todo el monorepo y falla si hay al menos un
  error de tipos.
- FR-07: La verificación corre todos los tests del monorepo y falla si al menos un test falla.
- FR-08: El linter se puede correr localmente con un único comando declarado en el repositorio.
- FR-09: El resultado de la verificación (éxito o falla, y el paso que falló) queda visible en el
  pull request.

## Non-Functional Requirements

- NFR-01: La verificación no contiene ni requiere secretos: 0 credenciales, tokens o claves escritas
  en el repositorio ni leídas por la verificación.
- NFR-02: Durante la verificación, 0 tests realizan llamadas de red a servicios externos (ARCA, LLM,
  email, cotización); todo el comportamiento externo corre en modo mock.
- NFR-03: La verificación usa la misma versión mayor del runtime que declara el proyecto (Node 24).
- NFR-04: La verificación tiene 0 permisos de escritura sobre el repositorio (solo lectura del contenido).
- NFR-05: Una corrida completa de la verificación termina en menos de 10 minutos.

## Acceptance Criteria
*(EARS — see `.daw/rules/validation-rules.instructions.md` §1 for the five patterns)*

- AC-01 (FR-01): WHEN se abre un pull request, THE verificación SHALL ejecutarse automáticamente.
- AC-02 (FR-01): WHEN se hace push de un nuevo commit a la rama de un pull request abierto, THE verificación SHALL volver a ejecutarse.
- AC-03 (FR-02): WHEN la verificación instala las dependencias, THE verificación SHALL usar las versiones del lockfile y dejarlo sin cambios.
- AC-04 (FR-02): IF el lockfile no coincide con las dependencias declaradas, THEN THE verificación SHALL fallar en el paso de instalación.
- AC-05 (FR-03): IF el linter reporta al menos un error en `server/` o en `web/`, THEN THE verificación SHALL fallar.
- AC-06 (FR-04): WHEN el código usa una promesa sin esperarla ni manejarla, THE linter SHALL reportarlo como error.
- AC-07 (FR-05): WHEN se corre el linter sobre la rama de este ticket, THE linter SHALL terminar con 0 errores.
- AC-08 (FR-06): IF el chequeo de tipos reporta al menos un error, THEN THE verificación SHALL fallar.
- AC-09 (FR-07): IF al menos un test falla, THEN THE verificación SHALL fallar.
- AC-10 (FR-07): WHEN todos los pasos (instalación, lint, tipos, tests) terminan sin errores, THE verificación SHALL terminar con éxito.
- AC-11 (FR-08): WHEN un desarrollador corre el comando de lint declarado en el repositorio, THE linter SHALL analizar `server/` y `web/` con las mismas reglas que la verificación.
- AC-12 (FR-09): WHEN la verificación termina, THE pull request SHALL mostrar si pasó o falló y, si falló, en qué paso.
- AC-13 (NFR-01): IF la verificación necesitara un secreto para correr, THEN THE verificación SHALL fallar en lugar de leerlo de un valor escrito en el repositorio.
- AC-14 (NFR-02): WHILE corre la verificación, THE tests SHALL ejecutarse en modo mock, sin llamadas a servicios externos.
- AC-15 (NFR-04): WHILE corre la verificación, THE verificación SHALL tener solo permisos de lectura sobre el repositorio.

### Decisiones (usuario, 2026-11-11)

- El linter bloquea desde el día uno: en este ticket se corrigen todas las violaciones del código existente.
- Conjunto de reglas: el estricto que usa información de tipos (no el recomendado sin tipos).
- El chequeo de tipos se suma como paso de la verificación, además de instalación, lint y tests.

## Out of Scope

- Configurar la protección de la rama `main` en GitHub (que el check sea obligatorio para mergear): es una configuración del repositorio en GitHub, no del código.
- Ejecutar la verificación en pushes directos a `main` o en otras ramas sin pull request.
- Build y deploy de la aplicación.
- Formateo automático del código (formatter).
- Umbral mínimo de cobertura de tests en la verificación.
- Reglas de lint para archivos que no son TypeScript/TSX (Markdown, JSON, scripts de `.daw/`).

## Risks and Mitigations

- **Las reglas estrictas con tipos encuentran muchas violaciones en el código actual** y el ticket crece: se mide la cantidad antes de corregir; si es desproporcionada, se vuelve a consultar al usuario antes de seguir (no se relajan reglas por cuenta propia).
- **Corregir violaciones cambia comportamiento** (por ejemplo, agregar `await` a una promesa): cada corrección queda cubierta por los tests existentes, que tienen que seguir pasando.
- **El lint con información de tipos es lento**: NFR-05 acota la duración total; si se excede, se revisa en el spec.
- **Un test futuro podría llamar a un servicio real**: la verificación no tiene secretos, así que esa llamada falla en vez de llegar al servicio (AC-13, AC-14).

## Dependencies

- Herramientas elegidas por el usuario, a detallar en el spec: GitHub Actions para la verificación, ESLint con `typescript-eslint` (`strict-type-checked`) como linter.
- Los scripts existentes del repositorio: `npm ci`, `npm run typecheck` y `npm test` (declarados en `AGENTS.md` → Stack).
- El modo mock descripto en `AGENTS.md` (`MOCK_MODE=true`).
