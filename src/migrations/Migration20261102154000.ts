import { Migration } from '@mikro-orm/migrations';

export class Migration20261102154000 extends Migration {

  override up(): void | Promise<void> {
    // Existing balanzas have no history: they start with verification pending and no last article.
    this.addSql(`alter table "balanza" add "verificacion_pendiente" boolean not null default true, add "ultimo_articulo_id" int null;`);
    this.addSql(`alter table "balanza" add constraint "balanza_ultimo_articulo_id_foreign" foreign key ("ultimo_articulo_id") references "articulo" ("id") on delete restrict;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "balanza" drop constraint "balanza_ultimo_articulo_id_foreign";`);
    this.addSql(`alter table "balanza" drop column "verificacion_pendiente", drop column "ultimo_articulo_id";`);
  }

}
