import { Entity, PrimaryKey, Property, ManyToOne, Enum } from '@mikro-orm/decorators/legacy';
import { Pasada } from './Pasada.js';
import { Usuario } from './Usuario.js';
import { RutaPasada } from './RutaPasada.js';
import { Etapa } from './Etapa.js';
import { LineaProduccion } from './LineaProduccion.js';

export enum MuestraEstadoValidacion {
  OK = 'ok',
  FUERA_DE_RANGO = 'fuera_de_rango',
}

@Entity({ tableName: 'muestra' })
export class Muestra {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @ManyToOne(() => Pasada, { deleteRule: 'restrict', nullable: true })
  pasada?: Pasada;

  @ManyToOne(() => Usuario, { deleteRule: 'restrict' })
  usuario!: Usuario;

  @ManyToOne(() => RutaPasada, { deleteRule: 'restrict' })
  rutaPasada!: RutaPasada;

  @ManyToOne(() => Etapa, { deleteRule: 'restrict' })
  etapa!: Etapa;

  @ManyToOne(() => LineaProduccion, { deleteRule: 'restrict' })
  lineaProduccion!: LineaProduccion;

  @Property({ type: 'decimal', columnType: 'decimal(8,3)', serializer: value => Number(value) })
  pesoNeto!: number;

  @Enum({ items: () => MuestraEstadoValidacion, nativeEnumName: 'muestra_estado_validacion_enum' })
  estadoValidacion!: MuestraEstadoValidacion;

  @Property({ type: 'string', columnType: 'text', nullable: true })
  observacion?: string;

  @Property({ type: 'datetime' })
  timestamp: Date = new Date();

}
