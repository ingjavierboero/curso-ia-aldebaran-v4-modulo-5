# Decisions FEAT-006

- Un solo ticket pese a 19 AC (W-PRD-06), partido en 3 bloques en la spec — usuario — 2026-11-15 — DEFINE.
- R-07 aceptado: sin auditoría de cambios sobre usuarios; se revisa con más de un Admin en uso real o al construir historial/reportes (P3) — usuario — 2026-11-15 — PLAN.
- Supuestos marcados en el PRD, sin objeción del usuario: un Admin puede darse de baja o quitarse el perfil si queda otro Admin Activo; modificar nombre o email no cierra sesiones — asistente — 2026-11-15 — DEFINE.
- Revisión de PLAN (arch-auditor F1, W1–W11; impact scan 7 gaps) incorporada a la spec (loop 1): PATCH sin campos → 400 en la ruta; política del último Admin en el dominio; `Actor`; relectura del actor dentro de la transacción; `Authorization` en `domain/auth`; `client.ts` compartido; `AppLayout` — asistente — 2026-11-15 — PLAN.
- Los adaptadores Drizzle de Block 2 entraron en el commit de Block 1 para mantener el typecheck; sus tests llegaron en Block 2 con rojo demostrado por mutaciones temporales — asistente — 2026-11-15 — Block 1/2.
- Supuestos de implementación aceptados por los revisores: `assertCan` antes de validar datos en los casos de uso; `parseUserRole` estricto; baja idempotente sin borrar sesiones (ya inválidas); `ListUsers` lee fuera de la UoW; tope de 20 caracteres para `role` en la ruta; aviso de 403 por `location.state` y limpiado al mostrarse — asistente — 2026-11-15 — Blocks 1–3.
- Deuda aceptada (WARN de arch-auditor): `toPublicUser`/`requireActor` a `application/shared` cuando otro módulo los use; `listAll` con collation BINARY; header no refresca el nombre si el Admin se edita a sí mismo; botón "Usuarios" sin href; `UsersPage` con el modal adentro; helpers de test atados a clases de antd — asistente — 2026-11-15 — Blocks 1–3.
