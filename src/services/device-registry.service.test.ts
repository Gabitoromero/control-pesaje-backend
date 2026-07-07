import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceRegistryService } from './device-registry.service.js';

describe('DeviceRegistryService', () => {
  let service: DeviceRegistryService;

  beforeEach(() => {
    service = new DeviceRegistryService();
  });

  it('should register a device and retrieve it', () => {
    service.registerDevice('socket-1', 10);
    const devices = service.getConnectedDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0].socketId).toBe('socket-1');
    expect(devices[0].lineaId).toBe(10);
    expect(devices[0].timestamp).toBeInstanceOf(Date);
  });

  it('should remove a device', () => {
    service.registerDevice('socket-1', 10);
    service.registerDevice('socket-2', 20);
    
    service.removeDevice('socket-1');
    const devices = service.getConnectedDevices();
    
    expect(devices).toHaveLength(1);
    expect(devices[0].socketId).toBe('socket-2');
  });

  it('should return empty list initially', () => {
    const devices = service.getConnectedDevices();
    expect(devices).toEqual([]);
  });

  it('should detect when a device is registered for a linea', () => {
    service.registerDevice('socket-1', 10);
    service.registerDevice('socket-2', 20);

    expect(service.hasDeviceForLinea(10)).toBe(true);
    expect(service.hasDeviceForLinea(20)).toBe(true);
  });

  it('should return false when no device is registered for a linea', () => {
    service.registerDevice('socket-1', 10);

    expect(service.hasDeviceForLinea(20)).toBe(false);
  });

  it('should return false for any linea when registry is empty', () => {
    expect(service.hasDeviceForLinea(1)).toBe(false);
  });

  it('overwrites existing registration for same socketId', () => {
    service.registerDevice('socket-1', 10);
    service.registerDevice('socket-1', 99); // same socket, different line

    const devices = service.getConnectedDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0].lineaId).toBe(99);
  });
});
