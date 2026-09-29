import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { Usuario } from './Usuario.js';

/** The singleton row always uses this primary key. */
export const CONFIG_SISTEMA_ID = 1;

/**
 * Global system configuration (singleton, id fixed to 1).
 * Only the last change is kept: value + timestamp + user (no history table).
 * `updatedByUsuario` is null for the seeded initial value.
 * No create/delete endpoints exist; the service is the only writer.
 */
@Entity({ tableName: 'config_sistema' })
export class ConfigSistema {
  @PrimaryKey({ type: 'number', autoincrement: false })
  id: number = CONFIG_SISTEMA_ID;

  // Tolerance percentage (20 = 20%). Postgres returns decimals as strings, so
  // the DTO mapper coerces with Number(...).
  @Property({ type: 'decimal', columnType: 'decimal(8,2)', serializer: (v: unknown) => Number(v) })
  toleranciaPct!: number;

  @Property({ type: 'datetime' })
  updatedAt: Date = new Date();

  @ManyToOne(() => Usuario, { nullable: true, deleteRule: 'restrict' })
  updatedByUsuario?: Usuario | null;
}
