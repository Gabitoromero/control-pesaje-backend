import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { RequestContext } from '@mikro-orm/core';
import { Usuario } from '../models/Usuario.js';
import { LineaProduccion } from '../models/LineaProduccion.js';

export class AuthService {
  async login(identifier: string, pin: string): Promise<string | null> {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No EntityManager in RequestContext');

    const usuario = await em.findOne(
      Usuario,
      { $or: [{ legajo: identifier }, { nombreUsuario: identifier }], activo: true }
    );

    if (!usuario || !usuario.activo) return null;

    const pinMatch = await bcrypt.compare(pin, usuario.pinHash);
    if (!pinMatch) return null;

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not configured');

    return jwt.sign(
      { 
        id: usuario.id, 
        nombreUsuario: usuario.nombreUsuario,
        legajo: usuario.legajo,
        rol: usuario.rol,
        puedeTomarMuestrasLibres: !!usuario.puedeTomarMuestrasLibres
      },
      secret,
      { expiresIn: '12h' }
    );
  }

  async findLineaById(id: number): Promise<LineaProduccion | null> {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No EntityManager in RequestContext');

    return em.findOne(LineaProduccion, { id });
  }
}
