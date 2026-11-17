# Threat model FEAT-016: No imputar dos veces un pago reenviado

| Field | Value |
|-------|-------|
| Ticket | FEAT-016 |
| Spec | docs/daw/specs/spec-FEAT-016.md |
| Tier | FEATURE |
| Date | 2026-11-17 |

## Components
| Component | Source in the spec |
|---|---|
| `server/src/domain/payment/DuplicatePaymentPolicy.ts` | Block 1 |

## Trust boundaries
- Email del cliente → extracción del LLM → `DuplicatePaymentPolicy`: los datos del comprobante (CUIT del ordenante, monto, fecha, número de operación) vienen de un adjunto que controla el remitente; la política los recibe ya extraídos, pero los trata como no confiables.

## STRIDE analysis
### `server/src/domain/payment/DuplicatePaymentPolicy.ts`
- **Spoofing:** un tercero podría enviar desde el email de un cliente un comprobante armado; la política no autentica remitentes, solo compara datos, y la imputación final sigue requiriendo confirmación humana (RF-143).
- **Tampering:** un cliente podría alterar el número de operación de un comprobante ya imputado para que se tome como nuevo; la coincidencia de monto y la confirmación humana del pago siguen siendo la barrera (R-01).
- **Repudiation:** la política no registra nada; la decisión la registra el control de pagos en el historial del cliente cuando la consuma (fuera de alcance, D-07).
- **Information Disclosure:** la decisión `duplicado` devuelve el comprobante coincidente del mismo cliente; nunca compara contra otros clientes, así que no expone datos ajenos.
- **Denial of Service:** un número de operación muy largo o miles de imputados podrían hacer lenta la comparación; el recorrido es lineal y NFR-02 fija 50 ms con 1000 imputados (R-02).
- **Elevation of Privilege:** la política no decide `pagada` ni cambia facturas; no hay privilegio que escalar.

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| CUIT del ordenante | PII | no se persiste en este ticket (solo memoria) | no viaja: función en proceso |
| monto y fecha del pago | financial | no se persiste en este ticket | no viaja: función en proceso |
| número de operación | financial | no se persiste en este ticket | no viaja: función en proceso |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | número de operación alterado para evitar la detección | T | L | M | la coincidencia de monto existente y la confirmación humana del pago (RF-143) siguen vigentes |
| R-02 | comparación lenta con muchos imputados o textos largos | D | L | L | recorrido lineal, normalización en O(n), test de tiempo de NFR-02 |

## Supply chain
Sin dependencias nuevas: TypeScript puro sobre la biblioteca estándar.

## Availability
Función pura y acotada (R-02); no abre puertos ni hace I/O.
