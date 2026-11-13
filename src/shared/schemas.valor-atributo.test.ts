import { describe, it, expect } from 'vitest';
import { ValorAtributoRegistrarSchema } from './schemas.js';

describe('ValorAtributoRegistrarSchema', () => {
  const base = { pasadaId: 1, etapaId: 2, valores: [{ atributoId: 3, valor: 12.5 }] };

  it('accepts numeric values, including 0 and negatives', () => {
    expect(ValorAtributoRegistrarSchema.safeParse(base).success).toBe(true);
    expect(ValorAtributoRegistrarSchema.safeParse({ ...base, valores: [{ atributoId: 3, valor: 0 }, { atributoId: 4, valor: -5 }] }).success).toBe(true);
  });

  it('rejects empty, oversized and malformed payloads', () => {
    expect(ValorAtributoRegistrarSchema.safeParse({ ...base, valores: [] }).success).toBe(false);
    const tres = [1, 2, 3].map((atributoId) => ({ atributoId, valor: 1 }));
    expect(ValorAtributoRegistrarSchema.safeParse({ ...base, valores: tres }).success).toBe(false);
    expect(ValorAtributoRegistrarSchema.safeParse({ ...base, valores: [{ atributoId: 3, valor: 'x' }] }).success).toBe(false);
    expect(ValorAtributoRegistrarSchema.safeParse({ ...base, valores: [{ atributoId: 3, valor: Infinity }] }).success).toBe(false);
    expect(ValorAtributoRegistrarSchema.safeParse({ pasadaId: 1, valores: base.valores }).success).toBe(false);
  });
});
