import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MikroORM } from '@mikro-orm/postgresql';
import type { PostgreSqlDriver } from '@mikro-orm/postgresql';
import config from '../mikro-orm.config.js';
import { initApp } from './app.js';
import {
  Usuario,
  LineaProduccion,
  Articulo,
  Etapa,
  RutaPasadaEtapa
} from './models/index.js';

describe('API Health Check', () => {
  let orm: MikroORM;
  let app: any;

  beforeAll(async () => {
    // We use a simplified config for tests if needed, or just the default one.
    // For this basic test, we just need to ensure the app initializes.
    orm = await MikroORM.init({
      ...config,
      dbName: 'control_pesaje_test', // Use a test DB
      entities: [
        Usuario,
        LineaProduccion,
        Articulo,
        Etapa,
        RutaPasadaEtapa
      ],
      entitiesTs: [],
      allowGlobalContext: true,
    });
    app = await initApp(orm);
  });

  afterAll(async () => {
    await orm.close();
  });

  it('should return 200 and status ok from /health', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
  });
});

describe('CORS', () => {
  const originalAllowedOrigin = process.env.ALLOWED_ORIGIN;
  let orm: MikroORM;

  afterAll(async () => {
    process.env.ALLOWED_ORIGIN = originalAllowedOrigin;
    await orm.close();
  });

  it('reflects only the configured ALLOWED_ORIGIN, not an arbitrary origin', async () => {
    process.env.ALLOWED_ORIGIN = 'http://trusted.example.com';
    orm = await MikroORM.init({
      ...config,
      dbName: 'control_pesaje_test',
      entities: [Usuario, LineaProduccion, Articulo, Etapa, RutaPasadaEtapa],
      entitiesTs: [],
      allowGlobalContext: true,
    });
    const app = await initApp(orm);

    const trusted = await request(app).get('/health').set('Origin', 'http://trusted.example.com');
    const untrusted = await request(app).get('/health').set('Origin', 'http://evil.example.com');

    expect(trusted.headers['access-control-allow-origin']).toBe('http://trusted.example.com');
    expect(untrusted.headers['access-control-allow-origin']).toBeUndefined();
  });
});
