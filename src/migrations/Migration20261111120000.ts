import { Migration } from '@mikro-orm/migrations';

export class Migration20261111120000 extends Migration {

  override up(): void | Promise<void> {
    // Existing rows take the default, so every ruta-etapa already configured stays in 'peso'.
    this.addSql(`alter table "ruta_pasada_etapa" add "magnitud" varchar(10) not null default 'peso';`);
    this.addSql(`alter table "ruta_pasada_etapa" add constraint "ruta_pasada_etapa_magnitud_check" check ("magnitud" in ('peso', 'volumen'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "ruta_pasada_etapa" drop constraint "ruta_pasada_etapa_magnitud_check";`);
    this.addSql(`alter table "ruta_pasada_etapa" drop column "magnitud";`);
  }

}
