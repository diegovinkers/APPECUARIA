import { describe, expect, it, vi } from 'vitest';

vi.mock('../api/pecuaria', () => ({}));
vi.mock('../components/LibroRodeoConfig', () => ({ Causas: () => null, TiposMovimiento: () => null }));
const { textoPesoPrecio } = await import('./ConfiguracionPecuariaPage.jsx');

describe('textoPesoPrecio', () => {
  it('peso promedio y precio de la categoría, en una línea', () => {
    expect(textoPesoPrecio({ pesoPromedioKg: 190, precioUsd: 2.5, precioPor: 'KG' })).toBe('≈190 kg · USD 2,5/kg');
    expect(textoPesoPrecio({ pesoPromedioKg: null, precioUsd: 800, precioPor: 'CABEZA' })).toBe('USD 800/cabeza');
    expect(textoPesoPrecio({ pesoPromedioKg: null, precioUsd: null })).toBe('Sin peso promedio ni precio');
  });
});
