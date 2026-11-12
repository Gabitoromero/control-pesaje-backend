import { Migration } from '@mikro-orm/migrations';

export class Migration20261112130000 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "historial_cambio" ("id" serial primary key, "entidad" varchar(30) not null, "entidad_id" int not null, "raiz_tipo" varchar(30) not null, "raiz_id" int not null, "accion" varchar(15) not null, "usuario_id" int null, "fecha" timestamptz not null default now(), "antes" jsonb not null default '{}', "despues" jsonb not null default '{}');`);
    this.addSql(`create index "historial_cambio_raiz_tipo_raiz_id_fecha_index" on "historial_cambio" ("raiz_tipo", "raiz_id", "fecha");`);
    this.addSql(`create index "historial_cambio_usuario_id_index" on "historial_cambio" ("usuario_id");`);
    this.addSql(`alter table "historial_cambio" add constraint "historial_cambio_usuario_id_foreign" foreign key ("usuario_id") references "usuario" ("id") on update cascade on delete restrict;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "historial_cambio" cascade;`);
  }

}
