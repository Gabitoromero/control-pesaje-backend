import { Entity, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import type { Opt } from '@mikro-orm/core';
import { Articulo } from './Articulo.js';

@Entity({ tableName: 'balanza' })
export class Balanza {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @Unique()
  @Property({ type: 'string', length: 100 })
  nombre!: string;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;

  // Pending verification with standard weights. A balanza with no history starts pending.
  @Property({ type: 'boolean', default: true })
  verificacionPendiente: Opt<boolean> = true;

  // Last article produced (or verified) on this balanza; null = never produced.
  @ManyToOne(() => Articulo, { deleteRule: 'restrict', nullable: true })
  ultimoArticulo?: Articulo | null;
}
