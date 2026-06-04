import { Entity, Filter, PrimaryKey, Property, Enum, Unique } from '@mikro-orm/decorators/legacy';
import { UsuarioRol, UsuarioMetadata } from '../shared/types.js';

export { UsuarioRol, UsuarioMetadata };

@Filter({ name: 'activo', cond: { activo: true }, default: true })
@Entity({ tableName: 'usuario' })
export class Usuario {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @Property({ type: 'string', length: 100 })
  nombreApellido!: string;

  @Unique()
  @Property({ type: 'string', length: 50 })
  nombreUsuario!: string;

  @Unique()
  @Property({ type: 'string', length: 50, nullable: true })
  legajo?: string;

  @Property({ type: 'string', length: 255 })
  contrasenaHash!: string;

  @Property({ type: 'string', length: 255, nullable: true })
  pinHash?: string;

  @Property({ type: 'boolean', default: false })
  puedeTomarMuestrasLibres: boolean = false;

  @Enum({ items: () => UsuarioRol, nativeEnumName: 'usuario_rol_enum' })
  rol!: UsuarioRol;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;

  @Property({ type: 'json', columnType: 'jsonb', nullable: true })
  datosAdicionales?: UsuarioMetadata;
}
