import { Migration } from '@mikro-orm/migrations';

export class Migration20261028170000 extends Migration {

  override up(): void | Promise<void> {
    // No index existed on muestra.usuario_id. Composite index for "muestras of a user in a date range".
    this.addSql(`create index if not exists "muestra_usuario_id_timestamp_index" on "muestra" ("usuario_id", "timestamp");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index if exists "muestra_usuario_id_timestamp_index";`);
  }

}
