import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'etapa' })
export class Etapa {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @Unique()
  @Property({ type: 'string', length: 100 })
  nombre!: string;

  @Property({ type: 'string', columnType: 'text', nullable: true })
  descripcion?: string;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;
}
