```
/daw-validate-spec docs/daw/specs/spec-FEAT-010.md — PASSED
────────────────────────────────────────────────────────────────
  ✅ F-SPEC-01: all 19 FR from the PRD are referenced by a block
  ✅ F-SPEC-02: all 17 AC from the PRD are named by at least one test
  ✅ F-SPEC-03: all 3 NFR carry a technical strategy
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
  ⚠️ W-SPEC-02: large block, consider splitting: Block 1 (Dominio: CUIT, condición IVA, precio, cliente, producto y permisos) (10 files, 700 words), Block 2 (Persistencia de clientes, productos y asignaciones) (6 files, 498 words), Block 3 (Casos de uso) (6 files, 582 words), Block 4 (Rutas HTTP) (5 files, 724 words), Block 5 (Web) (6 files, 544 words)
  👁  F-SPEC-12 (contradicts the PRD) and F-SPEC-13 (terminology diverging from
      the PRD) are MANUAL: judge them and say so explicitly in your report.
  ✅ F-SPEC-LOOP: 2 loop(s) since a human decided, under the ceiling of 3; 2 in total for this document
────────────────────────────────────────────────────────────────
Total: 13 passed, 0 failed, 1 warnings
Result: PASSED
```
