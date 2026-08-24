import { Migration } from '@mikro-orm/migrations';

export class Migration20260824172250 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "dispositivo" add "unidad" varchar(10) null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "dispositivo" drop column "unidad";`);
  }

}
