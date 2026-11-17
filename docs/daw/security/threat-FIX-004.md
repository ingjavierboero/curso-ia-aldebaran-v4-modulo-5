# Threat model FIX-004: El SAST bloquea solo por dependencias de producción

| Field | Value |
|-------|-------|
| Ticket | FIX-004 |
| Spec | docs/daw/specs/fix-FIX-004.md |
| Tier | FIX |
| Date | 2026-11-17 |

## Components
| Component | Source in the spec |
|---|---|
| `AGENTS.md` (`Audit: npm audit --omit=dev`) | Step 1 |
| `docs/daw/security/sast-FIX-004.md` (audit de dependencias del SAST) | Step 3 |

## Trust boundaries
- Registry de npm → `package-lock.json`: el código de terceros entra al repo; `npm audit` contrasta esas versiones con los avisos publicados.
- Máquina de desarrollo y CI → servidor de producción: solo cruzan las `dependencies`; vite, vitest y picomatch quedan del lado del build.

## STRIDE analysis
### `AGENTS.md` (`Audit: npm audit --omit=dev`)
- **Spoofing:** sin identidades en juego: es una línea de configuración del repo, cambiada por PR revisado.
- **Tampering:** alguien podría ampliar la exclusión (por ejemplo `--audit-level=critical`) para esconder una High de producción; el comando queda fijado en el ADR-009 y un cambio pasa por PR (R-02).
- **Repudiation:** el cambio queda en git con su commit y en ADR-009.
- **Information Disclosure:** el comando no expone datos; los reportes SAST son públicos en el repo y solo nombran avisos públicos.
- **Denial of Service:** no aplica: no corre en producción.
- **Elevation of Privilege:** no otorga permisos.

### `docs/daw/security/sast-FIX-004.md` (audit de dependencias del SAST)
- **Spoofing:** el aviso se consulta contra el registry oficial de npm por HTTPS.
- **Tampering:** una herramienta de desarrollo comprometida o vulnerable (como picomatch) deja de frenar el ticket; queda listada en F-SAST-13 de cada reporte (R-01).
- **Repudiation:** cada reporte SAST queda commiteado con su fecha y su resultado.
- **Information Disclosure:** sin datos del producto: solo nombres de paquetes y avisos públicos.
- **Denial of Service:** el ReDoS de picomatch necesita patrones glob del atacante; en vite y vitest los patrones salen de la configuración del repo, y picomatch no llega a producción.
- **Elevation of Privilege:** no aplica: el audit no ejecuta código de las dependencias.

## Data classification
| Data | Class | At rest | In transit |
|---|---|---|---|
| lista de dependencias y avisos | public | en git, sin cifrar (es pública) | HTTPS contra el registry de npm |

## Risks and mitigations
| ID | Risk | STRIDE | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R-01 | una vulnerabilidad explotable en una herramienta de desarrollo o del CI no frena el ticket | T | L | M | F-SAST-13 la lista en cada reporte; Dependabot (FEAT-005) propone la versión corregida |
| R-02 | el comando se amplía para esconder vulnerabilidades de producción | T | L | H | comando fijado en ADR-009, cambios por PR; el Test 5 del fix-plan verifica que el comando no excluye `dependencies` |

## Supply chain
No se agregan dependencias. El cambio reduce el alcance que bloquea, no el que se reporta.

## Availability
No hay superficie nueva en producción.
