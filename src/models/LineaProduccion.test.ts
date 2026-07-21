import { describe, it, expect } from 'vitest';
import { LineaProduccion } from './LineaProduccion.js';

describe('LineaProduccion entity', () => {
  it('has a rutaAsignadaAt property that defaults to null', () => {
    const linea = new LineaProduccion();
    // rutaAsignadaAt is stamped manually when the route changes, so it starts as null
    expect(linea).toHaveProperty('rutaAsignadaAt');
    expect(linea.rutaAsignadaAt).toBeNull();
  });
});
