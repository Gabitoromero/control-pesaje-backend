import type { UnidadPeso } from '../shared/types/domain.js';

export interface ConnectedDevice {
  socketId: string;
  lineaId: number;
  hardwareId: string;
  /** null while the device is connected but its unidad has not been configured yet (see device-pairing.handler.ts). */
  unidad: UnidadPeso | null;
  timestamp: Date;
}

export class DeviceRegistryService {
  private devices = new Map<string, ConnectedDevice>();

  registerDevice(socketId: string, lineaId: number, hardwareId: string, unidad: UnidadPeso | null): void {
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

  /** Thin wrapper kept for existing callers/tests; delegates to getDeviceForLinea. */
  hasDeviceForLinea(lineaId: number): boolean {
    return this.getDeviceForLinea(lineaId) !== undefined;
  }

  isHardwareIdConnected(hardwareId: string): boolean {
    return Array.from(this.devices.values()).some(d => d.hardwareId === hardwareId);
  }

  /** Resolves the source unit cached at pairing time for a connected device's socket. */
  getUnidad(socketId: string): UnidadPeso | null | undefined {
    return this.devices.get(socketId)?.unidad;
  }

  /**
   * Write-through cache fix for a live `unidad` correction (sdd/unidad-medida-peso
   * Part B, decision B2). Mutates the live `ConnectedDevice` entry in place so the
   * very next `balanza-data` frame on that socket reads the corrected unit — no
   * reconnect required. Returns false when the device is not currently connected
   * (a normal case: the DB value still wins at the next pairing).
   */
  updateUnidadByHardwareId(hardwareId: string, unidad: UnidadPeso): boolean {
    const entry = Array.from(this.devices.values()).find(d => d.hardwareId === hardwareId);
    if (!entry) {
      return false;
    }
    entry.unidad = unidad;
    return true;
  }

  /** Returns the connected device currently paired to the given lineaId, if any. */
  getDeviceForLinea(lineaId: number): ConnectedDevice | undefined {
    return Array.from(this.devices.values()).find(d => d.lineaId === lineaId);
  }
}

export const deviceRegistryService = new DeviceRegistryService();
