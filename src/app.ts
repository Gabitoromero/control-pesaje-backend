import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import type { PostgreSqlDriver, SqlEntityManager } from '@mikro-orm/postgresql';
import apiRouter from './routes/index.js';

export const initApp = async (orm: MikroORM<PostgreSqlDriver>): Promise<Express> => {
  const app = express();

  app.use(express.json());
  app.use(cors());

  // MikroORM RequestContext middleware — must come before routes
  app.use((_req, _res, next) => {
    RequestContext.create(orm.em as unknown as SqlEntityManager, next);
  });

  // Health check endpoint (no auth required)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
  });

  // API routes
  app.use('/api', apiRouter);

  // Global error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  });

  return app;
};
