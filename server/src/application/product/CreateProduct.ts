import { assertCan } from '../../domain/auth/Authorization.js';
import { Price } from '../../domain/product/Price.js';
import { parseProductName, Product } from '../../domain/product/Product.js';
import type { Clock } from '../../domain/shared/Clock.js';
import type { Actor } from '../shared/Actor.js';
import type { IdGenerator } from '../shared/IdGenerator.js';
import { requireActor } from '../shared/requireActor.js';
import type { UnitOfWork } from '../shared/UnitOfWork.js';
import { assertUniqueProductName } from './assertUniqueProductName.js';
import { type PublicProduct, toPublicProduct } from './dto/PublicProduct.js';

export interface CreateProductDeps {
  uow: UnitOfWork;
  ids: IdGenerator;
  clock: Clock;
}

export interface CreateProductInput {
  name: string;
  /** Texto decimal con punto (`"15000.50"`), nunca un número (NFR-03). */
  price: string;
  currency: string;
}

/**
 * Alta de un producto Activo (FR-08) por un Admin o Editor (FR-19). Valida nombre, precio y moneda
 * con el dominio antes de la transacción (FR-10) y, dentro de ella, relee al actor y rechaza un nombre
 * que ya tiene otro producto sin distinguir mayúsculas (FR-11).
 */
export class CreateProduct {
  constructor(private readonly deps: CreateProductDeps) {}

  execute(actor: Actor, input: CreateProductInput): PublicProduct {
    const { uow, ids, clock } = this.deps;
    assertCan(actor.role, 'products.manage');

    const name = parseProductName(input.name);
    const price = Price.parse(input.price, input.currency);

    const created = uow.run(({ users, products }) => {
      requireActor(users, actor, 'products.manage');
      const product = Product.create({ id: ids.next(), name, price, createdAt: clock.now() });
      assertUniqueProductName(products, product);
      products.insert(product);
      return product;
    });

    return toPublicProduct(created);
  }
}
