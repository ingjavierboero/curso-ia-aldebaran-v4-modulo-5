import express, { type Express, type NextFunction, type Request, type Response } from 'express';

/** Dependencias de la app. Block 4 agrega casos de uso, Clock y logger. */
export type AppDeps = Record<string, never>;

function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

export function createApp(_deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(express.json({ limit: '10kb' }));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'No encontrado' });
  });

  return app;
}
