```
/daw-validate-spec docs/daw/specs/spec-FEAT-008.md — PASSED
────────────────────────────────────────────────────────────────
  ✅ F-SPEC-01: all 18 FR from the PRD are referenced by a block
  ✅ F-SPEC-02: all 16 AC from the PRD are named by at least one test
  ✅ F-SPEC-03: all 4 NFR carry a technical strategy
  ·  5 block(s) found
  ✅ F-SPEC-04: every block lists the files it creates or modifies
  ✅ F-SPEC-05: every block has a verifiable completion criterion
  ✅ F-SPEC-06: every block lists at least one required test
  ✅ F-SPEC-07: every endpoint carries a complete contract
  ✅ F-SPEC-08: every schema declares its constraints
  ✅ F-SPEC-09: every block taking input documents its validation
  ✅ F-SPEC-10: every block documents its error handling
  ✅ F-SPEC-16: every documented error is named by a test
  ✅ F-SPEC-11: dependencies between blocks are declared
  ⚠️ W-SPEC-02: large block, consider splitting: Block 1 (Token de recuperación: dominio y persistencia) (8 files, 562 words), Block 2 (Casos de uso de la recuperación) (6 files, 856 words), Block 3 (Envío de emails, configuración y log del envío) (8 files, 485 words), Block 4 (Rutas públicas, límites y log de autenticación) (7 files, 885 words), Block 5 (Web: "Olvidé mi contraseña" y cambio con el enlace) (6 files, 639 words)
  👁  F-SPEC-12 (contradicts the PRD) and F-SPEC-13 (terminology diverging from
      the PRD) are MANUAL: judge them and say so explicitly in your report.
  ✅ F-SPEC-LOOP: 1 loop(s) since a human decided, under the ceiling of 3; 1 in total for this document
────────────────────────────────────────────────────────────────
Total: 13 passed, 0 failed, 1 warnings
Result: PASSED
```
