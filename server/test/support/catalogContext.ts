import { AssignProducts } from '../../src/application/client/AssignProducts.js';
import { CreateClient } from '../../src/application/client/CreateClient.js';
import { DeactivateClient } from '../../src/application/client/DeactivateClient.js';
import { GetClient } from '../../src/application/client/GetClient.js';
import { ListClients } from '../../src/application/client/ListClients.js';
import { ReactivateClient } from '../../src/application/client/ReactivateClient.js';
import { UnassignProduct } from '../../src/application/client/UnassignProduct.js';
import { UpdateClient } from '../../src/application/client/UpdateClient.js';
import { CreateProduct } from '../../src/application/product/CreateProduct.js';
import { DeactivateProduct } from '../../src/application/product/DeactivateProduct.js';
import { ListProducts } from '../../src/application/product/ListProducts.js';
import { ReactivateProduct } from '../../src/application/product/ReactivateProduct.js';
import { UpdateProduct } from '../../src/application/product/UpdateProduct.js';
import { Client, type ClientStatus } from '../../src/domain/client/Client.js';
import { Cuit } from '../../src/domain/client/Cuit.js';
import { IvaCondition } from '../../src/domain/client/IvaCondition.js';
import { Price } from '../../src/domain/product/Price.js';
import { Product, type ProductStatus } from '../../src/domain/product/Product.js';
import { Email } from '../../src/domain/shared/Email.js';
import { User, type UserRole } from '../../src/domain/user/User.js';
import { FakeClock } from './FakeClock.js';
import { InMemoryClientProductRepository } from './InMemoryClientProductRepository.js';
import { InMemoryClientRepository } from './InMemoryClientRepository.js';
import { InMemoryProductRepository } from './InMemoryProductRepository.js';
import { InMemorySessionRepository } from './InMemorySessionRepository.js';
import { InMemoryUnitOfWork } from './InMemoryUnitOfWork.js';
import { InMemoryUserRepository } from './InMemoryUserRepository.js';
import { SequentialIdGenerator } from './SequentialIdGenerator.js';

/** CUIT válidos (prefijo admitido y dígito verificador correcto) para sembrar clientes. */
export const CUITS = {
  losAndes: '30711111111',
  delSur: '20111111112',
  norte: '27222222228',
} as const;

const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/**
 * `count` CUIT válidos y distintos, de prefijo 30, para sembrar volumen. Saltea las bases que no
 * tienen dígito verificador (resto 10). Siempre los mismos, en el mismo orden.
 */
export function cuitsFor(count: number): string[] {
  const result: string[] = [];
  for (let n = 10_000_000; result.length < count; n++) {
    const base = `30${String(n)}`;
    const sum = CUIT_WEIGHTS.reduce((acc, weight, i) => acc + Number(base[i]) * weight, 0);
    const dv = 11 - (sum % 11);
    if (dv === 10) continue;
    result.push(`${base}${String(dv === 11 ? 0 : dv)}`);
  }
  return result;
}

export interface SeedClientOptions {
  id?: string;
  businessName?: string;
  cuit?: string;
  address?: string;
  billingEmail?: string;
  ivaCondition?: number;
  status?: ClientStatus;
}

export interface SeedProductOptions {
  id?: string;
  name?: string;
  price?: string;
  currency?: string;
  status?: ProductStatus;
}

/**
 * Arma los casos de uso de clientes y productos sobre dobles en memoria, sin base ni HTTP. Siembra un
 * usuario Activo de cada perfil: `admin`, `editor` y `consulta`.
 */
export function createCatalogContext() {
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const clients = new InMemoryClientRepository();
  const products = new InMemoryProductRepository();
  const clientProducts = new InMemoryClientProductRepository();
  const uow = new InMemoryUnitOfWork({ users, sessions, clients, products, clientProducts });
  const clock = new FakeClock();
  const ids = new SequentialIdGenerator();

  function seedUser(id: string, role: UserRole): User {
    const user = new User({
      id,
      name: `Usuario ${role}`,
      email: Email.create(`${role}@empresa.com`),
      role,
      status: 'activo',
      passwordHash: 'hashed:contraseña-segura',
      createdAt: clock.now(),
    });
    users.insert(user);
    return user;
  }

  const admin = seedUser('u-admin', 'admin');
  const editor = seedUser('u-editor', 'editor');
  const consulta = seedUser('u-consulta', 'consulta');

  let seeded = 0;

  function seedClient(options: SeedClientOptions = {}): Client {
    seeded += 1;
    const client = new Client({
      id: options.id ?? `c-seed-${String(seeded)}`,
      businessName: options.businessName ?? 'Los Andes S.A.',
      cuit: Cuit.parse(options.cuit ?? CUITS.losAndes),
      address: options.address ?? 'Av. Siempre Viva 742',
      billingEmail: Email.create(options.billingEmail ?? 'pagos@losandes.com'),
      ivaCondition: IvaCondition.of(options.ivaCondition ?? 1),
      status: options.status ?? 'activo',
      createdAt: clock.now(),
    });
    clients.insert(client);
    return client;
  }

  function seedProduct(options: SeedProductOptions = {}): Product {
    seeded += 1;
    const product = new Product({
      id: options.id ?? `p-seed-${String(seeded)}`,
      name: options.name ?? 'Sistema de Turnos',
      price: Price.parse(options.price ?? '15000.50', options.currency ?? 'ARS'),
      status: options.status ?? 'activo',
      createdAt: clock.now(),
    });
    products.insert(product);
    return product;
  }

  return {
    users,
    clients,
    products,
    clientProducts,
    uow,
    clock,
    ids,
    admin,
    editor,
    consulta,
    seedClient,
    seedProduct,
    createClient: new CreateClient({ uow, ids, clock }),
    updateClient: new UpdateClient({ uow }),
    deactivateClient: new DeactivateClient({ uow }),
    reactivateClient: new ReactivateClient({ uow }),
    listClients: new ListClients({ clients }),
    getClient: new GetClient({ clients, products, clientProducts }),
    assignProducts: new AssignProducts({ uow, clock }),
    unassignProduct: new UnassignProduct({ uow }),
    createProduct: new CreateProduct({ uow, ids, clock }),
    updateProduct: new UpdateProduct({ uow }),
    deactivateProduct: new DeactivateProduct({ uow }),
    reactivateProduct: new ReactivateProduct({ uow }),
    listProducts: new ListProducts({ products }),
  };
}

export type CatalogContext = ReturnType<typeof createCatalogContext>;
