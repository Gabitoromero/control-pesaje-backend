import type { RequestHandler } from 'express';
import type { MuestraService } from '../services/muestra.service.js';
import { UsuarioRol } from '../shared/types.js';

// Roles that bypass ownership checks (can delete any muestra)
const PRIVILEGED_ROLES: ReadonlyArray<string> = [UsuarioRol.JEFE, UsuarioRol.ADMINISTRADOR];

export interface MuestraHandlers {
  registrar: RequestHandler;
  list: RequestHandler;
  getOne: RequestHandler;
  update: RequestHandler;
  hardDelete: RequestHandler;
}

export interface RegistrarMuestraBody {
  etapaId: number;
  lineaProduccionId: number;
  pesoNeto: number;
  articuloId?: number;
  pasadaId?: number;
  observacion?: string;
}

/**
 * Creates HTTP handlers for the Muestra resource.
 * Mirrors the createLineaProduccionHandlers factory pattern.
 *
 * Error mapping (per design):
 *   service Error  →  422
 *   null return    →  404
 *   unknown        →  500
 */
export function createMuestraHandlers(service: MuestraService): MuestraHandlers {

  const registrar: RequestHandler = async (req, res) => {
    try {
      // userId MUST come from JWT payload, never from the body (REQ-M1)
      const userId = req.user!.id;
      const { etapaId, lineaProduccionId, pesoNeto, articuloId, pasadaId, observacion } = req.body as RegistrarMuestraBody;

      const muestra = await service.registrarMuestra(
        userId,
        articuloId,
        etapaId,
        lineaProduccionId,
        pesoNeto,
        pasadaId,
        observacion,
      );

      res.status(201).json({ success: true, data: muestra });
    } catch (err) {
      if (err instanceof Error) {
        res.status(422).json({ success: false, error: { message: err.message } });
        return;
      }
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  const list: RequestHandler = async (req, res) => {
    try {
      const all = await service.findAll();

      // In-memory filters from query params (REQ-M2)
      const pasadaId = req.query.pasadaId ? Number(req.query.pasadaId) : undefined;
      const lineaId = req.query.lineaProduccionId ? Number(req.query.lineaProduccionId) : undefined;
      const etapaId = req.query.etapaId ? Number(req.query.etapaId) : undefined;

      const filtered = all.filter((muestra) => {
        if (pasadaId !== undefined && muestra.pasada?.id !== pasadaId) {
          return false;
        }
        if (lineaId !== undefined && muestra.lineaProduccion?.id !== lineaId) {
          return false;
        }
        if (etapaId !== undefined && muestra.etapa?.id !== etapaId) {
          return false;
        }
        return true;
      });

      res.json({ success: true, data: filtered });
    } catch {
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  const getOne: RequestHandler = async (req, res) => {
    const id = Number(req.params.id);
    try {
      const muestra = await service.findById(id);
      if (!muestra) {
        res.status(404).json({ success: false, error: { message: 'Not found' } });
        return;
      }
      res.json({ success: true, data: muestra });
    } catch {
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  const update: RequestHandler = async (req, res) => {
    const id = Number(req.params.id);
    const userId = req.user!.id;
    const userRole = req.user!.rol;

    try {
      // Load the muestra to verify ownership before updating (mirrors hardDelete)
      const muestra = await service.findById(id);
      if (!muestra) {
        res.status(404).json({ success: false, error: { message: 'Not found' } });
        return;
      }

      // Ownership check: JEFE/ADMIN can update any muestra; OPERARIO only their own
      const isPrivileged = PRIVILEGED_ROLES.includes(userRole);
      const ownerId = muestra.usuario?.id;
      const isOwner = ownerId === userId;

      if (!isPrivileged && !isOwner) {
        res.status(403).json({ success: false, error: { message: 'Insufficient permissions to update this muestra' } });
        return;
      }

      const updated = await service.update(id, req.body);
      if (!updated) {
        res.status(404).json({ success: false, error: { message: 'Not found' } });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err) {
      if (err instanceof Error) {
        res.status(422).json({ success: false, error: { message: err.message } });
        return;
      }
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  const hardDelete: RequestHandler = async (req, res) => {
    const id = Number(req.params.id);
    const userId = req.user!.id;
    const userRole = req.user!.rol;

    try {
      // Load the muestra to verify ownership before deleting
      const muestra = await service.findById(id);
      if (!muestra) {
        res.status(404).json({ success: false, error: { message: 'Not found' } });
        return;
      }

      // Ownership check: JEFE/ADMIN can delete any muestra; OPERARIO only their own (REQ-M5)
      const isPrivileged = PRIVILEGED_ROLES.includes(userRole);
      const ownerId = muestra.usuario?.id;
      const isOwner = ownerId === userId;

      if (!isPrivileged && !isOwner) {
        res.status(403).json({ success: false, error: { message: 'Insufficient permissions to delete this muestra' } });
        return;
      }

      const deleted = await service.hardDelete(id);
      if (!deleted) {
        // Race condition: row disappeared between findById and hardDelete
        res.status(404).json({ success: false, error: { message: 'Not found' } });
        return;
      }

      res.status(204).send();
    } catch {
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  return { registrar, list, getOne, update, hardDelete };
}
