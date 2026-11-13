import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM } from '@mikro-orm/postgresql';
import * as models from './index.js';
import { Usuario } from './Usuario.js';
import { UsuarioRol } from '../shared/types.js';

describe('Usuario serialization', () => {
  let orm: MikroORM;

  beforeAll(() => {
    // The constructor discovers metadata without connecting: that is all serialization needs.
    orm = new MikroORM({
      dbName: 'unused',
      entities: Object.values(models).filter((m) => typeof m === 'function'),
      discovery: { warnWhenNoEntities: false },
    });
  });

  afterAll(async () => {
    await orm.close(true);
  });

  const build = () => {
    const usuario = new Usuario();
    usuario.nombreUsuario = 'jperez';
    usuario.legajo = '12345';
    usuario.pinHash = '$2b$10$abcdefghijklmnopqrstuv';
    usuario.rol = UsuarioRol.OPERARIO;
    return usuario;
  };

  it('never exposes pinHash when serialized to JSON', () => {
    const json = JSON.parse(JSON.stringify(build()));
    expect(json).not.toHaveProperty('pinHash');
    expect(json.legajo).toBe('12345');
  });

  it('keeps pinHash readable on the entity for the login check', () => {
    expect(build().pinHash).toBe('$2b$10$abcdefghijklmnopqrstuv');
  });
});
