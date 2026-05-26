import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/decorators/legacy';
import { Articulo } from './Articulo.js';
import { Etapa } from './Etapa.js';

@Entity({ tableName: 'ruta_pasada_etapa' })
@Unique({ properties: ['articulo', 'etapa'] })
export class RutaPasadaEtapa {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @ManyToOne(() => Articulo, { deleteRule: 'restrict' })
  articulo!: Articulo;

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
