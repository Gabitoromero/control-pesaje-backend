import { Entity, Index, ManyToOne, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { RutaPasadaEtapa } from './RutaPasadaEtapa.js';
import { ATRIBUTO_DECIMALS } from '../shared/constants.js';
import type { TipoAtributo } from '../shared/types/domain.js';

/**
 * Manual quality the operator loads when the samples of a ruta-etapa finish.
 * Defined inside the ruta-etapa: there is no catalog and no unit (the unit goes in the name).
 * minimo/maximo is the acceptance range; an 'aceptado' atributo always has 1..1.
 */
@Index({ properties: ['rutaPasadaEtapa'] })
@Entity({ tableName: 'atributo_etapa_ruta' })
export class AtributoEtapaRuta {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @ManyToOne(() => RutaPasadaEtapa, { deleteRule: 'restrict' })
  rutaPasadaEtapa!: RutaPasadaEtapa;

  @Property({ type: 'string', columnType: 'varchar(100)' })
  nombre!: string;

  @Property({ type: 'string', columnType: 'varchar(10)', check: `"tipo" in ('numerico', 'aceptado')` })
  tipo!: TipoAtributo;

  @Property({ type: 'decimal', columnType: `decimal(12,${ATRIBUTO_DECIMALS})`, serializer: value => Number(value) })
  minimo!: number;

  @Property({ type: 'decimal', columnType: `decimal(12,${ATRIBUTO_DECIMALS})`, serializer: value => Number(value) })
  maximo!: number;

  /** Soft delete: loaded values keep pointing at the atributo they were measured against. */
  @Property({ type: 'boolean', default: true })
  activo: boolean = true;
}
