import { Migration } from '@mikro-orm/migrations';

export class Migration20260929133253 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "config_sistema" ("id" int not null default 1, "tolerancia_pct" decimal(8,2) not null, "updated_at" timestamptz not null, "updated_by_usuario_id" int null, primary key ("id"));`);

    this.addSql(`alter table "config_sistema" add constraint "config_sistema_updated_by_usuario_id_foreign" foreign key ("updated_by_usuario_id") references "usuario" ("id") on delete restrict;`);

    // Seed the singleton row with the previous hardcoded default (20%).
    // Idempotent: re-running never overwrites an admin-edited value.
    // updated_by_usuario_id stays NULL ("initial system value").
    this.addSql(`insert into "config_sistema" ("id", "tolerancia_pct", "updated_at", "updated_by_usuario_id") values (1, 20, now(), null) on conflict ("id") do nothing;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "config_sistema" cascade;`);
  }

}
