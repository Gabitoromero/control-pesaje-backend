import { Entity, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { Etapa } from './Etapa.js';
import { RutaPasada } from './RutaPasada.js';

@Entity({ tableName: 'ruta_pasada_etapa' })
@Unique({ properties: ['rutaPasada', 'etapa'] })
export class RutaPasadaEtapa {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @ManyToOne(() => RutaPasada, { deleteRule: 'restrict' })
  rutaPasada!: RutaPasada;

  @ManyToOne(() => Etapa, { deleteRule: 'restrict' })
  etapa!: Etapa;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;

  @Property({ type: 'number' })
  orden!: number;

  @Property({ type: 'decimal', columnType: 'decimal(8,3)', serializer: value => Number(value) })
  pesoIdeal!: number;

  @Property({ type: 'decimal', columnType: 'decimal(8,3)', serializer: value => Number(value) })
  pesoMinimo!: number;

  @Property({ type: 'decimal', columnType: 'decimal(8,3)', serializer: value => Number(value) })
  pesoMaximo!: number;

  @Property({ type: 'number' })
  cantidadMuestrasRequeridas!: number;
}
