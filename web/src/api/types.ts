/** Perfil de un usuario (FEAT-006): define lo que puede hacer. */
export type UserRole = 'admin' | 'editor' | 'consulta';

/** Estado de un usuario: un Inactivo no inicia sesión. */
export type UserStatus = 'activo' | 'inactivo';

/** Lo único que el server devuelve de un usuario (FR-08). Lo comparten `api/` y `store/`. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

/** Body de `POST /api/users`: el usuario queda Activo. */
export interface CreateUserInput {
  name: string;
  email: string;
  role: UserRole;
  password: string;
}

/** Body de `PATCH /api/users/:id`: al menos uno de los campos. */
export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
}

/** Estado de un cliente o de un producto (FEAT-010). */
export type CatalogStatus = 'activo' | 'inactivo';

/** Moneda del precio de un producto. */
export type Currency = 'ARS' | 'USD';

/** Condición frente al IVA, como la devuelve el server: código de ARCA y nombre. */
export interface IvaCondition {
  code: number;
  name: string;
}

/** Lo que el server devuelve de un cliente (`toPublicClient`). */
export interface Client {
  id: string;
  businessName: string;
  cuit: string;
  address: string;
  billingEmail: string;
  ivaCondition: IvaCondition;
  status: CatalogStatus;
  createdAt: string;
}

/**
 * Lo que el server devuelve de un producto (`toPublicProduct`). El precio es texto con punto y 2
 * decimales (`"15000.50"`): nunca pasa por un número (NFR-03).
 */
export interface Product {
  id: string;
  name: string;
  price: string;
  currency: Currency;
  status: CatalogStatus;
  createdAt: string;
}

/** Detalle de un cliente (`GET /api/clients/:id`): sus datos y los productos asignados. */
export interface ClientDetail extends Client {
  products: Product[];
}

/** Body de `POST /api/clients`: el cliente queda Activo. */
export interface CreateClientInput {
  businessName: string;
  cuit: string;
  address: string;
  billingEmail: string;
  ivaCondition: number;
}

/** Body de `PATCH /api/clients/:id`: al menos uno de los campos. */
export type UpdateClientInput = Partial<CreateClientInput>;

/** Body de `POST /api/products`: precio como texto con punto decimal. */
export interface CreateProductInput {
  name: string;
  price: string;
  currency: Currency;
}

/** Body de `PATCH /api/products/:id`: al menos uno de los campos. */
export type UpdateProductInput = Partial<CreateProductInput>;

/** Dato obligatorio de la configuración de facturación, como lo nombra el server (FR-10, W4). */
export type RequiredBillingSetting =
  | 'issuerLegalName'
  | 'issuerAddress'
  | 'issuerIvaCondition'
  | 'issuerIibb'
  | 'issuerActivityStartDate'
  | 'pointOfSale';

/**
 * Lo que el server devuelve de la configuración de facturación (`GET` y `PATCH /api/settings/billing`,
 * FEAT-011), sin envoltorio. Un dato no cargado llega como `null`; la fecha de inicio, como `YYYY-MM-DD`.
 */
export interface BillingSettings {
  billingHour: string;
  pointOfSale: number | null;
  issuer: {
    legalName: string | null;
    address: string | null;
    ivaCondition: IvaCondition | null;
    iibb: string | null;
    activityStartDate: string | null;
    tradeName: string | null;
  };
  /** Obligatorios vacíos, en el orden del server, con el nombre con que se muestran (FR-11). */
  missing: { field: RequiredBillingSetting; label: string }[];
  /** Fecha del último guardado; la pantalla no la muestra. */
  updatedAt: string | null;
}

/**
 * Body de `PATCH /api/settings/billing`: solo los campos cambiados, al menos uno. No hay forma de
 * vaciar un dato ya guardado, así que ningún campo admite `null`.
 */
export interface UpdateBillingSettingsInput {
  billingHour?: string;
  pointOfSale?: number;
  issuer?: {
    legalName?: string;
    address?: string;
    ivaCondition?: number;
    iibb?: string;
    activityStartDate?: string;
    tradeName?: string;
  };
}

/** Estado de un proceso automático, tal como lo informa `GET /api/health` a un usuario con sesión. */
export interface HealthJob {
  name: string;
  lastRunAt: string | null;
  lastOutcome: 'ok' | 'error' | null;
  late: boolean;
  /** No se pudieron leer sus corridas: está degradado aunque la base responda. */
  readFailed: boolean;
}

/**
 * Respuesta de `GET /api/health` (200 u 503). Sin sesión válida, o con la base caída, llega solo
 * `status`; con sesión llegan además `db` y `jobs`.
 */
export interface HealthResponse {
  status: 'ok' | 'degradado';
  db?: 'disponible' | 'no_disponible';
  jobs?: HealthJob[];
}
