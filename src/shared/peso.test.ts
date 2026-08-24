import { describe, it, expect } from 'vitest';
import { toKilogramos } from './peso.js';

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
