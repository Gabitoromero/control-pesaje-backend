import { Migration } from '@mikro-orm/migrations';

export class Migration20261113100000 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "atributo_etapa_ruta" ("id" serial primary key, "ruta_pasada_etapa_id" int not null, "nombre" varchar(100) not null, "tipo" varchar(10) not null, "minimo" decimal(12,4) not null, "maximo" decimal(12,4) not null, "activo" boolean not null default true);`);
    this.addSql(`create index "atributo_etapa_ruta_ruta_pasada_etapa_id_index" on "atributo_etapa_ruta" ("ruta_pasada_etapa_id");`);
    this.addSql(`create table "valor_atributo" ("id" serial primary key, "pasada_id" int not null, "etapa_id" int not null, "atributo_id" int not null, "usuario_id" int not null, "valor" decimal(12,4) not null, "timestamp" timestamptz not null, "nombre" varchar(100) not null, "tipo" varchar(10) not null, "minimo" decimal(12,4) not null, "maximo" decimal(12,4) not null, "estado_validacion" varchar(20) not null, "activo" boolean not null default true);`);
    this.addSql(`create index "valor_atributo_pasada_id_etapa_id_index" on "valor_atributo" ("pasada_id", "etapa_id");`);
    this.addSql(`alter table "valor_atributo" add constraint "valor_atributo_pasada_id_atributo_id_unique" unique ("pasada_id", "atributo_id");`);
    this.addSql(`alter table "atributo_etapa_ruta" add constraint "atributo_etapa_ruta_ruta_pasada_etapa_id_foreign" foreign key ("ruta_pasada_etapa_id") references "ruta_pasada_etapa" ("id") on delete restrict;`);
    this.addSql(`alter table "atributo_etapa_ruta" add constraint "atributo_etapa_ruta_tipo_check" check ("tipo" in ('numerico', 'aceptado'));`);
    this.addSql(`alter table "valor_atributo" add constraint "valor_atributo_pasada_id_foreign" foreign key ("pasada_id") references "pasada" ("id") on delete restrict;`);
    this.addSql(`alter table "valor_atributo" add constraint "valor_atributo_etapa_id_foreign" foreign key ("etapa_id") references "etapa" ("id") on delete restrict;`);
    this.addSql(`alter table "valor_atributo" add constraint "valor_atributo_atributo_id_foreign" foreign key ("atributo_id") references "atributo_etapa_ruta" ("id") on delete restrict;`);
    this.addSql(`alter table "valor_atributo" add constraint "valor_atributo_usuario_id_foreign" foreign key ("usuario_id") references "usuario" ("id") on delete restrict;`);
    this.addSql(`alter table "valor_atributo" add constraint "valor_atributo_tipo_check" check ("tipo" in ('numerico', 'aceptado'));`);
    this.addSql(`alter table "valor_atributo" add constraint "valor_atributo_estado_validacion_check" check ("estado_validacion" in ('ok', 'fuera_de_rango'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "valor_atributo" cascade;`);
    this.addSql(`drop table if exists "atributo_etapa_ruta" cascade;`);
  }

}
