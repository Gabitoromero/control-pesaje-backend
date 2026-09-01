import { Migration } from '@mikro-orm/migrations';

export class Migration20260901145048 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "linea_produccion" add "observacion" text null;`);

    this.addSql(`alter table "pasada" add "observacion" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "linea_produccion" drop column "observacion";`);

    this.addSql(`alter table "pasada" drop column "observacion";`);
  }

}
