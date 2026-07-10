import { Migration } from '@mikro-orm/migrations';

export class Migration20260710000000_DevicePairing extends Migration {
  async up(): Promise<void> {
    this.addSql(`ALTER TABLE "linea_produccion" ADD COLUMN "hardware_id" varchar(255) NULL`);
    this.addSql(`ALTER TABLE "linea_produccion" ADD CONSTRAINT "linea_produccion_hardware_id_unique" UNIQUE ("hardware_id")`);
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE "linea_produccion" DROP CONSTRAINT "linea_produccion_hardware_id_unique"`);
    this.addSql(`ALTER TABLE "linea_produccion" DROP COLUMN "hardware_id"`);
  }
}
