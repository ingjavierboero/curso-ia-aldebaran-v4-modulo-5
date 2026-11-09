import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const USER_ROLES = ['admin', 'editor', 'consulta'] as const;
export const USER_STATUSES = ['activo', 'inactivo'] as const;

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    // ya normalizado a minúsculas por el dominio
    email: text('email').notNull().unique(),
    role: text('role', { enum: USER_ROLES }).notNull(),
    status: text('status', { enum: USER_STATUSES }).notNull().default('activo'),
    passwordHash: text('password_hash').notNull(),
    // ISO 8601
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    check('users_role_check', sql`${t.role} IN ('admin', 'editor', 'consulta')`),
    check('users_status_check', sql`${t.status} IN ('activo', 'inactivo')`),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // hex SHA-256 del token; el token en claro nunca se guarda
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: text('created_at').notNull(),
    lastActivityAt: text('last_activity_at').notNull(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const schema = { users, sessions };
