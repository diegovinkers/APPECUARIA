import { describe, expect, it } from 'vitest';
import { cabezasPorCategoria, nombreConSigla } from './pecuaria.jsx';

describe('nombreConSigla', () => {
  const p = { nombre: '8.1', campo: { sigla: 'EG' } };
  it('con "Todas las estancias", la sigla adelante; con una, solo el nombre', () => {
    expect(nombreConSigla(p, true)).toBe('EG 8.1');
    expect(nombreConSigla(p, false)).toBe('8.1');
    expect(nombreConSigla({ nombre: '8.1' }, true)).toBe('8.1');
  });
});

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
