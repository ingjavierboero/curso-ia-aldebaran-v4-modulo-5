```
/daw-validate-spec docs/daw/specs/spec-FEAT-001.md — PASSED
────────────────────────────────────────────────────────────────
  ✅ F-SPEC-01: all 9 FR from the PRD are referenced by a block
  ✅ F-SPEC-02: all 12 AC from the PRD are named by at least one test
  ✅ F-SPEC-03: all 1 NFR carry a technical strategy
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
  ⚠️ W-SPEC-01: block referencing no FR — enabler or gold-plating?: Block 1 (Scaffolding del monorepo y base de datos)
  ⚠️ W-SPEC-02: large block, consider splitting: Block 1 (Scaffolding del monorepo y base de datos) (14 files, 478 words), Block 2 (Dominio y casos de uso) (21 files, 815 words), Block 3 (Adaptadores de infraestructura) (8 files, 377 words), Block 4 (API HTTP, middleware de sesión y composition root) (11 files, 969 words), Block 5 (Web: login, registro del primer Admin y ruta protegida) (13 files, 730 words)
  👁  F-SPEC-12 (contradicts the PRD) and F-SPEC-13 (terminology diverging from
      the PRD) are MANUAL: judge them and say so explicitly in your report.
  ✅ F-SPEC-LOOP: 1 loop(s) since a human decided, under the ceiling of 3; 1 in total for this document
────────────────────────────────────────────────────────────────
Total: 13 passed, 0 failed, 2 warnings
Result: PASSED
```
