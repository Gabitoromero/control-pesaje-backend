import { describe, expect, it } from 'vitest';
import { EtapaCreateSchema } from './schemas.js';

describe('EtapaCreateSchema', () => {
  it('should accept an optional activo field', () => {
    // Failing test: the schema currently does not define 'activo'
    // but wait, zod strip unknown keys by default, so it might pass if not strict.
    // Let's use strict() to ensure it fails if not explicitly allowed,
    // or we can test that the parsed object retains 'activo' if provided.
    const input = { nombre: 'Test Etapa', activo: true };
    const parsed = EtapaCreateSchema.parse(input);
    expect(parsed).toHaveProperty('activo', true);
  });
});
