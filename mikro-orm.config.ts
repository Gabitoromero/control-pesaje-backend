import { defineConfig } from '@mikro-orm/postgresql';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  driver: PostgreSqlDriver,
  dbName: process.env.DB_NAME || 'control_pesaje',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433', 10),
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'admin',
  entities: ['./dist/models/**/*.js'],
  entitiesTs: ['./src/models/**/*.ts'],
  debug: process.env.NODE_ENV !== 'production',
  discovery: {
    warnWhenNoEntities: false,
    allowNoEntities: true,
  },
  extensions: [Migrator],
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
  },
});
