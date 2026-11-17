# PRD FEAT-017b: Etapa e2e en el CI con Playwright y prueba de humo de inicio de sesión

| Field | Value |
|-------|-------|
| Ticket | FEAT-017b |
| Tracker | none |
| Date | 2026-11-17 |
| PRD loops | 0 |
| Loops since last human decision | 0 |

## Context and Problem

No existe ninguna prueba de punta a punta: nadie verifica automáticamente que la aplicación,
levantada completa, deje iniciar sesión en un navegador. Cuando una prueba así falle en el CI, hace
falta ver qué pasó sin poder reproducirlo a mano. Segunda parte de FEAT-017 (ver `prd-FEAT-017.md`),
sobre la verificación en lint → unit → integration que deja FEAT-017a.

## Goals

- Tener una primera prueba de punta a punta en navegador sobre la aplicación completa.
- Que corra en el CI solo cuando las etapas más baratas ya pasaron.
- Que, si falla, deje evidencia descargable para diagnosticarla.

## Functional Requirements

- FR-01: La verificación de un pull request suma una cuarta etapa, e2e, que corre después de integration y solo si integration terminó con éxito.
- FR-02: El repositorio tiene al menos una prueba de punta a punta que, en un navegador y sobre la aplicación recién levantada, da de alta el primer Admin, inicia sesión con él y llega a la pantalla de inicio.
- FR-03: La etapa e2e levanta la aplicación completa (servidor y web) en modo de prueba y corre las pruebas de punta a punta en un navegador.
- FR-04: Cuando la etapa e2e falla, sus capturas de pantalla y sus trazas de ejecución quedan disponibles como artefacto descargable desde la corrida del pull request.
- FR-05: Las pruebas de punta a punta se corren localmente con un comando propio declarado en el repositorio, y el comando de tests general no las incluye.

## Non-Functional Requirements

- NFR-01: 0 secretos: ninguna credencial, token ni clave escrita en el repositorio ni leída por la etapa e2e.
- NFR-02: 0 llamadas al LLM real: la etapa e2e no recibe ninguna clave del proveedor del modelo, y la aplicación corre en modo de prueba, con los servicios externos (LLM, ARCA, email, cotización) simulados.
- NFR-03: La etapa e2e termina en menos de 10 minutos.
- NFR-04: El artefacto de evidencia se conserva 7 días.
- NFR-05: La etapa e2e tiene 0 permisos de escritura sobre el repositorio.

## Acceptance Criteria
*(EARS — see `.daw/rules/validation-rules.instructions.md` §1 for the five patterns)*

- AC-01 (FR-01): WHEN se abre un pull request o se pushea un commit a su rama, THE verificación SHALL mostrar en el PR cuatro etapas separadas llamadas lint, unit, integration y e2e.
- AC-09 (FR-02): WHEN la prueba de punta a punta corre sobre una aplicación recién levantada, THE prueba SHALL dar de alta el primer Admin, iniciar sesión con él y verificar que llega a la pantalla de inicio.
- AC-10 (FR-03): WHEN corre la etapa e2e, THE etapa e2e SHALL levantar servidor y web en modo de prueba y ejecutar las pruebas de punta a punta en un navegador.
- AC-11 (FR-04): IF la etapa e2e falla, THEN THE verificación SHALL publicar un artefacto descargable con las capturas de pantalla y las trazas de ejecución.
- AC-12 (FR-04): WHEN la etapa e2e termina con éxito, THE verificación SHALL no publicar el artefacto de evidencia.
- AC-14 (FR-05): WHEN un desarrollador corre el comando de tests general, THE comando SHALL ejecutar los tests unitarios y de integración, y no las pruebas de punta a punta.

### Decisiones (usuario, 2026-11-17)

- D-03: El alcance de las pruebas de punta a punta es un solo recorrido de humo (alta del primer Admin, inicio de sesión, pantalla de inicio). Los recorridos de facturación quedan para cuando existan.
- D-05: FEAT-017 se parte en dos (W-PRD-06 decidido por el usuario): esta parte suma la etapa e2e sobre la verificación que deja FEAT-017a.

### Hechos del repositorio que acotan el pedido

- Hoy no hay código que llame al LLM: el "doble del modelo" es el modo de prueba de la aplicación y la ausencia de cualquier clave del proveedor en la etapa (NFR-02). El doble con respuestas simuladas llega con el ticket que implemente la clasificación por LLM.

### Supuestos (a confirmar; no decididos por el usuario)

- S-01: La retención del artefacto de evidencia es de 7 días (NFR-04).
- S-02: Se prueba en un solo navegador (Chromium).

## Out of Scope

- Pruebas de punta a punta de facturación, pagos, clientes o configuración.
- Un doble del LLM con respuestas simuladas.
- Probar en más de un navegador.
- Reorganizar los tests unitarios y de integración (FEAT-017a).

## Risks and Mitigations

- **El navegador es lento de instalar** y la etapa supera NFR-03: se mide en la primera corrida y se revisa en el spec.
- **La prueba es inestable** (depende de tiempos de arranque): la etapa espera a que la aplicación responda antes de empezar, y la evidencia de FR-04 permite diagnosticar una falla.
- **La prueba deja datos de una corrida a otra** y falla al no encontrar la pantalla de alta del primer Admin: cada corrida arranca con una base nueva.

## Dependencies

- FEAT-017a: la verificación en lint → unit → integration sobre la que se encadena esta etapa.
- FEAT-017: el PRD padre (índice de la partición).
- FEAT-001 y FEAT-006: el inicio de sesión y el alta del primer Admin ya implementados.
- Una herramienta de pruebas de punta a punta en navegador; el usuario pidió Playwright. El detalle va en el spec.
