import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'articulo' })
@Unique({ properties: ['codigo', 'nombre'] })
export class Articulo {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @Property({ type: 'string', length: 100 })
  codigo!: string;

  @Property({ type: 'string', columnType: 'text', nullable: true })
  descripcion?: string;

  @Property({ type: 'string', length: 100, nullable: true })
  nombre?: string;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;
}
