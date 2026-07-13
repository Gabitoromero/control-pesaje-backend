import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceRegistryService } from './device-registry.service.js';

describe('DeviceRegistryService', () => {
  let service: DeviceRegistryService;

  beforeEach(() => {
    service = new DeviceRegistryService();
  });

  it('should register a device and retrieve it', () => {
    service.registerDevice('socket-1', 10, 'hw-1');
    const devices = service.getConnectedDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0].socketId).toBe('socket-1');
    expect(devices[0].lineaId).toBe(10);
    expect(devices[0].hardwareId).toBe('hw-1');
    expect(devices[0].timestamp).toBeInstanceOf(Date);
  });

  it('should remove a device', () => {
    service.registerDevice('socket-1', 10, 'hw-1');
    service.registerDevice('socket-2', 20, 'hw-2');

    service.removeDevice('socket-1');
    const devices = service.getConnectedDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0].socketId).toBe('socket-2');
  });

  it('should return empty list initially', () => {
    const devices = service.getConnectedDevices();
    expect(devices).toEqual([]);
  });

  describe('isHardwareIdConnected', () => {
    it('returns true when a connected device matches the hardwareId', () => {
      service.registerDevice('socket-1', 10, 'hw-1');
      expect(service.isHardwareIdConnected('hw-1')).toBe(true);
    });

    it('returns false when no connected device matches the hardwareId', () => {
      service.registerDevice('socket-1', 10, 'hw-1');
      expect(service.isHardwareIdConnected('hw-does-not-exist')).toBe(false);
    });

    it('returns false when the registry is empty', () => {
      expect(service.isHardwareIdConnected('hw-1')).toBe(false);
    });

    it('returns false after the matching device disconnects', () => {
      service.registerDevice('socket-1', 10, 'hw-1');
      service.removeDevice('socket-1');
      expect(service.isHardwareIdConnected('hw-1')).toBe(false);
    });
  });
});
