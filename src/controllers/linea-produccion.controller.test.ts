import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLineaProduccionHandlers } from './linea-produccion.controller.js';
import type { LineaProduccionService } from '../services/linea-produccion.service.js';
import { sesionService } from '../services/sesion.service.js';
import type { Request, Response } from 'express';

vi.mock('../services/sesion.service.js', () => ({
  sesionService: {
    obtenerSesion: vi.fn(),
  },
}));

describe('LineaProduccion Controller — createLineaProduccionHandlers', () => {
  let mockService: LineaProduccionService;
  let handlers: ReturnType<typeof createLineaProduccionHandlers>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockService = {
      findAll: vi.fn(),
      assignDevice: vi.fn(),
    } as unknown as LineaProduccionService;

    handlers = createLineaProduccionHandlers(mockService);
  });

  describe('list', () => {
    it('returns sanitized lineas with estado when user is authenticated', async () => {
      const lineas = [
        { id: 1, nombre: 'Línea 1', numeroBalanza: 10, rutaPasadaActiva: null, activo: true },
        { id: 2, nombre: 'Línea 2', numeroBalanza: 20, rutaPasadaActiva: 3, activo: true },
      ];
      vi.mocked(mockService.findAll).mockResolvedValue(lineas as any);

      // Línea 1: no session → disponible
      vi.mocked(sesionService.obtenerSesion).mockImplementation((lineaId: number) => {
        if (lineaId === 2) return { usuarioId: 5, lineaProduccionId: 2, usuarioRol: 'operario', pasadaId: null, connectedAt: new Date(), ultimaActividadAt: new Date() };
        return null;
      });

      const req = { user: { id: 1 } } as unknown as Request;
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as unknown as Response;

      await handlers.list(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          { id: 1, nombre: 'Línea 1', numeroBalanza: 10, rutaPasadaActiva: null, activo: true, estado: 'disponible' },
          { id: 2, nombre: 'Línea 2', numeroBalanza: 20, rutaPasadaActiva: 3, activo: true, estado: 'ocupada' },
        ],
      });
    });

    it('marks linea as disponible when session exists but has no usuarioId', async () => {
      const lineas = [{ id: 1, nombre: 'Línea 1', numeroBalanza: 10, rutaPasadaActiva: null, activo: true }];
      vi.mocked(mockService.findAll).mockResolvedValue(lineas as any);
      vi.mocked(sesionService.obtenerSesion).mockReturnValue({ usuarioId: null, lineaProduccionId: 1, usuarioRol: null, pasadaId: null, connectedAt: new Date(), ultimaActividadAt: null });

      const req = { user: { id: 1 } } as unknown as Request;
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as unknown as Response;

      await handlers.list(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [{ id: 1, nombre: 'Línea 1', numeroBalanza: 10, rutaPasadaActiva: null, activo: true, estado: 'disponible' }],
      });
    });

    it('returns 500 on unexpected error', async () => {
      vi.mocked(mockService.findAll).mockRejectedValue(new Error('DB down'));

      const req = { user: { id: 1 } } as unknown as Request;
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as unknown as Response;

      await handlers.list(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Error interno del servidor' },
      });
    });
  });

  describe('assignDevice', () => {
    it('returns 400 for invalid ID', async () => {
      const req = { params: { id: 'abc' }, body: { hardwareId: '123e4567-e89b-12d3-a456-426614174000' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.assignDevice(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Invalid ID' } });
    });

    it('returns 400 if hardwareId is not string or null', async () => {
      const req = { params: { id: '1' }, body: { hardwareId: 12345 } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.assignDevice(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'hardwareId must be a string or null' } });
    });

    it('returns 404 if linea is not found', async () => {
      vi.mocked(mockService.assignDevice).mockResolvedValue(null);
      const req = { params: { id: '99' }, body: { hardwareId: '123e4567-e89b-12d3-a456-426614174000' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.assignDevice(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'LineaProduccion not found' } });
    });

    it('returns 400 for validation errors', async () => {
      class ValidationError extends Error { name = 'ValidationError'; }
      vi.mocked(mockService.assignDevice).mockRejectedValue(new ValidationError('Device already assigned'));
      const req = { params: { id: '1' }, body: { hardwareId: '123e4567-e89b-12d3-a456-426614174000' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.assignDevice(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Device already assigned' } });
    });

    it('returns 200 and updated data on success', async () => {
      const updatedData = { id: 1, hardwareId: '123e4567-e89b-12d3-a456-426614174000' };
      vi.mocked(mockService.assignDevice).mockResolvedValue(updatedData as any);
      const req = { params: { id: '1' }, body: { hardwareId: '123e4567-e89b-12d3-a456-426614174000' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.assignDevice(req, res);

      expect(mockService.assignDevice).toHaveBeenCalledWith(1, '123e4567-e89b-12d3-a456-426614174000');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: updatedData });
    });
  });
});
