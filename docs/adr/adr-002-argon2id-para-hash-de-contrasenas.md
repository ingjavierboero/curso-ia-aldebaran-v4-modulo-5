# ADR-002: argon2id (@node-rs/argon2) para el hash de contraseñas

| Field | Value |
|-------|-------|
| Date | 2026-11-04 |
| Ticket | FEAT-001 |
| Status | Accepted |

## Context
NFR-01 de FEAT-001 (RNF-09 del `PRD.md`) admite bcrypt con costo ≥ 12 o argon2id. Había que elegir algoritmo y librería para Node 24.

## Options considered

### Option 1: argon2id con `@node-rs/argon2`
- **Pros:** algoritmo recomendado por OWASP, resistente a GPU por su costo de memoria; binarios precompilados (Rust/napi), sin compilación nativa al instalar; API asíncrona que no bloquea el event loop; sin límite de 72 bytes en la contraseña.
- **Cons:** dependencia nativa por plataforma; el costo de memoria (19 MiB por hash) suma bajo concurrencia.

### Option 2: bcrypt (`bcryptjs`, costo 12)
- **Pros:** JavaScript puro, sin binarios; muy difundido.
- **Cons:** trunca la contraseña a 72 bytes (la política admite hasta 1024); sin costo de memoria, más débil frente a GPU; la versión pura JS es más lenta para el mismo nivel de seguridad.

### Option 3: argon2 con el paquete `argon2` (node-gyp)
- **Pros:** argon2id, librería madura.
- **Cons:** requiere toolchain de compilación en algunas plataformas, lo que complica la instalación del evaluador.

## Decision
Se eligió la opción 1: cumple NFR-01 con el algoritmo más fuerte de los admitidos, no trunca contraseñas largas y se instala sin compilar, que importa para que un evaluador levante el proyecto.

## Consequences
- `server/src/infrastructure/auth/Argon2PasswordHasher.ts` con parámetros de producción memoria 19456 KiB, t=2, p=1, inyectables para tests.
- Nueva dependencia `@node-rs/argon2` en `server/package.json`, fuera de la lista de `AGENTS.md` → Stack (aprobada por el usuario).
- Cada login consume ~19 MiB y decenas de ms de CPU; es el vector de DoS R-03 del threat model.
