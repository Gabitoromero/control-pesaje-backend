import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'articulo' })
@Unique({ properties: ['nombre', 'marca'] })
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
}
