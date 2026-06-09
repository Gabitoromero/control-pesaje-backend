export * from '../shared/schemas.js';

import { z } from 'zod';

export const LoginSchema = z.object({
  legajo: z.string().min(1, { message: 'legajo is required' }),
  pin: z.string().regex(/^\d{4,6}$/, { message: 'PIN must be between 4 and 6 digits' }),
});

export const ActividadSchema = z.object({
  lineaProduccionId: z.number().int().positive({ message: 'lineaProduccionId must be positive' }),
});

export const SesionLineaSchema = z.object({
  lineaProduccionId: z.number().int().positive({ message: 'lineaProduccionId must be positive' }),
});

export const CerrarSesionSchema = z.object({
  lineaProduccionId: z.number().int().positive({ message: 'lineaProduccionId must be positive' }).optional(),
});
