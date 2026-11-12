import http from 'node:http';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../mikro-orm.config.js';
import { initApp } from './app.js';
import { initSocket } from './socket/index.js';
import { AuditSubscriber } from './audit/audit.subscriber.js';
import dotenv from 'dotenv';

dotenv.config();

const port = process.env.PORT || 3000;

const bootstrap = async () => {
  try {
    const orm = await MikroORM.init(config);
    // Registered here (not in the shared config) so schema-limited integration tests are unaffected.
    orm.em.getEventManager().registerSubscriber(new AuditSubscriber());

    // Sync schema in dev (optional, migrations are preferred for prod)
    // await orm.getSchemaGenerator().updateSchema();

    const app = await initApp(orm);

    const httpServer = http.createServer(app);
    initSocket(httpServer, orm);
    httpServer.listen(port, () => {
      console.log(`[server]: Server is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('[server]: Failed to start server', error);
    process.exit(1);
  }
};

bootstrap();
