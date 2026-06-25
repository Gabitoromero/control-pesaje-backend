import { Entity, ManyToOne, PrimaryKey, Unique } from '@mikro-orm/decorators/legacy';
import { Articulo } from './Articulo.js';
import { RutaPasada } from './RutaPasada.js';

@Entity({ tableName: 'articulo_ruta_pasada' })
@Unique({ properties: ['articulo', 'rutaPasada'] })
export class ArticuloRutaPasada {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @ManyToOne(() => Articulo, { deleteRule: 'restrict' })
  articulo!: Articulo;

  @ManyToOne(() => RutaPasada, { deleteRule: 'restrict' })
  rutaPasada!: RutaPasada;

}
