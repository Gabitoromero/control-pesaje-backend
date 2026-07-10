import { MikroORM } from '@mikro-orm/core';

export const clearDatabase = async (orm: MikroORM) => {
  const em = orm.em.fork();
  const connection = em.getConnection();

  const tables = await connection.execute(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name != 'mikro_orm_migrations';
  `);

  if (tables.length === 0) return;

  const tableNames = tables.map((t: any) => `"${t.table_name}"`).join(', ');

  await connection.execute("SET session_replication_role = 'replica';");
  try {
    await connection.execute(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`);
  } finally {
    await connection.execute("SET session_replication_role = 'origin';");
  }
};
