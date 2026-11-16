# Threat model FEAT-011: Configuración de facturación

| Field | Value |
|-------|-------|
| Ticket | FEAT-011 |
| Spec | docs/daw/specs/spec-FEAT-011.md |
| Tier | FEATURE |
| Date | 2026-11-16 |

## Components
| Component | Source in the spec |
|---|---|
| `server/src/domain/settings/BillingSettings.ts` | Block 1 |
| `server/src/infrastructure/db/DrizzleSettingsRepository.ts` | Block 2 |
| `server/src/application/settings/UpdateBillingSettings.ts` | Block 3 |
| `server/src/infrastructure/http/routes/settings.ts` | Block 4 |
| `web/src/pages/SettingsPage.tsx` | Block 5 |

## Trust boundaries
- Navegador → API (`GET /api/settings/billing`, `PATCH /api/settings/billing`): cruzan la cookie de sesión y los datos de la empresa emisora (razón social, domicilio comercial, condición frente al IVA, número de ingresos brutos, fecha de inicio de actividades, nombre de fantasía), el punto de venta y la hora de facturación.
- API → base SQLite: cruza la fila única de `settings`.
- Server → navegador: el DTO de configuración con la lista `missing`, que ven los tres perfiles.

## STRIDE analysis
### `server/src/domain/settings/BillingSettings.ts`
- **Spoofing:** el agregado no conoce identidades; la identidad la resuelve el caso de uso (Block 3) antes de construir los cambios.
- **Tampering:** cada valor pasa por su value object (`BillingHour`, `PointOfSale`, `IssuerIvaCondition`, `ActivityStartDate`, textos acotados) y `withChanges` devuelve un agregado nuevo o lanza: no existe un estado a medio validar (FR-13).
- **Repudiation:** el dominio no registra cambios; ver R-02 (sin auditoría, fuera del PRD general).
- **Information Disclosure:** no maneja secretos; los datos del emisor son los que se imprimen en cada factura.
- **Denial of Service:** los textos tienen tope (200 y 50 caracteres) antes de cualquier proceso; nada es iterativo sobre la entrada.
- **Elevation of Privilege:** no decide permisos; la regla "solo Admin escribe" vive en `Authorization.ts` (`settings.manage`).

### `server/src/infrastructure/db/DrizzleSettingsRepository.ts`
- **Spoofing:** no aplica: lo invoca solo el caso de uso, dentro de la unidad de trabajo.
- **Tampering:** consultas por el query builder de Drizzle, sin SQL armado con entrada; CHECK de la tabla derivados de constantes del dominio (`ISSUER_IVA_CONDITIONS`, rangos de punto de venta y formato de hora); una fila alterada fuera del sistema se rechaza al rehidratar con `InvalidStoredValue` (500 genérico).
- **Repudiation:** `updated_at` registra cuándo cambió la configuración por última vez (R-02).
- **Information Disclosure:** `InvalidStoredValue` nombra tabla y columna, nunca el valor guardado.
- **Denial of Service:** una sola fila (CHECK `id = 1`); la lectura es por clave primaria.
- **Elevation of Privilege:** el upsert escribe solo las columnas de facturación (`ON CONFLICT(id) DO UPDATE SET` de esas columnas), así que no puede pisar valores de otros módulos que se sumen a la fila.

### `server/src/application/settings/UpdateBillingSettings.ts`
- **Spoofing:** el actor sale de la sesión validada por el middleware existente (FEAT-001); el caso de uso lo vuelve a leer con `requireActor` dentro de la transacción.
- **Tampering:** lectura, mezcla y guardado dentro de `uow.run` (transacción IMMEDIATE de ADR-003): dos guardados simultáneos se serializan y ninguno pisa al otro con datos viejos (R-03).
- **Repudiation:** sin registro de quién cambió cada valor (R-02, aceptado).
- **Information Disclosure:** los errores de validación tienen mensajes fijos que no repiten el valor enviado.
- **Denial of Service:** un guardado es una transacción corta sobre una fila.
- **Elevation of Privilege:** `requireActor(users, actor, 'settings.manage')` dentro de la transacción: un Admin degradado o dado de baja a mitad de camino recibe 403 y nada cambia (R-01).

### `server/src/infrastructure/http/routes/settings.ts`
- **Spoofing:** las dos rutas quedan detrás del middleware de sesión deny-by-default (FEAT-001); sin sesión, 401.
- **Tampering:** el body pasa por `express.json` con su límite y por los helpers de `body.ts`: tipos exactos, largos máximos tomados de las constantes del dominio, `{}` y un `issuer` vacío o no-objeto → 400; las escrituras exigen JSON (`requireJson`) y la cookie es `SameSite=Strict` (CSRF).
- **Repudiation:** igual que el caso de uso (R-02).
- **Information Disclosure:** el GET devuelve solo valores de configuración, nunca datos de usuarios ni de sesión; `Cache-Control: no-store` del middleware existente.
- **Denial of Service:** body acotado por el parser JSON y por los topes de largo; los límites globales existentes siguen aplicando.
- **Elevation of Privilege:** el PATCH no autoriza en la ruta sino en el caso de uso; un Editor o Consulta recibe 403 sin cambios (AC-13).

### `web/src/pages/SettingsPage.tsx`
- **Spoofing:** usa la sesión de la cookie existente; no maneja credenciales.
- **Tampering:** la validación de la pantalla es solo de interfaz; la que vale es la del server.
- **Repudiation:** no aplica en el cliente.
- **Information Disclosure:** React escapa los textos del emisor; sin `dangerouslySetInnerHTML`.
- **Denial of Service:** no aplica: un formulario con un guardado por acción.
- **Elevation of Privilege:** ocultar el botón Guardar a Editor y Consulta es comodidad; el 403 lo garantiza el server (R-01).

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| razón social, domicilio comercial, nombre de fantasía del emisor | PII | SQLite local del server, archivo con permisos del proceso; sin cifrado de columna (dato fiscal que se imprime en cada factura) | HTTPS en producción; cookie `Secure` |
| condición frente al IVA, número de ingresos brutos, fecha de inicio de actividades | public | SQLite, columnas con CHECK | HTTPS en producción |
| punto de venta y hora de facturación | public | SQLite, columnas con CHECK | HTTPS en producción |
| cookie de sesión | credentials | solo el hash del token en `sessions` (FEAT-001) | HTTPS en producción, `HttpOnly`, `SameSite=Strict`, `Secure` |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | Un Editor o Consulta cambia el punto de venta o los datos del emisor | E | M | H | `settings.manage` solo para Admin, verificado con `requireActor` dentro de la transacción; tests de 403 sin cambios (AC-13) |
| R-02 | No queda registro de quién cambió la configuración | R | M | L | accepted, see below |
| R-03 | Dos guardados simultáneos se pisan y se pierde un cambio | T | L | M | lectura, mezcla y guardado en la misma transacción IMMEDIATE |
| R-04 | Un valor inválido en la base (alterada fuera del sistema) llega a una factura | T | L | H | CHECK en la tabla y `rehydrate` con `InvalidStoredValue` al leer |
| R-05 | Un guardado a medias deja datos del emisor inconsistentes | T | L | M | todo o nada: se validan todos los valores antes de guardar (NFR-01, AC-14) |

## Accepted risks
### R-02
- **Accepted by:** Javier (usuario), al aprobar el alcance de FEAT-011: el PRD general deja fuera la auditoría de los cambios de configuración
- **Justification:** el único perfil que puede cambiar la configuración es Admin, hoy un único usuario; la tabla guarda `updated_at` con la fecha del último cambio.
- **Review conditions:** se revisa si se suma un segundo Admin o al implementar el historial (RF-162 y siguientes).

## Supply chain
Sin dependencias nuevas: Drizzle, Express, React y antd ya están en el proyecto y cubiertos por
`npm audit` y Dependabot.

## Availability
Lectura y escritura de una sola fila por clave primaria (NFR-03, < 200 ms); bodies acotados por el
parser JSON y por los topes de largo; el resto de la disponibilidad sigue los controles existentes.
