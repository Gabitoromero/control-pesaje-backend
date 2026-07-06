import bcrypt from 'bcryptjs';
import { RequiredEntityData, FilterQuery } from '@mikro-orm/core';
import { BaseService } from './base.service.js';
import { Usuario } from '../models/Usuario.js';
import { ValidationError } from '../utils/errors.js';

const SALT_ROUNDS = 10;

interface UsuarioInput {
  pin?: string;
  datosAdicionales?: { pin?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export class UsuarioService extends BaseService<Usuario> {
  constructor() {
    super(Usuario);
  }

  /**
   * Hashes pin → pinHash before persisting.
   * The plain-text fields are stripped from the payload so they never reach the DB.
   */
  override async create(data: RequiredEntityData<Usuario>): Promise<Usuario> {
    if (data.legajo) {
      await this.checkUniqueLegajo(data.legajo);
    }
    const input = data as unknown as UsuarioInput;
    const mapped = await this.mapCredentials(input);
    return super.create(mapped as RequiredEntityData<Usuario>);
  }

  override async update(id: number, data: Partial<Usuario>): Promise<Usuario | null> {
    const user = await this.findById(id);
    if (!user) return null;
    
    if (user.esSistema) {
      throw new ValidationError("No se permite la modificación de usuarios de sistema");
    }

    if (data.legajo) {
      await this.checkUniqueLegajo(data.legajo, id);
    }
    const input = data as unknown as UsuarioInput;
    const mapped = await this.mapCredentials(input);
    return super.update(id, mapped as Partial<Usuario>);
  }

  override async softDelete(id: number): Promise<boolean> {
    const user = await this.findById(id);
    if (!user) return false;
    
    if (user.esSistema) {
      throw new ValidationError("No se permite eliminar usuarios de sistema");
    }

    return super.softDelete(id);
  }

  private async checkUniqueLegajo(legajo: string, currentId?: number): Promise<void> {
    const query: FilterQuery<Usuario> = { legajo };
    if (currentId) {
      query.id = { $ne: currentId };
    }
    const existing = await this.getEm().findOne(Usuario, query);
    if (existing) {
      throw new ValidationError(`El legajo ${legajo} ya está en uso por ${existing.nombreApellido}`);
    }
  }

  // No restrict needed — users have no active children in current model

  private async mapCredentials(input: UsuarioInput): Promise<Record<string, unknown>> {
    const { pin, datosAdicionales, esSistema, ...rest } = input;

    // We no longer strip 'contrasena' from 'rest' because it's not a valid field, 
    // but if it's passed incidentally, it will just be ignored by the ORM or rejected by schemas.
    const result: Record<string, unknown> = { ...rest };

    if (pin) {
      result.pinHash = await bcrypt.hash(pin, SALT_ROUNDS);
    }

    if (datosAdicionales) {
      const { pin: _, ...restDatosAdicionales } = datosAdicionales;
      result.datosAdicionales = restDatosAdicionales;
    }

    return result;
  }
}
