import { describe, it, expect } from 'vitest';
import { toKilogramos, unidadLabel } from './peso.js';

describe('toKilogramos', () => {
  it('converts grams to kilograms', () => {
    expect(toKilogramos(220.5, 'g')).toBe(0.2205);
  });

  it('passes kilograms through unchanged (identity)', () => {
    expect(toKilogramos(0.2200, 'kg')).toBe(0.22);
  });

  it('rounds the result to PESO_DECIMALS (4) decimals', () => {
    // 220.55 g -> 0.22055 kg raw, must round to 4 decimals -> 0.2206 (round half up)
    expect(toKilogramos(220.55, 'g')).toBe(0.2206);
  });

  it('avoids IEEE-754 float artifacts on a known problematic value', () => {
    // 220.5 / 1000 in raw float division is fine, but this guards against
    // any regression that reintroduces trailing float noise.
    const result = toKilogramos(220.5, 'g');
    expect(result.toString()).toBe('0.2205');
  });
});

describe('unidadLabel', () => {
  it('labels a peso etapa in g / kg', () => {
    expect(unidadLabel('g', 'peso')).toBe('g');
    expect(unidadLabel('kg', 'peso')).toBe('kg');
  });

  it('labels a volumen etapa in mL / L (1 kg = 1 L, label only)', () => {
    expect(unidadLabel('g', 'volumen')).toBe('mL');
    expect(unidadLabel('kg', 'volumen')).toBe('L');
  });

  it('defaults to peso when the magnitud is missing', () => {
    expect(unidadLabel('g')).toBe('g');
    expect(unidadLabel('kg', undefined)).toBe('kg');
  });
});
