import { Entity, OneToMany, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { Collection } from '@mikro-orm/core';
import { RutaPasadaEtapa } from './RutaPasadaEtapa.js';

@Entity({ tableName: 'ruta_pasada' })
export class RutaPasada {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @Property({ type: 'string', length: 100 })
  nombre!: string;

  @Property({ type: 'string', columnType: 'text', nullable: true })
  descripcion?: string;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;

  @OneToMany(() => RutaPasadaEtapa, rpe => rpe.rutaPasada)
  etapas = new Collection<RutaPasadaEtapa>(this);
}
