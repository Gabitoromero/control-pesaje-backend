import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/decorators/legacy';
import { Articulo } from './Articulo.js';
import { Marca } from './Marca.js';

@Entity({ tableName: 'articulo_marca' })
@Unique({ properties: ['articulo', 'marca'] })
export class ArticuloMarca {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @ManyToOne(() => Articulo, { deleteRule: 'restrict' })
  articulo!: Articulo;

  @ManyToOne(() => Marca, { deleteRule: 'restrict' })
  marca!: Marca;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;
}
