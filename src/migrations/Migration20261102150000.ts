import { Migration } from '@mikro-orm/migrations';

export class Migration20261102150000 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter type "pasada_estado_enum" add value if not exists 'parada';`);
  }

  override down(): void | Promise<void> {
    // PostgreSQL cannot drop a value from a native enum. Rolling back would require
    // recreating the type and ensuring no pasada has estado 'parada', so it is a no-op.
  }

}
