import type { RequestHandler } from 'express';
import type { ValorAtributoService } from '../services/valor-atributo.service.js';
import { ValorAtributoRegistrarSchema } from '../shared/schemas.js';

export interface ValorAtributoHandlers {
  registrar: RequestHandler;
  list: RequestHandler;
}

/**
 * Error mapping (same as the muestra handlers): service Error -> 422, unknown -> 500.
 * The user always comes from the JWT, never from the body.
 */
export function createValorAtributoHandlers(service: ValorAtributoService): ValorAtributoHandlers {
  const registrar: RequestHandler = async (req, res) => {
    try {
      const { pasadaId, etapaId, valores } = ValorAtributoRegistrarSchema.parse(req.body);
      const data = await service.registrarValores(req.user!.id, pasadaId, etapaId, valores);
      res.status(201).json({ success: true, data });
    } catch (err) {
      if (err instanceof Error) {
        res.status(422).json({ success: false, error: { message: err.message } });
        return;
      }
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  const list: RequestHandler = async (req, res) => {
    try {
      const pasadaId = req.query.pasadaId ? Number(req.query.pasadaId) : undefined;
      const etapaId = req.query.etapaId ? Number(req.query.etapaId) : undefined;
      const data = await service.findAll({ pasadaId, etapaId });
      res.json({ success: true, data });
    } catch {
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  return { registrar, list };
}
