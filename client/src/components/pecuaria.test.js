import { describe, expect, it } from 'vitest';
import { aprox, cabezasPorCategoria, opcionPotrero, queHayYUso, familiasJuntas, formatDiaMes, formatMetros, formatUsd, nombreConSigla, textoFaltan } from './pecuaria.jsx';

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

describe('formateos del feedlot', () => {
  it('fecha corta: día/mes, y el año si no es el de hoy', () => {
    expect(formatDiaMes('2026-12-28', '2026-11-19')).toBe('28/12');
    expect(formatDiaMes('2027-01-29', '2026-11-19')).toBe('29/01/27');
    expect(formatDiaMes(null, '2026-11-19')).toBe('—');
  });

  it('cuánto falta para la salida', () => {
    expect(textoFaltan(20)).toBe('en 20 d');
    expect(textoFaltan(0)).toBe('hoy');
    expect(textoFaltan(-3)).toBe('hace 3 d');
    expect(textoFaltan(null)).toBe('—');
  });

  it('metros de comedero por cabeza', () => {
    expect(formatMetros(0.3)).toBe('0,3 m');
    expect(formatMetros(1.6)).toBe('1,6 m');
    expect(formatMetros(null)).toBe('—');
  });
});

describe('opcionPotrero / queHayYUso (los selectores de potrero)', () => {
  const lotes = [
    { categoria: 'Vacas', cabezas: 80 },
    { categoria: 'Terneros', cabezas: 120 },
  ];

  it('nombre, qué hay por categoría y el uso', () => {
    const p = { nombre: '8.1', stock: { lotes }, usoActual: { nombre: 'Avena' } };
    expect(queHayYUso(p)).toBe('120 Terneros · 80 Vacas · Avena');
    expect(opcionPotrero(p)).toBe('8.1 · 120 Terneros · 80 Vacas · Avena');
    expect(opcionPotrero(p, 'A ')).toBe('A 8.1 · 120 Terneros · 80 Vacas · Avena');
  });

  it('vacío y sin uso', () => {
    expect(opcionPotrero({ nombre: 'C1', stock: null, usoActual: null })).toBe('C1 · vacío · sin uso');
  });

  it('un potrero que vino sin esos datos muestra solo el nombre', () => {
    expect(opcionPotrero({ id: 1, nombre: 'O1' })).toBe('O1');
  });
});
