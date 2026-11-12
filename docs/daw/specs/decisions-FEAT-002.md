# Decisiones de implementación — FEAT-002

- `--no-ignore` de oxlint no saltea los `ignorePatterns` de la config; `test_promesa_flotante_rechazada` lintea el fixture con una copia temporal de `.oxlintrc.json` sin `ignorePatterns`, pasada con `-c` — aprobado por Javier — 2026-11-12 — Block 1
- Además de las 8 reglas nombradas en el spec, se activan como error las 31 reglas con tipos de oxlint equivalentes a `strict-type-checked` (sin las de categoría `nursery` ni las reglas sin tipos) — aprobado por Javier — 2026-11-12 — Block 1
- Plugins `["typescript", "unicorn", "oxc"]`, para conservar la categoría `correctness` de los plugins por defecto de oxlint (0 errores nuevos al medirlo) — aprobado por Javier — 2026-11-12 — Block 1
- Los 67 errores que el lint reporta sobre el código existente (21 archivos, sobre el umbral de 40 errores / 20 archivos del spec) se corrigen todos en el Block 2, sin bajar el set de reglas (opción A) — aprobado por Javier — 2026-11-12 — Block 2
