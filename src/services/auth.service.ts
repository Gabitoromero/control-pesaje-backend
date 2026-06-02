import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { RequestContext, type FilterQuery } from '@mikro-orm/core';
import { Usuario, UsuarioRol } from '../models/Usuario.js';
import { LineaProduccion } from '../models/LineaProduccion.js';

const SALT_ROUNDS = 10;

export class AuthService {
  async login(nombreUsuario: string, contrasena: string): Promise<string | null> {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No EntityManager in RequestContext');

    // Disable the global activo filter to distinguish "inactive account" from "wrong credentials"
    const usuario = await em.findOne(
      Usuario,
      { nombreUsuario },
      { filters: { activo: false } },
    );

    if (!usuario || !usuario.activo) return null;
    if (usuario.rol !== UsuarioRol.ADMINISTRADOR && usuario.rol !== UsuarioRol.JEFE) return null;

    const passwordMatch = await bcrypt.compare(contrasena, usuario.contrasenaHash);
    if (!passwordMatch) return null;

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not configured');

    return jwt.sign(
      { id: usuario.id, nombreUsuario: usuario.nombreUsuario, rol: usuario.rol },
      secret,
      { expiresIn: '8h' }
    );
  }

  async validateOperatorPin(pin: string): Promise<Usuario | null> {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No EntityManager in RequestContext');

    return em.findOne(
      Usuario,
      { rol: UsuarioRol.OPERARIO, activo: true, datosAdicionales: { pin } } as FilterQuery<Usuario>
    );
  }

  async findLineaById(id: number): Promise<LineaProduccion | null> {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No EntityManager in RequestContext');

    return em.findOne(LineaProduccion, { id });
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }
}
