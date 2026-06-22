import { Entity, OneToMany, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { Collection, type EntityName } from '@mikro-orm/core';
import type { RutaPasadaEtapa } from './RutaPasadaEtapa.js';

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

  // String reference breaks the ESM circular dep (RutaPasada ↔ RutaPasadaEtapa).
  // MikroORM resolves entity names during discovery, after all modules are loaded.
  @OneToMany<RutaPasadaEtapa, RutaPasada>(
    () => 'RutaPasadaEtapa' as unknown as EntityName<RutaPasadaEtapa>,
    'rutaPasada',
  )
  etapas = new Collection<RutaPasadaEtapa>(this);
}
