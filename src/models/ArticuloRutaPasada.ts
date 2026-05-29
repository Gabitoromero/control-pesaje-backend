import { Entity, Filter, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import { Articulo } from './Articulo.js';
import { RutaPasada } from './RutaPasada.js';

@Filter({ name: 'activo', cond: { activo: true }, default: true })
@Entity({ tableName: 'articulo_ruta_pasada' })
@Unique({ properties: ['articulo', 'rutaPasada'] })
export class ArticuloRutaPasada {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @ManyToOne(() => Articulo, { deleteRule: 'restrict' })
  articulo!: Articulo;

  @ManyToOne(() => RutaPasada, { deleteRule: 'restrict' })
  rutaPasada!: RutaPasada;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;
}
