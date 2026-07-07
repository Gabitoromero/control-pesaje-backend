import { Entity, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { RutaPasada } from './RutaPasada.js';

@Entity({ tableName: 'linea_produccion' })
export class LineaProduccion {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @Unique()
  @Property({ type: 'string', length: 100 })
  nombre!: string;

  @Unique()
  @Property({ type: 'number' })
  numeroBalanza!: number;

  @ManyToOne(() => RutaPasada, { deleteRule: 'restrict', nullable: true })
  rutaPasadaActiva?: RutaPasada;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;

  @Property({ type: 'uuid', nullable: true })
  @Unique()
  hardwareId?: string | null;
}
