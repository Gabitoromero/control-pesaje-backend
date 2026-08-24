import type { UnidadPeso } from '../shared/types/domain.js';

export interface ConnectedDevice {
  socketId: string;
  lineaId: number;
  hardwareId: string;
  unidad: UnidadPeso;
  timestamp: Date;
}

export class DeviceRegistryService {
  private devices = new Map<string, ConnectedDevice>();

  registerDevice(socketId: string, lineaId: number, hardwareId: string, unidad: UnidadPeso): void {
    this.devices.set(socketId, {
      socketId,
      lineaId,
      hardwareId,
      unidad,
      timestamp: new Date(),
    });
  }

  removeDevice(socketId: string): void {
    this.devices.delete(socketId);
  }

  getConnectedDevices(): ConnectedDevice[] {
    return Array.from(this.devices.values());
  }

  hasDeviceForLinea(lineaId: number): boolean {
    return Array.from(this.devices.values()).some(d => d.lineaId === lineaId);
  }

  isHardwareIdConnected(hardwareId: string): boolean {
    return Array.from(this.devices.values()).some(d => d.hardwareId === hardwareId);
  }

  /** Resolves the source unit cached at pairing time for a connected device's socket. */
  getUnidad(socketId: string): UnidadPeso | undefined {
    return this.devices.get(socketId)?.unidad;
  }
}

export const deviceRegistryService = new DeviceRegistryService();
