# ADR-003: Repositorios síncronos y UnitOfWork con transacción IMMEDIATE

| Field | Value |
|-------|-------|
| Date | 2026-11-04 |
| Ticket | FEAT-001 |
| Status | Accepted |

## Context
El registro del primer Admin (FR-05/FR-06 de FEAT-001) solo vale mientras no existe ningún usuario; dos solicitudes simultáneas no podían terminar creando dos Admin (R-04 del threat model). better-sqlite3 es síncrono y su `transaction()` rechaza funciones que devuelven una Promise, mientras que el hash de argon2id es asíncrono. La auditoría de arquitectura del PLAN marcó además que el caso de uso no podía pedir una transacción sin importar infraestructura.

## Options considered

### Option 1: puertos de repositorio síncronos + puerto `UnitOfWork` síncrono en application, adaptador con `transaction(..., { behavior: 'immediate' })`; hash fuera de la transacción
- **Pros:** la regla de la carrera es verificable (count + insert sin `await` en medio); la capa application no depende de Drizzle; `IMMEDIATE` toma el lock de escritura al empezar, así la segunda transacción ve el usuario ya insertado.
- **Cons:** los puertos quedan atados a un motor síncrono; migrar a una base asíncrona cambiaría las interfaces.

### Option 2: puertos asíncronos y confiar en el índice UNIQUE del email
- **Pros:** interfaces neutrales respecto del motor.
- **Cons:** dos registros con emails distintos pasan ambos el UNIQUE y crean dos Admin; no resuelve R-04.

### Option 3: un flag "setup completo" en una tabla aparte con UPDATE condicional
- **Pros:** atómico sin transacción explícita.
- **Cons:** un estado más que mantener sincronizado con `users`; duplica la verdad de "existe algún usuario".

## Decision
Se eligió la opción 1: es la única de las tres que garantiza un solo Admin frente a emails distintos sin agregar estado redundante, y respeta la regla de dependencias de DDD de `AGENTS.md`.

## Consequences
- `server/src/application/shared/UnitOfWork.ts` (puerto) y `server/src/infrastructure/db/DrizzleUnitOfWork.ts` (adaptador).
- `UserRepository` y `SessionRepository` son síncronos; `PasswordHasher` sigue asíncrono.
- `RegisterFirstAdmin` hashea antes de abrir la transacción y verifica `countAll()` dos veces (antes del hash y dentro de la transacción).
- Test de carrera en `server/test/http/setup.test.ts`: dos POST simultáneos → un 201, un 409, un usuario.
