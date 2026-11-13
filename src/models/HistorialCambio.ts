import { Entity, Index, ManyToOne, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { Usuario } from './Usuario.js';

/** Insert-only audit trail. Rows are written by the audit subscriber, never by services. */
@Entity({ tableName: 'historial_cambio' })
@Index({ properties: ['raizTipo', 'raizId', 'fecha'] })
@Index({ properties: ['usuario'] })
export class HistorialCambio {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @Property({ type: 'string', length: 30 })
  entidad!: string;

  @Property({ type: 'number' })
  entidadId!: number;

  @Property({ type: 'string', length: 30 })
  raizTipo!: string;

  @Property({ type: 'number' })
  raizId!: number;

  @Property({ type: 'string', length: 15 })
  accion!: string;

  @ManyToOne(() => Usuario, { nullable: true, deleteRule: 'restrict' })
  usuario?: Usuario;

  @Property({ type: 'Date', columnType: 'timestamptz', defaultRaw: 'now()' })
  fecha: Date = new Date();

  @Property({ type: 'json', columnType: 'jsonb' })
  antes: Record<string, unknown> = {};

  @Property({ type: 'json', columnType: 'jsonb' })
  despues: Record<string, unknown> = {};
}
