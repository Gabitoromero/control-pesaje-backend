import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'linea_produccion' })
export class LineaProduccion {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @Property({ type: 'string', length: 100 })
  nombre!: string;

  @Unique()
  @Property({ type: 'number' })
  numeroBalanza!: number;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;
}
