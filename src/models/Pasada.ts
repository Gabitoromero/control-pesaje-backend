import { Entity, Filter, PrimaryKey, Property, ManyToOne, Enum } from '@mikro-orm/decorators/legacy';
import { LineaProduccion } from './LineaProduccion.js';
import { Articulo } from './Articulo.js';
import { Marca } from './Marca.js';
import { Usuario } from './Usuario.js';

export enum PasadaEstado {
  EN_CURSO = 'en_curso',
  COMPLETA = 'completa',
  ABORTADA = 'abortada',
}

@Filter({ name: 'activo', cond: { activo: true }, default: true })
@Entity({ tableName: 'pasada' })
export class Pasada {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @ManyToOne(() => LineaProduccion, { deleteRule: 'restrict' })
  lineaProduccion!: LineaProduccion;

  @ManyToOne(() => Articulo, { deleteRule: 'restrict' })
  articulo!: Articulo;

  @ManyToOne(() => Marca, { deleteRule: 'restrict', nullable: true })
  marca?: Marca;

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

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;
}
