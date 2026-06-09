import { Migration } from '@mikro-orm/migrations';

export class Migration20260609000000_AuthV15 extends Migration {
  async up(): Promise<void> {
    // 1. Backfill pin_hash (no-op on empty table; sentinel hash on legacy rows — ROTATE post-deploy)
    this.addSql(`UPDATE "usuario" SET "pin_hash" = '$2b$10$.yd4uLfj0Ls6W2SC5GSlheXVKe3qitVVwZWtqEyyWZHQjA31GTIke' WHERE "pin_hash" IS NULL`);

    // 2. Backfill legajo with per-row unique placeholder (no-op on empty table)
    this.addSql(`UPDATE "usuario" SET "legajo" = 'LEG-' || "id"::text WHERE "legajo" IS NULL`);

    // 3. legajo NOT NULL
    this.addSql(`ALTER TABLE "usuario" ALTER COLUMN "legajo" SET NOT NULL`);

    // 4. pin_hash NOT NULL
    this.addSql(`ALTER TABLE "usuario" ALTER COLUMN "pin_hash" SET NOT NULL`);

    // 5. drop contrasena_hash (LAST)
    this.addSql(`ALTER TABLE "usuario" DROP COLUMN "contrasena_hash"`);
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE "usuario" ADD COLUMN "contrasena_hash" varchar(255) NULL`);
    this.addSql(`ALTER TABLE "usuario" ALTER COLUMN "pin_hash" DROP NOT NULL`);
    this.addSql(`ALTER TABLE "usuario" ALTER COLUMN "legajo" DROP NOT NULL`);
  }
}
