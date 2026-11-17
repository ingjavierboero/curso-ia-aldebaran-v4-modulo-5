```
/daw-validate-spec docs/daw/specs/spec-FEAT-011.md — PASSED
────────────────────────────────────────────────────────────────
  ✅ F-SPEC-01: all 13 FR from the PRD are referenced by a block
  ✅ F-SPEC-02: all 15 AC from the PRD are named by at least one test
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
  ⚠️ W-SPEC-02: large block, consider splitting: Block 1 (Dominio de la configuración y mudanza de IvaCondition) (15 files, 757 words), Block 2 (Persistencia de la configuración) (9 files, 451 words), Block 4 (Rutas HTTP) (6 files, 635 words), Block 5 (Pantalla de configuración) (6 files, 575 words)
  👁  F-SPEC-12 (contradicts the PRD) and F-SPEC-13 (terminology diverging from
      the PRD) are MANUAL: judge them and say so explicitly in your report.
  ✅ F-SPEC-LOOP: 0 loop(s) since a human decided, under the ceiling of 3; 0 in total for this document
────────────────────────────────────────────────────────────────
Total: 13 passed, 0 failed, 1 warnings
Result: PASSED
```
