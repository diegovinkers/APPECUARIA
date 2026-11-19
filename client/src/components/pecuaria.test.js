import { describe, expect, it } from 'vitest';
import { aprox, cabezasPorCategoria, familiasJuntas, formatUsd, nombreConSigla } from './pecuaria.jsx';

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

describe('familiasJuntas', () => {
  const l = (loteId, familiaId, categoriaId = 1, cabezas = 10) => ({ loteId, lote: `L${loteId}`, familiaId, categoriaId, cabezas });
  it('agrupa las partes del mismo lote y la misma categoría; se queda la raíz', () => {
    const [g] = familiasJuntas([l(7, 5), l(5, 5), l(9, 9)]);
    expect(g.queda.loteId).toBe(5);
    expect(g.suman.map((x) => x.loteId)).toEqual([7]);
  });
  it('sin la raíz, se queda la más vieja; con otra categoría o sola, no hay nada que unir', () => {
    expect(familiasJuntas([l(8, 5), l(7, 5)])[0].queda.loteId).toBe(7);
    expect(familiasJuntas([l(7, 5, 1), l(8, 5, 2)])).toEqual([]);
    expect(familiasJuntas([l(5, 5)])).toEqual([]);
    expect(familiasJuntas(undefined)).toEqual([]);
  });
});

describe('aprox y formatUsd', () => {
  it('"≈" solo si es estimado; dólares con punto de miles', () => {
    expect(aprox(true, '1,25')).toBe('≈1,25');
    expect(aprox(false, '1,25')).toBe('1,25');
    expect(formatUsd(93500)).toBe('USD 93.500');
    expect(formatUsd(null)).toBe('—');
  });
});
