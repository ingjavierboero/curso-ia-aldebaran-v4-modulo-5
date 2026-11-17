# Test run FEAT-016

| Field | Value |
|---|---|
| Runner | vitest 5.1.0 (node 24.11.0) |
| Command | `npm test` (suite completa) y `npx vitest run --project server server/test/domain/DuplicatePaymentPolicy.test.ts --coverage --coverage.include='**/DuplicatePaymentPolicy.ts'` (cobertura del archivo nuevo) |
| Total | 719 |
| Passed | 719 |
| Failed | 0 |
| Skipped | 0 |
| Line coverage | 100% |
| Branch coverage | 94.87% |
| Function coverage | 100% |
| Coverage floor | 80% (method default — .daw/rules/testing.instructions.md) |
| Lint | `npm run lint` (`oxlint --type-aware`) — clean, 0 errors; `npm run typecheck` (`tsc -b`) — clean, 0 errors |

La cobertura es la de `server/src/domain/payment/DuplicatePaymentPolicy.ts`, el único archivo de
código nuevo del ticket (statements 97.56%). Los 5 tests de la spec están en
`server/test/domain/DuplicatePaymentPolicy.test.ts`.

## Failures
(none)

## Skips
(none)
