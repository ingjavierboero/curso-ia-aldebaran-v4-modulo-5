# Decisiones FEAT-016

Decisiones aprobadas por el usuario durante CODE (formato: decisión — quién — fecha — bloque):

- Escribir primero los 5 tests y mostrarlos en rojo antes de implementar; después, "implementa la regla" — usuario — 2026-11-17 — Block 1.
- D-10: si al pago ya imputado le falta el número de operación o la fecha y coincide en lo que tiene, se decide "posible pago duplicado" — usuario — 2026-11-17 — Block 1 (llevada al PRD, vuelta a DEFINE, 3012d73).
- D-11: sin fecha ni número de operación, con el mismo CUIT y monto, se decide "posible pago duplicado" — usuario — 2026-11-17 — Block 1 (llevada al PRD, 3012d73).
- Se mantiene el umbral de 50 ms del test de tiempo aunque el arch-auditor lo marcó como posible fuente de fallos intermitentes, porque lo fija NFR-02 — implementador, sin objeción del usuario — 2026-11-17 — Block 1.
- Pausar el ticket por GHSA-fc5q-39xc-vjpf y retomarlo después de FIX-004 (SAST solo de producción, ADR-009) — usuario — 2026-11-17 — cierre de CODE.
