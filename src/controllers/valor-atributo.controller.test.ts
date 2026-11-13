import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createValorAtributoHandlers } from './valor-atributo.controller.js';
import type { ValorAtributoService } from '../services/valor-atributo.service.js';

const makeRes = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

const makeService = (overrides: Partial<Record<'registrarValores' | 'findAll', unknown>> = {}) =>
  ({ registrarValores: vi.fn(), findAll: vi.fn(), ...overrides }) as unknown as ValorAtributoService;

const body = { pasadaId: 3, etapaId: 4, valores: [{ atributoId: 9, valor: 1 }] };
const call = (h: ReturnType<typeof createValorAtributoHandlers>['registrar'], req: object, res: ReturnType<typeof makeRes>) =>
  h(req as Request, res as unknown as Response, vi.fn());

describe('valor-atributo controller', () => {
  it('registers with the user taken from the JWT and answers 201', async () => {
    const service = makeService({ registrarValores: vi.fn().mockResolvedValue([{ id: 1 }]) });
    const res = makeRes();
    await call(createValorAtributoHandlers(service).registrar, { body: { ...body, usuarioId: 99 }, user: { id: 7 } }, res);
    expect(service.registrarValores).toHaveBeenCalledWith(7, 3, 4, body.valores);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 1 }] });
  });

  it('maps a business error to 422 with its message', async () => {
    const service = makeService({ registrarValores: vi.fn().mockRejectedValue(new Error('cannot be corrected')) });
    const res = makeRes();
    await call(createValorAtributoHandlers(service).registrar, { body, user: { id: 7 } }, res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'cannot be corrected' } });
  });

  it('lists by pasadaId and etapaId', async () => {
    const service = makeService({ findAll: vi.fn().mockResolvedValue([]) });
    const res = makeRes();
    await call(createValorAtributoHandlers(service).list, { query: { pasadaId: '3', etapaId: '4' } }, res);
    expect(service.findAll).toHaveBeenCalledWith({ pasadaId: 3, etapaId: 4 });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
  });

  it('answers 500 when listing fails unexpectedly', async () => {
    const service = makeService({ findAll: vi.fn().mockRejectedValue(new Error('db')) });
    const res = makeRes();
    await call(createValorAtributoHandlers(service).list, { query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
