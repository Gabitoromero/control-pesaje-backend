import { Entity, PrimaryKey, Property, Enum, Unique } from '@mikro-orm/decorators/legacy';
import { UsuarioRol } from '../shared/types.js';
import type { UsuarioMetadata } from '../shared/types.js';

export { UsuarioRol };
export type { UsuarioMetadata };

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
  @Property({ type: 'string', length: 10 })
  legajo!: string;

  @Property({ type: 'string', length: 255 })
  pinHash!: string;

  @Property({ type: 'boolean', default: false })
  puedeTomarMuestrasLibres: boolean = false;

  @Enum({ items: () => UsuarioRol, nativeEnumName: 'usuario_rol_enum' })
  rol!: UsuarioRol;

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;

  @Property({ type: 'json', columnType: 'jsonb', nullable: true })
  datosAdicionales?: UsuarioMetadata;
  @Property({ type: 'boolean', default: false })
  esSistema: boolean = false;
}
