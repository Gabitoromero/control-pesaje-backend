export interface ConnectedDevice {
  socketId: string;
  lineaId: number;
  hardwareId: string;
  timestamp: Date;
}

export class DeviceRegistryService {
  private devices = new Map<string, ConnectedDevice>();

  registerDevice(socketId: string, lineaId: number, hardwareId: string): void {
    this.devices.set(socketId, {
      socketId,
      lineaId,
      hardwareId,
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
}

export const deviceRegistryService = new DeviceRegistryService();
