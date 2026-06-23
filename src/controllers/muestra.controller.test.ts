import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createMuestraHandlers } from './muestra.controller.js';
import { UsuarioRol } from '../shared/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRes() {
  const captured = { statusCode: 200, body: null as unknown };
  const mock = {
    status: vi.fn(),
    json: vi.fn(),
    send: vi.fn(),
    body: null as unknown,
  };

  mock.status.mockImplementation((code: number) => {
    captured.statusCode = code;
    return mock;
  });
  mock.json.mockImplementation((body: unknown) => {
    captured.body = body;
    mock.body = body;
    return mock;
  });
  mock.send.mockImplementation(() => mock);

  return { captured, mock };
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
    registrarMuestra: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    hardDelete: vi.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createMuestraHandlers', () => {
  let service: ReturnType<typeof makeServiceMock>;
  let handlers: ReturnType<typeof createMuestraHandlers>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = makeServiceMock();
    handlers = createMuestraHandlers(service as never);
  });

  // ─── registrar ─────────────────────────────────────────────────────────────

  describe('registrar', () => {
    it('calls service.registrarMuestra with userId from JWT and returns 201', async () => {
      const muestra = { id: 10, pesoNeto: 50 };
      service.registrarMuestra.mockResolvedValue(muestra);

      const req = makeReq({
        body: {
          etapaId: 1,
          lineaProduccionId: 2,
          pesoNeto: 50,
          articuloId: 3,
          pasadaId: 4,
          observacion: 'ok',
        },
        user: { id: 9, rol: UsuarioRol.OPERARIO, nombreUsuario: 'op', legajo: 'L1', puedeTomarMuestrasLibres: false },
      });
      const { mock } = makeRes();

      await handlers.registrar(req, mock as unknown as Response, vi.fn());

      expect(service.registrarMuestra).toHaveBeenCalledWith(
        9,    // userId from JWT
        3,    // articuloId
        1,    // etapaId
        2,    // lineaProduccionId
        50,   // pesoNeto
        4,    // pasadaId
        'ok', // observacion
      );
      expect(mock.status).toHaveBeenCalledWith(201);
      expect(mock.json).toHaveBeenCalledWith({ success: true, data: muestra });
    });

    it('returns 422 when service throws an Error', async () => {
      service.registrarMuestra.mockRejectedValue(new Error('No active session'));

      const req = makeReq({
        body: { etapaId: 1, lineaProduccionId: 2, pesoNeto: 50 },
      });
      const { mock } = makeRes();

      await handlers.registrar(req, mock as unknown as Response, vi.fn());

      expect(mock.status).toHaveBeenCalledWith(422);
      expect(mock.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'No active session' },
      });
    });
  });

  // ─── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns filtered results by pasadaId', async () => {
      const muestras = [
        { id: 1, pasada: { id: 5 }, lineaProduccion: { id: 2 }, etapa: { id: 3 } },
        { id: 2, pasada: { id: 6 }, lineaProduccion: { id: 2 }, etapa: { id: 3 } },
      ];
      service.findAll.mockResolvedValue(muestras);

      const req = makeReq({ query: { pasadaId: '5' } });
      const { mock } = makeRes();

      await handlers.list(req, mock as unknown as Response, vi.fn());

      expect(mock.json).toHaveBeenCalledWith({
        success: true,
        data: [muestras[0]], // only pasada.id === 5
      });
    });

    it('returns filtered results by lineaProduccionId', async () => {
      const muestras = [
        { id: 1, pasada: { id: 5 }, lineaProduccion: { id: 2 }, etapa: { id: 3 } },
        { id: 2, pasada: { id: 6 }, lineaProduccion: { id: 7 }, etapa: { id: 3 } },
      ];
      service.findAll.mockResolvedValue(muestras);

      const req = makeReq({ query: { lineaProduccionId: '7' } });
      const { mock } = makeRes();

      await handlers.list(req, mock as unknown as Response, vi.fn());

      expect(mock.json).toHaveBeenCalledWith({
        success: true,
        data: [muestras[1]],
      });
    });

    it('returns filtered results by etapaId', async () => {
      const muestras = [
        { id: 1, pasada: { id: 5 }, lineaProduccion: { id: 2 }, etapa: { id: 3 } },
        { id: 2, pasada: { id: 6 }, lineaProduccion: { id: 7 }, etapa: { id: 9 } },
      ];
      service.findAll.mockResolvedValue(muestras);

      const req = makeReq({ query: { etapaId: '9' } });
      const { mock } = makeRes();

      await handlers.list(req, mock as unknown as Response, vi.fn());

      expect(mock.json).toHaveBeenCalledWith({
        success: true,
        data: [muestras[1]],
      });
    });
  });

  // ─── getOne ────────────────────────────────────────────────────────────────

  describe('getOne', () => {
    it('returns 200 with data when muestra found', async () => {
      const muestra = { id: 3, pesoNeto: 50 };
      service.findById.mockResolvedValue(muestra);

      const req = makeReq({ params: { id: '3' } });
      const { mock } = makeRes();

      await handlers.getOne(req, mock as unknown as Response, vi.fn());

      expect(service.findById).toHaveBeenCalledWith(3);
      expect(mock.json).toHaveBeenCalledWith({ success: true, data: muestra });
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
    it('calls service.update and returns 200 on success', async () => {
      const updatedMustra = { id: 5, pesoNeto: 48 };
      service.update.mockResolvedValue(updatedMustra);

      const req = makeReq({
        params: { id: '5' },
        body: { pesoNeto: 48 },
      });
      const { mock } = makeRes();

      await handlers.update(req, mock as unknown as Response, vi.fn());

      expect(service.update).toHaveBeenCalledWith(5, { pesoNeto: 48 });
      expect(mock.json).toHaveBeenCalledWith({ success: true, data: updatedMustra });
    });

    it('returns 422 when service throws an Error', async () => {
      service.update.mockRejectedValue(new Error('Cannot update sample of a completed pasada'));

      const req = makeReq({
        params: { id: '5' },
        body: { pesoNeto: 48 },
      });
      const { mock } = makeRes();

      await handlers.update(req, mock as unknown as Response, vi.fn());

      expect(mock.status).toHaveBeenCalledWith(422);
    });
  });

  // ─── hardDelete ────────────────────────────────────────────────────────────

  describe('hardDelete', () => {
    it('owner OPERARIO can delete their own muestra — returns 204', async () => {
      const muestra = { id: 7, usuario: { id: 1 } };
      service.findById.mockResolvedValue(muestra);
      service.hardDelete.mockResolvedValue(true);

      const req = makeReq({
        params: { id: '7' },
        user: { id: 1, rol: UsuarioRol.OPERARIO, nombreUsuario: 'op', legajo: 'L1', puedeTomarMuestrasLibres: false },
      });
      const { mock } = makeRes();

      await handlers.hardDelete(req, mock as unknown as Response, vi.fn());

      expect(service.hardDelete).toHaveBeenCalledWith(7);
      expect(mock.status).toHaveBeenCalledWith(204);
      expect(mock.send).toHaveBeenCalledWith();
    });

    it('non-owner OPERARIO gets 403', async () => {
      const muestra = { id: 7, usuario: { id: 99 } }; // owned by user 99
      service.findById.mockResolvedValue(muestra);

      const req = makeReq({
        params: { id: '7' },
        user: { id: 1, rol: UsuarioRol.OPERARIO, nombreUsuario: 'op', legajo: 'L1', puedeTomarMuestrasLibres: false },
      });
      const { mock } = makeRes();

      await handlers.hardDelete(req, mock as unknown as Response, vi.fn());

      expect(mock.status).toHaveBeenCalledWith(403);
      expect(service.hardDelete).not.toHaveBeenCalled();
    });

    it('JEFE bypasses owner check and can delete any muestra — returns 204', async () => {
      const muestra = { id: 8, usuario: { id: 99 } }; // owned by different user
      service.findById.mockResolvedValue(muestra);
      service.hardDelete.mockResolvedValue(true);

      const req = makeReq({
        params: { id: '8' },
        user: { id: 2, rol: UsuarioRol.JEFE, nombreUsuario: 'jefe', legajo: 'J1', puedeTomarMuestrasLibres: false },
      });
      const { mock } = makeRes();

      await handlers.hardDelete(req, mock as unknown as Response, vi.fn());

      expect(service.hardDelete).toHaveBeenCalledWith(8);
      expect(mock.status).toHaveBeenCalledWith(204);
    });

    it('returns 404 when service.hardDelete returns false (muestra not found)', async () => {
      const muestra = { id: 9, usuario: { id: 1 } };
      service.findById.mockResolvedValue(muestra);
      service.hardDelete.mockResolvedValue(false);

      const req = makeReq({
        params: { id: '9' },
        user: { id: 1, rol: UsuarioRol.OPERARIO, nombreUsuario: 'op', legajo: 'L1', puedeTomarMuestrasLibres: false },
      });
      const { mock } = makeRes();

      await handlers.hardDelete(req, mock as unknown as Response, vi.fn());

      expect(mock.status).toHaveBeenCalledWith(404);
    });
  });
});
