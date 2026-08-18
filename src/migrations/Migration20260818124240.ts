import { Migration } from '@mikro-orm/migrations';

export class Migration20260818124240 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "ruta_pasada_etapa" alter column "peso_ideal" type decimal(8,4) using ("peso_ideal"::decimal(8,4));`);
    this.addSql(`alter table "ruta_pasada_etapa" alter column "peso_minimo" type decimal(8,4) using ("peso_minimo"::decimal(8,4));`);
    this.addSql(`alter table "ruta_pasada_etapa" alter column "peso_maximo" type decimal(8,4) using ("peso_maximo"::decimal(8,4));`);

    this.addSql(`alter table "muestra" alter column "peso_neto" type decimal(8,4) using ("peso_neto"::decimal(8,4));`);
    this.addSql(`alter table "muestra" alter column "peso_ideal" type decimal(8,4) using ("peso_ideal"::decimal(8,4));`);
    this.addSql(`alter table "muestra" alter column "peso_minimo" type decimal(8,4) using ("peso_minimo"::decimal(8,4));`);
    this.addSql(`alter table "muestra" alter column "peso_maximo" type decimal(8,4) using ("peso_maximo"::decimal(8,4));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "muestra" alter column "peso_neto" type numeric(8,3) using ("peso_neto"::numeric(8,3));`);
    this.addSql(`alter table "muestra" alter column "peso_ideal" type numeric(8,3) using ("peso_ideal"::numeric(8,3));`);
    this.addSql(`alter table "muestra" alter column "peso_minimo" type numeric(8,3) using ("peso_minimo"::numeric(8,3));`);
    this.addSql(`alter table "muestra" alter column "peso_maximo" type numeric(8,3) using ("peso_maximo"::numeric(8,3));`);

    this.addSql(`alter table "ruta_pasada_etapa" alter column "peso_ideal" type numeric(8,3) using ("peso_ideal"::numeric(8,3));`);
    this.addSql(`alter table "ruta_pasada_etapa" alter column "peso_minimo" type numeric(8,3) using ("peso_minimo"::numeric(8,3));`);
    this.addSql(`alter table "ruta_pasada_etapa" alter column "peso_maximo" type numeric(8,3) using ("peso_maximo"::numeric(8,3));`);
  }

}
