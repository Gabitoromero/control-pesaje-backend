import { Entity, Filter, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

@Filter({ name: 'activo', cond: { activo: true }, default: true })
@Entity({ tableName: 'articulo' })
export class Articulo {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @Property({ type: 'string', length: 100 })
  nombre!: string;

  @Property({ type: 'string', columnType: 'text', nullable: true })
  descripcion?: string;

  @Property({ type: 'string', length: 100, nullable: true })
  marca?: string;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;

  @Property({ type: 'json', columnType: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;
}
