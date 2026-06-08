import { Entity, PrimaryKey, Property, ManyToOne, Enum } from '@mikro-orm/decorators/legacy';
import { LineaProduccion } from './LineaProduccion.js';
import { Articulo } from './Articulo.js';
import { RutaPasada } from './RutaPasada.js';
import { Usuario } from './Usuario.js';

export enum PasadaEstado {
  EN_CURSO = 'en_curso',
  COMPLETA = 'completa',
  ABORTADA = 'abortada',
}

@Entity({ tableName: 'pasada' })
export class Pasada {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @ManyToOne(() => LineaProduccion, { deleteRule: 'restrict' })
  lineaProduccion!: LineaProduccion;

  @ManyToOne(() => RutaPasada, { deleteRule: 'restrict' })
  rutaPasada!: RutaPasada;

  @ManyToOne(() => Articulo, { deleteRule: 'restrict', nullable: true })
  articulo?: Articulo;

  @ManyToOne(() => Usuario, { deleteRule: 'restrict' })
  usuario!: Usuario;

  @Property({ type: 'number' })
  numero!: number;

  @Enum({ items: () => PasadaEstado, nativeEnumName: 'pasada_estado_enum' })
  estado: PasadaEstado = PasadaEstado.EN_CURSO;

  @Property({ type: 'string', columnType: 'text', nullable: true })
  motivoCierre?: string;

  @Property({ type: 'datetime' })
  horaInicio: Date = new Date();

  @Property({ type: 'datetime', nullable: true })
  horaCierre?: Date;

  @Property({ type: 'string', columnType: 'text', nullable: true })
  observacionCierre?: string;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;
}
