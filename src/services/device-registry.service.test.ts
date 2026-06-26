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
});
