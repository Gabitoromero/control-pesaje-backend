import { BaseService } from './base.service.js';
import { Usuario } from '../models/Usuario.js';

export class UsuarioService extends BaseService<Usuario> {
  constructor() {
    super(Usuario);
  }

  // No restrict needed — users have no active children in current model
}
