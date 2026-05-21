import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MikroORM } from '@mikro-orm/core';
import type { PostgreSqlDriver } from '@mikro-orm/postgresql';
import config from '../mikro-orm.config';
import { initApp } from './app';

describe('API Health Check', () => {
  let orm: MikroORM<PostgreSqlDriver>;
  let app: any;

  beforeAll(async () => {
    // We use a simplified config for tests if needed, or just the default one.
    // For this basic test, we just need to ensure the app initializes.
    orm = await MikroORM.init<PostgreSqlDriver>({
      ...config,
      dbName: 'control_pesaje_test', // Use a test DB
      allowGlobalContext: true,
      connect: false, // Don't actually connect to the DB for this simple health check test
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
