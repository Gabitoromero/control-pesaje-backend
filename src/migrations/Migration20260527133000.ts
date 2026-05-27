import { Migration } from '@mikro-orm/migrations';

export class Migration20260527133000 extends Migration {
  async up(): Promise<void> {
    this.addSql('create type "pasada_estado_enum" as enum (\'en_curso\', \'completa\', \'abortada\');');
    this.addSql('create type "muestra_estado_validacion_enum" as enum (\'ok\', \'fuera_de_rango\');');

    this.addSql('create table "pasada" ("id" serial primary key, "linea_produccion_id" int not null, "articulo_id" int not null, "marca_id" int null, "usuario_id" int not null, "numero" int not null, "estado" "pasada_estado_enum" not null default \'en_curso\', "motivo_cierre" text null, "hora_inicio" timestamptz not null, "hora_cierre" timestamptz null, "activo" boolean not null default true);');

    this.addSql('create table "muestra" ("id" serial primary key, "pasada_id" int null, "usuario_id" int not null, "articulo_id" int not null, "etapa_id" int not null, "linea_produccion_id" int not null, "peso_neto" decimal(8,3) not null, "estado_validacion" "muestra_estado_validacion_enum" not null, "observacion" text null, "timestamp" timestamptz not null, "activo" boolean not null default true);');

    this.addSql('alter table "pasada" add constraint "pasada_linea_produccion_id_foreign" foreign key ("linea_produccion_id") references "linea_produccion" ("id") on delete restrict;');
    this.addSql('alter table "pasada" add constraint "pasada_articulo_id_foreign" foreign key ("articulo_id") references "articulo" ("id") on delete restrict;');
    this.addSql('alter table "pasada" add constraint "pasada_marca_id_foreign" foreign key ("marca_id") references "marca" ("id") on delete restrict;');
    this.addSql('alter table "pasada" add constraint "pasada_usuario_id_foreign" foreign key ("usuario_id") references "usuario" ("id") on delete restrict;');

    this.addSql('alter table "muestra" add constraint "muestra_pasada_id_foreign" foreign key ("pasada_id") references "pasada" ("id") on delete restrict;');
    this.addSql('alter table "muestra" add constraint "muestra_usuario_id_foreign" foreign key ("usuario_id") references "usuario" ("id") on delete restrict;');
    this.addSql('alter table "muestra" add constraint "muestra_articulo_id_foreign" foreign key ("articulo_id") references "articulo" ("id") on delete restrict;');
    this.addSql('alter table "muestra" add constraint "muestra_etapa_id_foreign" foreign key ("etapa_id") references "etapa" ("id") on delete restrict;');
    this.addSql('alter table "muestra" add constraint "muestra_linea_produccion_id_foreign" foreign key ("linea_produccion_id") references "linea_produccion" ("id") on delete restrict;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "muestra" drop constraint "muestra_linea_produccion_id_foreign";');
    this.addSql('alter table "muestra" drop constraint "muestra_etapa_id_foreign";');
    this.addSql('alter table "muestra" drop constraint "muestra_articulo_id_foreign";');
    this.addSql('alter table "muestra" drop constraint "muestra_usuario_id_foreign";');
    this.addSql('alter table "muestra" drop constraint "muestra_pasada_id_foreign";');

    this.addSql('alter table "pasada" drop constraint "pasada_usuario_id_foreign";');
    this.addSql('alter table "pasada" drop constraint "pasada_marca_id_foreign";');
    this.addSql('alter table "pasada" drop constraint "pasada_articulo_id_foreign";');
    this.addSql('alter table "pasada" drop constraint "pasada_linea_produccion_id_foreign";');

    this.addSql('drop table if exists "muestra" cascade;');
    this.addSql('drop table if exists "pasada" cascade;');

    this.addSql('drop type if exists "muestra_estado_validacion_enum" cascade;');
    this.addSql('drop type if exists "pasada_estado_enum" cascade;');
  }
}
