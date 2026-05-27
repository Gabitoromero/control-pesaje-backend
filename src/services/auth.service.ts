import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { RequestContext } from '@mikro-orm/core';
import { Usuario } from '../models/Usuario.js';

const SALT_ROUNDS = 10;

export class AuthService {
  /**
   * Validates credentials and returns a signed JWT, or null if invalid.
   * Inactive users always fail authentication.
   */
  async login(nombreUsuario: string, contrasena: string): Promise<string | null> {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No EntityManager in RequestContext');

    // Disable the default activo filter so we can check the flag ourselves
    const usuario = await em.findOne(
      Usuario,
      { nombreUsuario },
      { filters: { activo: false } },
    );

    if (!usuario || !usuario.activo) return null;

    const passwordMatch = await bcrypt.compare(contrasena, usuario.contrasenaHash);
    if (!passwordMatch) return null;

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not configured');

    const payload = {
      id: usuario.id,
      nombreUsuario: usuario.nombreUsuario,
      rol: usuario.rol,
    };

    return jwt.sign(payload, secret, { expiresIn: '8h' });
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }
}
