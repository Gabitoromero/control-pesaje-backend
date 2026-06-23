import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createPasadaHandlers } from './pasada.controller.js';
import { UsuarioRol } from '../shared/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
  };
  const mock = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockImplementation((body: unknown) => {
      mock.body = body;
      return mock;
    }),
    body: null as unknown,
  };
  // Bind status+json so chained calls work
  mock.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return mock;
  });
  return { res, mock };
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    user: { id: 1, rol: UsuarioRol.OPERARIO, nombreUsuario: 'op', legajo: 'L1', puedeTomarMuestrasLibres: false },
    ...overrides,
  } as unknown as Request;
}

// ─── Service mock ─────────────────────────────────────────────────────────────

function makeServiceMock() {
  return {
    iniciarPasada: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    completarPasada: vi.fn(),
    abortarPasada: vi.fn(),
    softDelete: vi.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createPasadaHandlers', () => {
  let service: ReturnType<typeof makeServiceMock>;
  let handlers: ReturnType<typeof createPasadaHandlers>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = makeServiceMock();
    handlers = createPasadaHandlers(service as never);
  });

  // ─── iniciar ───────────────────────────────────────────────────────────────

  describe('iniciar', () => {
    it('calls service.iniciarPasada with lineaId, articuloId and userId from JWT, returns 201', async () => {
      const pasada = { id: 10, estado: 'en_curso' };
      service.iniciarPasada.mockResolvedValue(pasada);

      const req = makeReq({
        body: { lineaProduccionId: 3, articuloId: 5 },
        user: { id: 7, rol: UsuarioRol.OPERARIO, nombreUsuario: 'op', legajo: 'L1', puedeTomarMuestrasLibres: false },
      });
      const { mock } = makeRes();

      await handlers.iniciar(req, mock as unknown as Response, vi.fn());

      expect(service.iniciarPasada).toHaveBeenCalledWith(3, 5, 7);
      expect(mock.status).toHaveBeenCalledWith(201);
      expect(mock.json).toHaveBeenCalledWith({ success: true, data: pasada });
    });

    it('returns 422 when service throws an Error', async () => {
      service.iniciarPasada.mockRejectedValue(new Error('No active session'));

      const req = makeReq({ body: { lineaProduccionId: 1, articuloId: 2 } });
      const { mock } = makeRes();

      await handlers.iniciar(req, mock as unknown as Response, vi.fn());

      expect(mock.status).toHaveBeenCalledWith(422);
      expect(mock.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'No active session' },
      });
    });
  });

  // ─── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns filtered results from service.findAll()', async () => {
      const pasadas = [
        { id: 1, lineaProduccion: { id: 2 }, estado: 'en_curso', articulo: { id: 4 } },
        { id: 2, lineaProduccion: { id: 3 }, estado: 'en_curso', articulo: { id: 5 } },
      ];
      service.findAll.mockResolvedValue(pasadas);

      // Filter by lineaProduccionId=2 — only the first should be returned
      const req = makeReq({ query: { lineaProduccionId: '2' } });
      const { mock } = makeRes();

      await handlers.list(req, mock as unknown as Response, vi.fn());

      expect(mock.json).toHaveBeenCalledWith({
        success: true,
        data: [pasadas[0]],
      });
    });

    it('returns all active pasadas when no filters provided', async () => {
      const pasadas = [{ id: 1 }, { id: 2 }];
      service.findAll.mockResolvedValue(pasadas);

      const req = makeReq({ query: {} });
      const { mock } = makeRes();

      await handlers.list(req, mock as unknown as Response, vi.fn());

      expect(mock.json).toHaveBeenCalledWith({ success: true, data: pasadas });
    });
  });

  // ─── getOne ────────────────────────────────────────────────────────────────

  describe('getOne', () => {
    it('returns 200 with data when pasada found', async () => {
      const pasada = { id: 5, estado: 'en_curso' };
      service.findById.mockResolvedValue(pasada);

      const req = makeReq({ params: { id: '5' } });
      const { mock } = makeRes();

      await handlers.getOne(req, mock as unknown as Response, vi.fn());

      expect(service.findById).toHaveBeenCalledWith(5);
      expect(mock.json).toHaveBeenCalledWith({ success: true, data: pasada });
    });

    it('returns 404 when service returns null', async () => {
      service.findById.mockResolvedValue(null);

      const req = makeReq({ params: { id: '999' } });
      const { mock } = makeRes();

      await handlers.getOne(req, mock as unknown as Response, vi.fn());

      expect(mock.status).toHaveBeenCalledWith(404);
      expect(mock.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Not found' },
      });
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('calls service.update(id, data) and returns 200 when no action provided', async () => {
      const updatedPasada = { id: 3, estado: 'en_curso' };
      service.update.mockResolvedValue(updatedPasada);

      const req = makeReq({
        params: { id: '3' },
        body: { observacionCierre: 'test' },
      });
      const { mock } = makeRes();

      await handlers.update(req, mock as unknown as Response, vi.fn());

      expect(service.update).toHaveBeenCalledWith(3, { observacionCierre: 'test' });
      expect(mock.json).toHaveBeenCalledWith({ success: true, data: updatedPasada });
    });

    it('verifies ownership and calls completarPasada when action=completar (owner)', async () => {
      const pasada = { id: 3, usuario: { id: 7 }, estado: 'en_curso' };
      service.findById.mockResolvedValue(pasada);
      service.completarPasada.mockResolvedValue({ ...pasada, estado: 'completa' });

      const req = makeReq({
        params: { id: '3' },
        body: { action: 'completar' },
        user: { id: 7, rol: UsuarioRol.OPERARIO, nombreUsuario: 'op', legajo: 'L1', puedeTomarMuestrasLibres: false },
      });
      const { mock } = makeRes();

      await handlers.update(req, mock as unknown as Response, vi.fn());

      expect(service.completarPasada).toHaveBeenCalledWith(3);
      expect(mock.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 403 when action=completar and user is not the owner', async () => {
      const pasada = { id: 3, usuario: { id: 99 }, estado: 'en_curso' };
      service.findById.mockResolvedValue(pasada);

      const req = makeReq({
        params: { id: '3' },
        body: { action: 'completar' },
        user: { id: 7, rol: UsuarioRol.OPERARIO, nombreUsuario: 'op', legajo: 'L1', puedeTomarMuestrasLibres: false },
      });
      const { mock } = makeRes();

      await handlers.update(req, mock as unknown as Response, vi.fn());

      expect(mock.status).toHaveBeenCalledWith(403);
      expect(service.completarPasada).not.toHaveBeenCalled();
    });

    it('verifies ownership and calls abortarPasada when action=abortar (with motivoCierre)', async () => {
      const pasada = { id: 4, usuario: { id: 7 }, estado: 'en_curso' };
      service.findById.mockResolvedValue(pasada);
      service.abortarPasada.mockResolvedValue({ ...pasada, estado: 'abortada' });

      const req = makeReq({
        params: { id: '4' },
        body: { action: 'abortar', motivoCierre: 'Equipo averiado' },
        user: { id: 7, rol: UsuarioRol.JEFE, nombreUsuario: 'jefe', legajo: 'J1', puedeTomarMuestrasLibres: false },
      });
      const { mock } = makeRes();

      await handlers.update(req, mock as unknown as Response, vi.fn());

      expect(service.abortarPasada).toHaveBeenCalledWith(4, 'Equipo averiado');
      expect(mock.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 422 when action=abortar but motivoCierre is missing', async () => {
      const pasada = { id: 4, usuario: { id: 7 }, estado: 'en_curso' };
      service.findById.mockResolvedValue(pasada);

      const req = makeReq({
        params: { id: '4' },
        body: { action: 'abortar' }, // no motivoCierre
        user: { id: 7, rol: UsuarioRol.JEFE, nombreUsuario: 'jefe', legajo: 'J1', puedeTomarMuestrasLibres: false },
      });
      const { mock } = makeRes();

      await handlers.update(req, mock as unknown as Response, vi.fn());

      expect(mock.status).toHaveBeenCalledWith(422);
      expect(service.abortarPasada).not.toHaveBeenCalled();
    });

    it('returns 422 when service throws an Error', async () => {
      service.update.mockRejectedValue(new Error('Cannot update closed pasada'));

      const req = makeReq({
        params: { id: '3' },
        body: {},
      });
      const { mock } = makeRes();

      await handlers.update(req, mock as unknown as Response, vi.fn());

      expect(mock.status).toHaveBeenCalledWith(422);
      expect(mock.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Cannot update closed pasada' },
      });
    });
  });
});
