import express, { Express } from 'express';
import cors from 'cors';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import type { PostgreSqlDriver, SqlEntityManager } from '@mikro-orm/postgresql';

export const initApp = async (orm: MikroORM<PostgreSqlDriver>): Promise<Express> => {
  const app = express();

  app.use(express.json());
  app.use(cors());

  // MikroORM RequestContext middleware
  app.use((_req, _res, next) => {
    RequestContext.create(orm.em as unknown as SqlEntityManager, next);
  });

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
  });

  return app;
};
