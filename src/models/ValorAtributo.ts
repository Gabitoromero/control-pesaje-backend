import { Entity, Index, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { AtributoEtapaRuta } from './AtributoEtapaRuta.js';
import { Etapa } from './Etapa.js';
import { Pasada } from './Pasada.js';
import { Usuario } from './Usuario.js';
import { ATRIBUTO_DECIMALS } from '../shared/constants.js';
import type { TipoAtributo } from '../shared/types/domain.js';

/**
 * Value an operator loaded for an atributo of a ruta-etapa in a pasada.
 * Never edited once loaded. nombre/tipo/minimo/maximo are a snapshot, so later route edits do not rewrite history.
 * A value outside the range is stored (estadoValidacion = 'fuera_de_rango'), never rejected.
 */
@Unique({ properties: ['pasada', 'atributo'] })
@Index({ properties: ['pasada', 'etapa'] })
@Entity({ tableName: 'valor_atributo' })
export class ValorAtributo {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @ManyToOne(() => Pasada, { deleteRule: 'restrict' })
  pasada!: Pasada;

  @ManyToOne(() => Etapa, { deleteRule: 'restrict' })
  etapa!: Etapa;

  @ManyToOne(() => AtributoEtapaRuta, { deleteRule: 'restrict' })
  atributo!: AtributoEtapaRuta;

  @ManyToOne(() => Usuario, { deleteRule: 'restrict' })
  usuario!: Usuario;

  @Property({ type: 'decimal', columnType: `decimal(12,${ATRIBUTO_DECIMALS})`, serializer: value => Number(value) })
  valor!: number;

  @Property({ type: 'datetime' })
  timestamp: Date = new Date();

  @Property({ type: 'string', columnType: 'varchar(100)' })
  nombre!: string;

  @Property({ type: 'string', columnType: 'varchar(10)', check: `"tipo" in ('numerico', 'aceptado')` })
  tipo!: TipoAtributo;

  @Property({ type: 'decimal', columnType: `decimal(12,${ATRIBUTO_DECIMALS})`, serializer: value => Number(value) })
  minimo!: number;

  @Property({ type: 'decimal', columnType: `decimal(12,${ATRIBUTO_DECIMALS})`, serializer: value => Number(value) })
  maximo!: number;

  @Property({ type: 'string', columnType: 'varchar(20)', check: `"estado_validacion" in ('ok', 'fuera_de_rango')` })
  estadoValidacion!: 'ok' | 'fuera_de_rango';

  /** Soft-delete flag required by the project standard. Loaded values are never edited or removed in the normal flow. */
  @Property({ type: 'boolean', default: true })
  activo: boolean = true;
}
