import { describe, expect, it } from 'vitest';
import { cabezasPorCategoria } from './pecuaria.jsx';

describe('cabezasPorCategoria', () => {
  it('dice cabezas de qué, sumando los lotes de la misma categoría, de mayor a menor', () => {
    expect(
      cabezasPorCategoria([
        { categoria: 'Vacas', cabezas: 80 },
        { categoria: 'Terneros', cabezas: 1200 },
        { categoria: 'Vacas', cabezas: 40 },
      ]),
    ).toBe('1.200 Terneros · 120 Vacas');
  });

  it('un potrero sin animales dice "vacío"', () => {
    expect(cabezasPorCategoria([])).toBe('vacío');
    expect(cabezasPorCategoria(undefined)).toBe('vacío');
    expect(cabezasPorCategoria([{ categoria: 'Vacas', cabezas: 0 }])).toBe('vacío');
  });
});
