import { Migration } from '@mikro-orm/migrations';

export class Migration20260713142704 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "dispositivo" drop constraint "dispositivo_linea_produccion_id_foreign";`);

    this.addSql(`alter table "dispositivo" drop constraint "dispositivo_hardware_id_unique";`);
    this.addSql(`alter table "dispositivo" drop constraint "dispositivo_linea_produccion_id_unique";`);
    this.addSql(`alter table "dispositivo" drop constraint "dispositivo_pkey";`);
    this.addSql(`alter table "dispositivo" drop column "id", drop column "linea_produccion_id";`);
    this.addSql(`alter table "dispositivo" add "nombre" varchar(100) not null default '';`);
    this.addSql(`alter table "dispositivo" alter column "nombre" drop default;`);
    this.addSql(`alter table "dispositivo" add primary key ("hardware_id");`);

    this.addSql(`alter table "linea_produccion" drop constraint "linea_produccion_numero_balanza_unique";`);
    this.addSql(`alter table "linea_produccion" drop column "numero_balanza";`);
    this.addSql(`alter table "linea_produccion" add "dispositivo_hardware_id" varchar(255) null;`);
    this.addSql(`alter table "linea_produccion" add constraint "linea_produccion_dispositivo_hardware_id_foreign" foreign key ("dispositivo_hardware_id") references "dispositivo" ("hardware_id") on delete set null;`);
    this.addSql(`alter table "linea_produccion" add constraint "linea_produccion_dispositivo_hardware_id_unique" unique ("dispositivo_hardware_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "linea_produccion" drop constraint "linea_produccion_dispositivo_hardware_id_foreign";`);

    this.addSql(`alter table "dispositivo" drop constraint "dispositivo_pkey";`);
    this.addSql(`alter table "dispositivo" drop column "nombre";`);
    this.addSql(`alter table "dispositivo" add "id" serial primary key, add "linea_produccion_id" int4 null;`);
    this.addSql(`alter table "dispositivo" add constraint "dispositivo_linea_produccion_id_foreign" foreign key ("linea_produccion_id") references "linea_produccion" ("id") on update no action on delete set null;`);
    this.addSql(`alter table "dispositivo" add constraint "dispositivo_hardware_id_unique" unique ("hardware_id");`);
    this.addSql(`alter table "dispositivo" add constraint "dispositivo_linea_produccion_id_unique" unique ("linea_produccion_id");`);
    this.addSql(`alter table "dispositivo" add primary key ("id");`);

    this.addSql(`alter table "linea_produccion" drop constraint "linea_produccion_dispositivo_hardware_id_unique";`);
    this.addSql(`alter table "linea_produccion" drop column "dispositivo_hardware_id";`);
    this.addSql(`alter table "linea_produccion" add "numero_balanza" int4 not null;`);
    this.addSql(`alter table "linea_produccion" add constraint "linea_produccion_numero_balanza_unique" unique ("numero_balanza");`);
  }

}
