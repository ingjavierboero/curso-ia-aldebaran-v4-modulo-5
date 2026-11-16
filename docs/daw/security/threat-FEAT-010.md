# Threat model FEAT-010: Clientes y productos

| Field | Value |
|-------|-------|
| Ticket | FEAT-010 |
| Spec | docs/daw/specs/spec-FEAT-010.md |
| Tier | FEATURE |
| Date | 2026-11-16 |

## Components
| Component | Source in the spec |
|---|---|
| `server/src/domain/client/Cuit.ts`, `Client.ts`, `server/src/domain/product/Price.ts`, `Product.ts` | Block 1 |
| `server/src/domain/auth/Authorization.ts` (`clients.*`, `products.*`) | Block 1 |
| `server/src/infrastructure/db/DrizzleClientRepository.ts`, `DrizzleProductRepository.ts`, `DrizzleClientProductRepository.ts` (tablas `clients`, `products`, `client_products`) | Block 2 |
| `server/src/application/client/AssignProducts.ts` y demás casos de uso de clientes y productos | Block 3 |
| `server/src/infrastructure/http/routes/clients.ts` y `routes/products.ts` | Block 4 |
| `web/src/pages/ClientsPage.tsx`, `ClientDetailPage.tsx`, `ProductsPage.tsx` | Block 5 |

## Trust boundaries
- Navegador → API (`/api/clients*`, `/api/products*`): cruzan la cookie de sesión y los datos de clientes (razón social, CUIT, domicilio, email de facturación) y de productos (nombre, precio).
- API → base SQLite: cruzan las filas de `clients`, `products` y `client_products`.
- Server → navegador: los DTOs con datos de clientes que se muestran a los tres perfiles.

## STRIDE analysis
### `server/src/domain/client/Cuit.ts`, `Client.ts`, `server/src/domain/product/Price.ts`, `Product.ts`
- **Spoofing:** sin identidad propia; reciben datos ya autenticados por la ruta.
- **Tampering:** validan CUIT (prefijo y dígito verificador), condición IVA, largos y precio con gramática fija; un dato fuera de regla no llega a la base (R-03).
- **Repudiation:** no aplica a entidades puras; el historial del cliente queda fuera de alcance (R-06).
- **Information Disclosure:** no exponen nada por sí mismas.
- **Denial of Service:** validaciones O(n) sobre strings acotados (≤ 254 caracteres).
- **Elevation of Privilege:** sin superficie.

### `server/src/domain/auth/Authorization.ts` (`clients.*`, `products.*`)
- **Spoofing:** el perfil sale de la sesión validada en el server, nunca del body.
- **Tampering:** tabla congelada y deny-by-default; Consulta solo `*.read` (R-01).
- **Repudiation:** las acciones denegadas devuelven 403; no se registran (R-06).
- **Information Disclosure:** no expone datos.
- **Denial of Service:** consulta O(1).
- **Elevation of Privilege:** un Consulta que llama directo a la API recibe `Forbidden` en el caso de uso, no solo en la web (R-01).

### `server/src/infrastructure/db/DrizzleClientRepository.ts`, `DrizzleProductRepository.ts`, `DrizzleClientProductRepository.ts` (tablas `clients`, `products`, `client_products`)
- **Spoofing:** sin entrada del cliente directa: reciben entidades del dominio.
- **Tampering:** consultas parametrizadas de Drizzle; UNIQUE, CHECK y FK en la base como última barrera; duplicados simultáneos terminan en un solo registro (R-02).
- **Repudiation:** `created_at` en las tres tablas.
- **Information Disclosure:** los errores de restricción se traducen a errores de dominio sin exponer SQL.
- **Denial of Service:** listados en una consulta indexada; NFR-02 lo mide con 1000 filas.
- **Elevation of Privilege:** sin superficie.

### `server/src/application/client/AssignProducts.ts` y demás casos de uso de clientes y productos
- **Spoofing:** `requireActor` relee el usuario Activo dentro de la transacción; un usuario dado de baja no opera.
- **Tampering:** asignación todo o nada; productos Inactivos rechazados; control de duplicados dentro de la transacción IMMEDIATE (R-02).
- **Repudiation:** sin historial en este ticket (R-06).
- **Information Disclosure:** responden DTOs con campos explícitos, nunca la entidad completa.
- **Denial of Service:** lote de asignación limitado a 50 ids (R-04).
- **Elevation of Privilege:** `assertCan` antes de la transacción en cada escritura (R-01).

### `server/src/infrastructure/http/routes/clients.ts` y `routes/products.ts`
- **Spoofing:** todas las rutas exigen sesión (deny-by-default de `authMiddleware`); ninguna se agrega a `PUBLIC_ROUTES`.
- **Tampering:** escrituras solo por POST/PATCH con `requireJson` y cookie `SameSite=Strict` (CSRF, R-05); desasignar por POST para no salir de esa defensa.
- **Repudiation:** 403/409 con mensajes explícitos; log de errores inesperados en `errorHandler`.
- **Information Disclosure:** 404 genérico para ids inexistentes; los tres perfiles ven clientes por diseño (RF-09, RF-11).
- **Denial of Service:** bodies limitados por `express.json` y largos máximos por campo; listas de ids acotadas.
- **Elevation of Privilege:** el permiso se valida en el caso de uso, no en la ruta, así ninguna ruta nueva puede olvidarlo.

### `web/src/pages/ClientsPage.tsx`, `ClientDetailPage.tsx`, `ProductsPage.tsx`
- **Spoofing:** sin credenciales propias; usa la cookie de sesión.
- **Tampering:** validación en el formulario solo como ayuda; el server es la autoridad.
- **Repudiation:** el registro lo hace el server.
- **Information Disclosure:** React escapa los textos (razón social, domicilio); sin `dangerouslySetInnerHTML` (R-03).
- **Denial of Service:** sin superficie relevante.
- **Elevation of Privilege:** ocultar acciones a Consulta es solo UX; el server rechaza igual (R-01).

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| razón social, domicilio, CUIT, email de facturación | PII | SQLite local del server, archivo con permisos del proceso; sin cifrado de columna (dato fiscal operativo) | HTTPS en producción; cookie `Secure` |
| precio y moneda de productos | public | SQLite, centavos enteros | HTTPS en producción |
| cookie de sesión | credentials | solo el hash del token en `sessions` (FEAT-001) | HTTPS en producción, `HttpOnly`, `SameSite=Strict`, `Secure` |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | un Consulta modifica clientes o productos llamando a la API | E | M | H | `assertCan` en cada caso de uso de escritura; tests por ruta con 403 |
| R-02 | altas simultáneas crean CUIT, email o nombre duplicados | T | L | H | UNIQUE en la base + control en la transacción IMMEDIATE + traducción a 409; test de carrera |
| R-03 | datos fiscales inválidos o con HTML llegan a la factura o a la pantalla | T | M | M | validación de CUIT, condición IVA y largos en el dominio; React escapa la salida |
| R-04 | lote de asignación enorme que degrada el server | D | L | M | 1–50 ids sin repetidos, validado en la ruta |
| R-05 | CSRF sobre escrituras | T | L | H | `requireJson` + `SameSite=Strict`; desasignar por POST |
| R-06 | sin registro de quién cambió un cliente | R | M | L | accepted, see below |

## Accepted risks
### R-06
- **Accepted by:** Javier (usuario), al aprobar el alcance de FEAT-010 sin el historial del cliente
- **Justification:** el historial del cliente (`client_events`) es P3 del PRD general y quedó fuera de alcance del ticket; los perfiles que modifican son Admin y Editor, de confianza.
- **Review conditions:** se revisa al implementar el historial del cliente (RF-162 y siguientes) o si se incorporan Editors externos.

## Supply chain
Sin dependencias nuevas: Drizzle, Express, React y antd ya están en el proyecto y cubiertos por
`npm audit` y Dependabot.

## Availability
Listados en una sola consulta indexada con 1000 filas medidos en < 500 ms (NFR-02); bodies y listas
acotados; el resto de la disponibilidad sigue los controles existentes (límite del parser JSON).
