import { Migration } from '@mikro-orm/migrations';

export class Migration20260713145225 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "dispositivo" add constraint "dispositivo_nombre_unique" unique ("nombre");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "dispositivo" drop constraint "dispositivo_nombre_unique";`);
  }

}
