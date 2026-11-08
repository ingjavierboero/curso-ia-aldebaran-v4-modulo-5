import type { NextFunction, Request, Response } from 'express';

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

/**
 * R-07: rechaza con 415 toda escritura (POST/PUT/PATCH) sin `Content-Type: application/json`.
 * Un formulario cross-site no puede mandar ese tipo sin preflight. Se compara el media type del
 * header (no `req.is`, que devuelve `null` cuando la solicitud no trae body).
 */
export function requireJson(req: Request, res: Response, next: NextFunction): void {
  if (!METHODS_WITH_BODY.has(req.method)) {
    next();
    return;
  }
  const mediaType = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    res.status(415).json({ error: 'Content-Type debe ser application/json' });
    return;
  }
  next();
}
