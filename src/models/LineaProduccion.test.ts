import { describe, it, expect } from 'vitest';
import { LineaProduccion } from './LineaProduccion.js';

describe('LineaProduccion entity', () => {
  it('has an updatedAt property of type Date', () => {
    const linea = new LineaProduccion();
    // updatedAt should be auto-initialized via onCreate
    expect(linea).toHaveProperty('updatedAt');
    expect(linea.updatedAt).toBeInstanceOf(Date);
  });
});
