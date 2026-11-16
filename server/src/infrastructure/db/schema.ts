import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, type SQLiteColumn, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { CLIENT_STATUSES } from '../../domain/client/Client.js';
import { ISSUER_IVA_CONDITIONS } from '../../domain/settings/IssuerIvaCondition.js';
import { IIBB_MAX_LENGTH, ISSUER_TEXT_MAX_LENGTH } from '../../domain/settings/issuerText.js';
import { POINT_OF_SALE_MAX, POINT_OF_SALE_MIN } from '../../domain/settings/PointOfSale.js';
import { IVA_CONDITIONS } from '../../domain/shared/IvaCondition.js';
import { CURRENCIES } from '../../domain/product/Price.js';
import { PRODUCT_STATUSES } from '../../domain/product/Product.js';
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

// Tokens de recuperación de contraseña (FEAT-008). El token en claro nunca se guarda.
export const passwordResetTokens = sqliteTable(
  'password_reset_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // hex SHA-256 del token (64 caracteres)
    tokenHash: text('token_hash').notNull().unique(),
    // ISO 8601
    createdAt: text('created_at').notNull(),
    // ISO 8601
    expiresAt: text('expires_at').notNull(),
    // ISO 8601; se cambió la contraseña con este token
    usedAt: text('used_at'),
    // ISO 8601; lo anuló otro token o un cambio de contraseña
    invalidatedAt: text('invalidated_at'),
  },
  (t) => [index('password_reset_tokens_user_id_idx').on(t.userId)],
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

/** `'a', 'b'` para un CHECK … IN: los valores salen de constantes del dominio, nunca de la entrada. */
const sqlList = (values: readonly (string | number)[]) =>
  sql.raw(values.map((v) => (typeof v === 'number' ? String(v) : `'${v}'`)).join(', '));

// Clientes (FEAT-010). CUIT y email de facturación únicos (NFR-01).
export const clients = sqliteTable(
  'clients',
  {
    id: text('id').primaryKey(),
    businessName: text('business_name').notNull(),
    // 11 dígitos, sin guiones
    cuit: text('cuit').notNull().unique(),
    address: text('address').notNull(),
    // ya normalizado a minúsculas por el dominio
    billingEmail: text('billing_email').notNull().unique(),
    // código de ARCA de la condición frente al IVA
    ivaCondition: integer('iva_condition').notNull(),
    status: text('status', { enum: CLIENT_STATUSES }).notNull(),
    // ISO 8601
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    check('clients_iva_condition_check', sql`${t.ivaCondition} IN (${sqlList(IVA_CONDITIONS.map((c) => c.code))})`),
    check('clients_status_check', sql`${t.status} IN (${sqlList(CLIENT_STATUSES)})`),
  ],
);

// Productos (FEAT-010). Nombre único sin distinguir mayúsculas (FR-11); precio en centavos (NFR-03).
export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    // trim + NFC + minúsculas, derivado del nombre por el dominio
    nameNormalized: text('name_normalized').notNull().unique(),
    priceCents: integer('price_cents').notNull(),
    currency: text('currency', { enum: CURRENCIES }).notNull(),
    status: text('status', { enum: PRODUCT_STATUSES }).notNull(),
    // ISO 8601
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    check('products_price_cents_check', sql`${t.priceCents} > 0`),
    check('products_currency_check', sql`${t.currency} IN (${sqlList(CURRENCIES)})`),
    check('products_status_check', sql`${t.status} IN (${sqlList(PRODUCT_STATUSES)})`),
  ],
);

// Asignaciones cliente ↔ producto (FEAT-010). Sin ON DELETE: no se borran clientes ni productos.
export const clientProducts = sqliteTable(
  'client_products',
  {
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    // ISO 8601
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.clientId, t.productId] }),
    index('client_products_product_id_idx').on(t.productId),
  ],
);

/** `length(col) BETWEEN 1 AND max`: el dominio guarda los textos ya recortados. */
const lengthBetween = (column: SQLiteColumn, max: number) => sql`length(${column}) BETWEEN 1 AND ${sql.raw(String(max))}`;

// Configuración del sistema (FEAT-011, ADR-008): una sola fila (id = 1), una columna por valor. La
// fila se crea en el primer guardado; sin fila, el dominio da los valores por defecto. Los CHECK
// salen de las constantes del dominio (NFR-02).
export const settings = sqliteTable(
  'settings',
  {
    id: integer('id').primaryKey(),
    // HH:MM entre 00:00 y 23:59; sin default: la fuente del valor por defecto es el dominio
    billingHour: text('billing_hour').notNull(),
    pointOfSale: integer('point_of_sale'),
    issuerLegalName: text('issuer_legal_name'),
    issuerAddress: text('issuer_address'),
    // código de ARCA de la condición frente al IVA de la empresa emisora
    issuerIvaCondition: integer('issuer_iva_condition'),
    issuerIibb: text('issuer_iibb'),
    // YYYY-MM-DD
    issuerActivityStart: text('issuer_activity_start'),
    issuerTradeName: text('issuer_trade_name'),
    // ISO 8601
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    check('settings_single_row_check', sql`${t.id} = 1`),
    check(
      'settings_billing_hour_check',
      sql`${t.billingHour} GLOB '[0-2][0-9]:[0-5][0-9]' AND ${t.billingHour} <= '23:59'`,
    ),
    check(
      'settings_point_of_sale_check',
      sql`${t.pointOfSale} BETWEEN ${sql.raw(String(POINT_OF_SALE_MIN))} AND ${sql.raw(String(POINT_OF_SALE_MAX))}`,
    ),
    check('settings_issuer_legal_name_check', lengthBetween(t.issuerLegalName, ISSUER_TEXT_MAX_LENGTH)),
    check('settings_issuer_address_check', lengthBetween(t.issuerAddress, ISSUER_TEXT_MAX_LENGTH)),
    check(
      'settings_issuer_iva_condition_check',
      sql`${t.issuerIvaCondition} IN (${sqlList(ISSUER_IVA_CONDITIONS.map((c) => c.code))})`,
    ),
    check('settings_issuer_iibb_check', lengthBetween(t.issuerIibb, IIBB_MAX_LENGTH)),
    check(
      'settings_issuer_activity_start_check',
      sql`${t.issuerActivityStart} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check('settings_issuer_trade_name_check', lengthBetween(t.issuerTradeName, ISSUER_TEXT_MAX_LENGTH)),
  ],
);

export const schema = { users, sessions, jobRuns, passwordResetTokens, clients, products, clientProducts, settings };
