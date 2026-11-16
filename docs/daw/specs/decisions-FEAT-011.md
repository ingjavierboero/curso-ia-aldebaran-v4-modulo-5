# Decisions FEAT-011

- D-01 se pueden guardar los datos de la empresa emisora con obligatorios vacíos y el aviso nombra los faltantes; D-02 la fecha de inicio de actividades no puede ser posterior a hoy (hora de Argentina); D-03 el número de ingresos brutos es texto libre de 1 a 50 caracteres; D-04 la pantalla muestra solo los valores de este ticket — usuario — 2026-11-16 — DEFINE.
- D-05 la facturación se parte en cinco tickets (FEAT-011 configuración, FEAT-012 cotización, FEAT-013 ARCA, FEAT-014 proceso de facturación, FEAT-015 PDF y email) y este es el primero — usuario — 2026-11-16 — CLASSIFY.
- D-06 en FEAT-011 se mueve a `domain/shared` solo `IvaCondition` (la empresa emisora usa un subconjunto); `Cuit` se mueve en FEAT-013 y `Currency` en FEAT-012, cuando hagan falta (F1 del arch-auditor; reemplaza lo dicho al clasificar, que movía los tres) — usuario — 2026-11-16 — PLAN.
- D-07 al número de ingresos brutos se le quitan los espacios del principio y del final antes de validar el largo, y un valor de solo espacios se rechaza (W8 del arch-auditor; FR-08 y AC-09 del PRD, vuelta a DEFINE `9222359`) — usuario — 2026-11-16 — PLAN.
- Supuestos S-01 (textos del emisor de 1 a 200 caracteres, con trim), S-02 (fecha de inicio desde 01/01/1900), S-03 (un dato que no se envía conserva su valor) — asistente, marcados en el PRD — 2026-11-16 — DEFINE.
