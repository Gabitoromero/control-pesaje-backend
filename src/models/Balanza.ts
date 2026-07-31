import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'balanza' })
export class Balanza {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @Unique()
  @Property({ type: 'string', length: 100 })
  nombre!: string;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;
}
