import { Migration } from '@mikro-orm/migrations';

export class Migration20261028115157 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "ruta_pasada_etapa" add "tolerancia_por_defecto" boolean not null default true, add "tolerancia_pct" decimal(5,2) null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "ruta_pasada_etapa" drop column "tolerancia_por_defecto", drop column "tolerancia_pct";`);
  }

}
