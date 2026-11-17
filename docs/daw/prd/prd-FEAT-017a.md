# PRD FEAT-017a: Tests separados en unit e integration, y CI en lint → unit → integration

| Field | Value |
|-------|-------|
| Ticket | FEAT-017a |
| Tracker | none |
| Date | 2026-11-17 |
| PRD loops | 0 |
| Loops since last human decision | 0 |

## Context and Problem

La verificación de pull requests (FEAT-002) es una sola etapa que instala, corre el lint, el chequeo
de tipos y todos los tests juntos. Cuando falla, el PR solo dice que falló "la verificación": no se
distingue si se rompió el estilo, una regla de negocio o la integración con la base. Además, los tests
están ordenados por capa de arquitectura y no por tipo, así que no hay forma de correr solo los
rápidos o solo los que tocan la base. Primera parte de FEAT-017 (ver `prd-FEAT-017.md`).

## Goals

- Que el PR muestre si la verificación falló en lint, en unit o en integration.
- Que una etapa cara no se ejecute si una más barata ya falló.
- Que los tests estén separados por tipo en carpetas propias, y que cada etapa corra solo los suyos.
- Mantener las garantías de FEAT-002: sin secretos, sin servicios externos, solo lectura.

## Functional Requirements

- FR-01: La verificación de un pull request se divide en tres etapas, en este orden: lint, unit e integration, y cada una empieza solo si la anterior terminó con éxito.
- FR-02: La etapa lint corre el linter y el chequeo de tipos del monorepo.
- FR-03: Cada test del servidor vive en una de dos carpetas según lo que toca: integration si abre la base de datos real, levanta la aplicación HTTP o usa un servicio de red; unit en cualquier otro caso.
- FR-04: La etapa unit corre los tests unitarios del servidor y los tests de la web, y ningún otro.
- FR-05: La etapa integration corre los tests de integración del servidor, y ningún otro, con la base de datos que esos tests necesitan disponible.
- FR-06: Los tests unitarios y los de integración se pueden correr localmente, cada tipo con un comando propio declarado en el repositorio.

## Non-Functional Requirements

- NFR-01: 0 secretos: ninguna credencial, token ni clave escrita en el repositorio ni leída por ninguna etapa.
- NFR-02: 0 llamadas al LLM real: ninguna etapa recibe una clave del proveedor del modelo, y los tests corren en modo de prueba, con los servicios externos (LLM, ARCA, email, cotización) simulados.
- NFR-03: Todas las etapas usan la versión mayor del runtime que declara el proyecto (Node 24).
- NFR-04: Todas las etapas tienen 0 permisos de escritura sobre el repositorio.
- NFR-05: Cada etapa termina en menos de 10 minutos.
- NFR-06: La cantidad de tests que corren unit e integration juntas es igual a la cantidad que corría la verificación antes de este ticket, más los tests nuevos de este ticket: 0 tests perdidos en la reorganización.

## Acceptance Criteria
*(EARS — see `.daw/rules/validation-rules.instructions.md` §1 for the five patterns)*

- AC-02 (FR-01): IF una etapa falla, THEN THE verificación SHALL no ejecutar ninguna de las etapas siguientes.
- AC-03 (FR-02): IF el linter o el chequeo de tipos reportan al menos un error, THEN THE etapa lint SHALL fallar.
- AC-04 (FR-03): WHEN se reorganizan los tests, THE servidor SHALL tener cada test que abre la base real, levanta la aplicación HTTP o usa un servicio de red dentro de la carpeta de integración, y cada uno de los demás dentro de la carpeta unitaria.
- AC-05 (FR-04): IF un test unitario o un test de la web falla, THEN THE etapa unit SHALL fallar.
- AC-06 (FR-04): WHEN corre la etapa unit, THE etapa unit SHALL ejecutar 0 tests de la carpeta de integración y 0 pruebas de punta a punta.
- AC-07 (FR-05): IF un test de integración falla, THEN THE etapa integration SHALL fallar.
- AC-08 (FR-05): WHEN corre la etapa integration, THE etapa integration SHALL ejecutar 0 tests unitarios y 0 pruebas de punta a punta.
- AC-13 (FR-06): WHEN un desarrollador corre el comando local de un tipo de test, THE comando SHALL ejecutar solo los tests de ese tipo.
- AC-15 (NFR-02): WHILE corre cualquier etapa, THE verificación SHALL correr con el modo de prueba activo y sin ninguna variable que contenga una clave del proveedor del modelo ni un secreto del repositorio.
- AC-16 (NFR-06): WHEN se comparan las corridas antes y después de la reorganización, THE suma de tests de unit e integration SHALL ser igual a la cantidad previa más los tests nuevos de este ticket.

### Decisiones (usuario, 2026-11-17)

- D-01: Los tests se mueven físicamente a carpetas `unit/` e `integration/` (opción A), en lugar de mapear cada etapa a las carpetas de capa que existen hoy.
- D-02: El criterio para repartirlos es lo que el test toca, no su capa: un test de aplicación que abre la base real, o un contract test que corre contra la base real, va a integración.
- D-04: El chequeo de tipos corre dentro de la etapa lint, para no perder un paso que la verificación ya hace.
- D-05: FEAT-017 se parte en dos (W-PRD-06 decidido por el usuario): esta parte reorganiza los tests y arma lint → unit → integration; FEAT-017b suma la etapa e2e. Esta parte queda en 10 criterios porque mover los tests sin las etapas que los usan no cambia nada visible en el PR, y las etapas sin la reorganización no tienen carpetas que correr.

### Hechos del repositorio que acotan el pedido

- La base de datos es SQLite en un archivo: la etapa integration no necesita un servicio de base de datos aparte; la "base que necesite" es un archivo temporal propio de cada test.
- Hoy no hay código que llame al LLM: el "doble del modelo" es el modo de prueba y la ausencia de cualquier clave del proveedor en la verificación (NFR-02).

### Supuestos (a confirmar; no decididos por el usuario)

- S-01: El disparador sigue siendo solo `pull_request`, como en FEAT-002.
- S-02: El comando de tests general (`npm test`, el que usa `daw-test`) corre unit e integración juntos.

## Out of Scope

- La etapa e2e, Playwright y las pruebas de punta a punta (FEAT-017b).
- Un doble del LLM con respuestas simuladas (no hay código que llame al LLM todavía).
- Ejecutar la verificación en pushes directos a `main` o en ramas sin pull request.
- Configurar la protección de la rama `main` para exigir estas etapas.
- Cambiar el comportamiento de algún test: la reorganización solo los mueve de carpeta.
- Umbral mínimo de cobertura en la verificación.

## Risks and Mitigations

- **Mover cientos de tests rompe imports relativos** y algún test deja de correr sin que nadie lo note: NFR-06 y AC-16 comparan la cantidad de tests antes y después.
- **Un test mal clasificado** (unitario que en realidad abre la base) queda en la etapa equivocada: el criterio de FR-03 es verificable leyendo el test, y AC-04 lo revisa.
- **Instalar dependencias en cada etapa alarga la verificación**: NFR-05 acota cada etapa; el detalle de la caché va en el spec.
- **Los tests de FEAT-002 que fijan la forma de la verificación dejan de valer**: se reescriben para fijar la forma nueva, sin perder las garantías que cubrían (sin secretos, solo lectura, acciones fijadas por SHA).

## Dependencies

- FEAT-002: la verificación actual y sus garantías (sin secretos, solo lectura, acciones fijadas por SHA, cancelación de corridas viejas), que se mantienen.
- FEAT-017: el PRD padre (índice de la partición).
