import { defineConfig } from '@mikro-orm/postgresql';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import dotenv from 'dotenv';

dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.DB_PASSWORD) {
  throw new Error('DB_PASSWORD environment variable is required in production');
}

export default defineConfig({
  driver: PostgreSqlDriver,
  dbName: process.env.DB_NAME || 'control_pesaje',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433', 10),
  user: process.env.DB_USER || 'pesaje_admin',
  password: process.env.DB_PASSWORD || 'balanzas_control_2026_pwd!',
  entities: ['./dist/src/models/**/*.js'],
  entitiesTs: ['./src/models/**/*.ts'],
  debug: process.env.NODE_ENV !== 'production',
  discovery: {
    warnWhenNoEntities: false,
  },
  extensions: [Migrator],
  migrations: {
    path: './dist/src/migrations',
    pathTs: './src/migrations',
  },
});
