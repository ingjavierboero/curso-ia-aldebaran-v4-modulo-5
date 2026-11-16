import { Router, type Request, type Response } from 'express';
import type { CreateProduct } from '../../../application/product/CreateProduct.js';
import type { DeactivateProduct } from '../../../application/product/DeactivateProduct.js';
import type { ListProducts } from '../../../application/product/ListProducts.js';
import type { ReactivateProduct } from '../../../application/product/ReactivateProduct.js';
import type { UpdateProduct } from '../../../application/product/UpdateProduct.js';
import { PRODUCT_NAME_MAX_LENGTH } from '../../../domain/product/Product.js';
import { ID_MAX_LENGTH, InvalidBody, bodyObject, boundedParam, optionalString, requiredString } from '../body.js';
import { sessionContext } from '../sessionContext.js';

/** Tope de forma del precio: 9 enteros, punto y 2 decimales (`"999999999.99"`) más un margen. */
const PRICE_MAX_LENGTH = 13;
/** Tope de forma de la moneda; el valor exacto (ARS o USD) lo valida el dominio. */
const CURRENCY_MAX_LENGTH = 3;

export interface ProductsRoutesDeps {
  listProducts: Pick<ListProducts, 'execute'>;
  createProduct: Pick<CreateProduct, 'execute'>;
  updateProduct: Pick<UpdateProduct, 'execute'>;
  deactivateProduct: Pick<DeactivateProduct, 'execute'>;
  reactivateProduct: Pick<ReactivateProduct, 'execute'>;
}

/**
 * Productos (FEAT-010), con sesión obligatoria. Sin lógica de negocio: la forma del body (400) y el
 * caso de uso. El precio llega y sale como texto decimal: un número JSON es un body inválido (NFR-03).
 */
export function productsRoutes(deps: ProductsRoutesDeps): Router {
  const router = Router();

  router.get('/products', (req: Request, res: Response) => {
    const products = deps.listProducts.execute(sessionContext(req).actor);
    res.status(200).json({ products });
  });

  router.post('/products', (req: Request, res: Response) => {
    const body = bodyObject(req.body);
    const name = requiredString(body, 'name', PRODUCT_NAME_MAX_LENGTH);
    const price = requiredString(body, 'price', PRICE_MAX_LENGTH);
    const currency = requiredString(body, 'currency', CURRENCY_MAX_LENGTH);

    const product = deps.createProduct.execute(sessionContext(req).actor, { name, price, currency });
    res.status(201).json({ product });
  });

  router.patch('/products/:id', (req: Request<{ id: string }>, res: Response) => {
    const id = boundedParam(req.params.id, 'id', ID_MAX_LENGTH);
    const body = bodyObject(req.body);
    const input = {
      name: optionalString(body, 'name', PRODUCT_NAME_MAX_LENGTH),
      price: optionalString(body, 'price', PRICE_MAX_LENGTH),
      currency: optionalString(body, 'currency', CURRENCY_MAX_LENGTH),
    };
    if (Object.values(input).every((value) => value === undefined)) {
      throw new InvalidBody('Indicá al menos uno de los campos "name", "price" o "currency"');
    }

    const product = deps.updateProduct.execute(sessionContext(req).actor, id, input);
    res.status(200).json({ product });
  });

  router.post('/products/:id/deactivate', (req: Request<{ id: string }>, res: Response) => {
    const id = boundedParam(req.params.id, 'id', ID_MAX_LENGTH);
    const product = deps.deactivateProduct.execute(sessionContext(req).actor, id);
    res.status(200).json({ product });
  });

  router.post('/products/:id/reactivate', (req: Request<{ id: string }>, res: Response) => {
    const id = boundedParam(req.params.id, 'id', ID_MAX_LENGTH);
    const product = deps.reactivateProduct.execute(sessionContext(req).actor, id);
    res.status(200).json({ product });
  });

  return router;
}
