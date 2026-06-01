export * from '../shared/schemas.js';

import { z } from 'zod';

export const LoginSchema = z.object({
  nombreUsuario: z.string().min(1, { message: 'nombreUsuario is required' }),
  contrasena: z.string().min(1, { message: 'contrasena is required' }),
});

export const ActivarSesionSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, { message: 'PIN must be between 4 and 6 digits' }),
  lineaProduccionId: z.number().int().positive({ message: 'lineaProduccionId must be positive' }),
});

export const CerrarSesionOperarioSchema = z.object({
  lineaProduccionId: z.number().int().positive({ message: 'lineaProduccionId must be positive' }),
});
