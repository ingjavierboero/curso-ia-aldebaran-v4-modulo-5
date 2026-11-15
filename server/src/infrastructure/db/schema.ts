import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { USER_ROLES, USER_STATUSES } from '../../domain/user/User.js';

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

export const JOB_RUN_OUTCOMES = ['ok', 'error'] as const;

// Corridas de procesos automáticos (FEAT-003). No guarda el mensaje de error (R-07).
export const jobRuns = sqliteTable(
  'job_runs',
  {
    id: text('id').primaryKey(),
    jobName: text('job_name').notNull(),
    // ISO 8601
    startedAt: text('started_at').notNull(),
    // ISO 8601
    finishedAt: text('finished_at').notNull(),
    outcome: text('outcome', { enum: JOB_RUN_OUTCOMES }).notNull(),
  },
  (t) => [
    check('job_runs_outcome_check', sql`${t.outcome} IN ('ok', 'error')`),
    index('job_runs_job_outcome_finished_idx').on(t.jobName, t.outcome, t.finishedAt),
  ],
);

export const schema = { users, sessions, jobRuns };
