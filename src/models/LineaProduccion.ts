import { Entity, ManyToOne, PrimaryKey, Property, Unique, OneToOne } from '@mikro-orm/decorators/legacy';
import { RutaPasada } from './RutaPasada.js';
import { Dispositivo } from './Dispositivo.js';

@Entity({ tableName: 'linea_produccion' })
export class LineaProduccion {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @Unique()
  @Property({ type: 'string', length: 100 })
  nombre!: string;

  @ManyToOne(() => RutaPasada, { deleteRule: 'restrict', nullable: true })
  rutaPasadaActiva?: RutaPasada;

  @OneToOne(() => Dispositivo, { nullable: true, joinColumn: 'dispositivo_hardware_id' })
  dispositivo?: Dispositivo;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;

  @Property({ type: 'datetime', onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
