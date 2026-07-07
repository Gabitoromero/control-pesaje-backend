import { describe, it, expect, vi, afterEach } from 'vitest';

// ─── Hoisted mocks — run before any imports ──────────────────────────────────

const { mockDotenvConfig } = vi.hoisted(() => {
  // By default, silently succeed without injecting anything
  return {
    mockDotenvConfig: vi.fn(),
  };
});

vi.mock('dotenv', () => ({
  default: {
    config: mockDotenvConfig,
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const originalEnv = { ...process.env };

async function loadConfig() {
  vi.resetModules();
  return import('../mikro-orm.config.js');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('mikro-orm.config', () => {
  afterEach(() => {
    // Restore original env to avoid cross-test leakage
    process.env = { ...originalEnv };
  });

  describe('production environment', () => {
    it('throws when DB_PASSWORD is not set in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DB_PASSWORD;

      await expect(loadConfig()).rejects.toThrow(
        'DB_PASSWORD environment variable is required in production',
      );
    });

    it('throws when DB_PASSWORD is empty string in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_PASSWORD = '';

      await expect(loadConfig()).rejects.toThrow(
        'DB_PASSWORD environment variable is required in production',
      );
    });

    it('succeeds when DB_PASSWORD is set in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_PASSWORD = 'prod-secret';

      const config = await loadConfig();
      expect(config.default).toBeDefined();
      expect(config.default.password).toBe('prod-secret');
    });
  });

  describe('default config values', () => {
    it('uses defaults when no env vars are set', async () => {
      delete process.env.DB_NAME;
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;

      const config = await loadConfig();
      const cfg = config.default;

      expect(cfg.dbName).toBe('control_pesaje');
      expect(cfg.host).toBe('localhost');
      expect(cfg.port).toBe(5433);
      expect(cfg.user).toBe('pesaje_admin');
      expect(cfg.password).toBe('balanzas_control_2026_pwd!');
    });

    it('respects custom env var overrides', async () => {
      process.env.DB_NAME = 'my_custom_db';
      process.env.DB_HOST = 'db.internal';
      process.env.DB_PORT = '9999';
      process.env.DB_USER = 'custom_user';
      process.env.DB_PASSWORD = 'custom_pass';

      const config = await loadConfig();
      const cfg = config.default;

      expect(cfg.dbName).toBe('my_custom_db');
      expect(cfg.host).toBe('db.internal');
      expect(cfg.port).toBe(9999);
      expect(cfg.user).toBe('custom_user');
      expect(cfg.password).toBe('custom_pass');
    });

    it('parses DB_PORT as integer', async () => {
      process.env.DB_PORT = '7777';

      const config = await loadConfig();
      expect(config.default.port).toBe(7777);
      expect(typeof config.default.port).toBe('number');
    });
  });

  describe('non-production environment', () => {
    it('loads successfully without DB_PASSWORD in development', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DB_PASSWORD;

      const config = await loadConfig();
      expect(config.default).toBeDefined();
    });

    it('loads successfully in test environment', async () => {
      process.env.NODE_ENV = 'test';
      delete process.env.DB_PASSWORD;

      const config = await loadConfig();
      expect(config.default).toBeDefined();
    });
  });

  describe('debug mode', () => {
    it('enables debug when not in production', async () => {
      process.env.NODE_ENV = 'development';

      const config = await loadConfig();
      expect(config.default.debug).toBe(true);
    });

    it('disables debug in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_PASSWORD = 'some-secret';

      const config = await loadConfig();
      expect(config.default.debug).toBe(false);
    });
  });
});
