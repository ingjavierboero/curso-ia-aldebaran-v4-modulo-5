# ADR-008: Configuración en una tabla de una sola fila con columnas tipadas

| Field | Value |
|-------|-------|
| Date | 2026-11-16 |
| Ticket | FEAT-011 |
| Status | Accepted |

## Context
FEAT-011 fue el primer ticket que guardó configuración del sistema: la hora de facturación, el
punto de venta y los datos de la empresa emisora (`docs/daw/prd/prd-FEAT-011.md`). El glosario
anticipa más valores en tickets futuros: el intervalo de la casilla, la hora de recordatorios, los
reintentos y la espera entre ellos. Hacía falta un lugar donde esos valores se conservaran con su
tipo y no pudieran quedar inválidos en la base (NFR-01, NFR-02).

## Options considered

### Option 1: tabla `settings` de una sola fila, una columna por valor
- **Pros:** cada columna tiene su tipo y su CHECK derivado de las constantes del dominio, como
  `clients` y `products` (FEAT-010); la lectura es una fila por clave primaria; Drizzle tipa la fila.
- **Cons:** cada módulo nuevo suma columnas con una migración; los guardados de módulos distintos
  comparten la fila.

### Option 2: tabla clave-valor (`key`, `value` texto)
- **Pros:** agregar un valor no requiere migración.
- **Cons:** todo se guarda como texto, sin tipos ni CHECK por valor; la validación queda solo en el
  código y una fila mal escrita pasa a la base; leer el agregado son varias filas que hay que armar.

## Decision
Se eligió la opción 1: una tabla `settings` con CHECK `id = 1` y una columna por valor. Pesó que el
proyecto ya usaba CHECK derivados del dominio como defensa en profundidad y que estos datos terminan
impresos en facturas ante ARCA. Cada módulo suma sus columnas y su propio agregado sobre la misma
fila, y su upsert actualiza solo sus columnas (`ON CONFLICT(id) DO UPDATE SET` de esas), para no pisar
las de otro módulo.

## Consequences
- La migración `0004` creó `settings`; FEAT-011 escribe solo las columnas de facturación.
- Sin fila, el repositorio devuelve los valores por defecto del dominio (hora 11:00, el resto vacío).
- Cada valor nuevo de configuración requiere una migración y una columna con su CHECK.
