import { describe, it, expect, vi } from 'vitest';
import { getDispositivosConectados } from './dispositivos.controller.js';
import { deviceRegistryService } from '../services/device-registry.service.js';
import type { Request, Response } from 'express';

vi.mock('../services/device-registry.service.js', () => ({
  deviceRegistryService: {
    getConnectedDevices: vi.fn()
  }
}));

describe('Dispositivos Controller', () => {
  it('should return connected devices', () => {
    const mockDevices = [{ socketId: 'abc', lineaId: 1, timestamp: new Date() }];
    vi.mocked(deviceRegistryService.getConnectedDevices).mockReturnValue(mockDevices);

    const req = {} as Request;
    const res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis()
    } as unknown as Response;

    getDispositivosConectados(req, res);

    expect(deviceRegistryService.getConnectedDevices).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(mockDevices);
  });
});
