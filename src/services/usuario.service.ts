import bcrypt from 'bcryptjs';
import { RequiredEntityData } from '@mikro-orm/core';
import { BaseService } from './base.service.js';
import { Usuario } from '../models/Usuario.js';

const SALT_ROUNDS = 10;

interface UsuarioInput {
  contrasena?: string;
  pin?: string;
  datosAdicionales?: { pin?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export class UsuarioService extends BaseService<Usuario> {
  constructor() {
    super(Usuario);
  }

  /**
   * Hashes contrasena → contrasenaHash and pin → pinHash before persisting.
   * The plain-text fields are stripped from the payload so they never reach the DB.
   */
  override async create(data: RequiredEntityData<Usuario>): Promise<Usuario> {
    const input = data as unknown as UsuarioInput;
    const mapped = await this.mapCredentials(input);
    return super.create(mapped as RequiredEntityData<Usuario>);
  }

  override async update(id: number, data: Partial<Usuario>): Promise<Usuario | null> {
    const input = data as unknown as UsuarioInput;
    const mapped = await this.mapCredentials(input);
    return super.update(id, mapped as Partial<Usuario>);
  }

  // No restrict needed — users have no active children in current model

  private async mapCredentials(input: UsuarioInput): Promise<Record<string, unknown>> {
    const { contrasena, pin, datosAdicionales, ...rest } = input;

    const result: Record<string, unknown> = { ...rest };

    if (contrasena) {
      result.contrasenaHash = await bcrypt.hash(contrasena, SALT_ROUNDS);
    }

    if (pin) {
      result.pinHash = await bcrypt.hash(pin, SALT_ROUNDS);
    }

    if (datosAdicionales) {
      result.datosAdicionales = datosAdicionales;
    }

    return result;
  }
}
