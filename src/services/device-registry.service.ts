export interface ConnectedDevice {
  socketId: string;
  lineaId: number;
  timestamp: Date;
}

export class DeviceRegistryService {
  private devices = new Map<string, ConnectedDevice>();

  registerDevice(socketId: string, lineaId: number): void {
    this.devices.set(socketId, {
      socketId,
      lineaId,
      timestamp: new Date(),
    });
  }

  removeDevice(socketId: string): void {
    this.devices.delete(socketId);
  }

  getConnectedDevices(): ConnectedDevice[] {
    return Array.from(this.devices.values());
  }
}

export const deviceRegistryService = new DeviceRegistryService();
