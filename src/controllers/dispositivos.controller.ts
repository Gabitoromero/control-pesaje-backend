import type { Request, Response } from 'express';
import { deviceRegistryService } from '../services/device-registry.service.js';

export const getDispositivosConectados = (req: Request, res: Response): void => {
  const devices = deviceRegistryService.getConnectedDevices();
  res.json(devices);
};
