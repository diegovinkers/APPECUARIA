import { describe, expect, it } from 'vitest';
import { paginar, paginasVisibles } from './tabla.jsx';

describe('paginasVisibles', () => {
  it('con 7 páginas, como pidió Diego', () => {
    const en = (p) => paginasVisibles(p, 7);
    expect(en(1)).toEqual([1, 2, 3, '…', 7]);
    expect(en(2)).toEqual([1, 2, 3, '…', 7]);
    expect(en(3)).toEqual([1, 2, 3, 4, '…', 7]);
    expect(en(4)).toEqual([1, '…', 3, 4, 5, '…', 7]);
    expect(en(5)).toEqual([1, '…', 4, 5, 6, 7]);
    expect(en(6)).toEqual([1, '…', 5, 6, 7]);
    expect(en(7)).toEqual([1, '…', 5, 6, 7]);
  });

  it('con pocas páginas, todas seguidas; con una sola, nada', () => {
    expect(paginasVisibles(1, 3)).toEqual([1, 2, 3]);
    expect(paginasVisibles(2, 2)).toEqual([1, 2]);
    expect(paginasVisibles(1, 1)).toEqual([]);
  });
});

describe('paginar', () => {
  const filas = Array.from({ length: 120 }, (_, i) => i + 1);

  it('de a 50 filas', () => {
    const p = paginar(filas, 3);
    expect(p.filas).toEqual(filas.slice(100));
    expect(p).toMatchObject({ pagina: 3, total: 3, desde: 101, hasta: 120 });
  });

  it('una página fuera de rango se ajusta', () => {
    expect(paginar(filas, 9).pagina).toBe(3);
    expect(paginar([], 2)).toMatchObject({ pagina: 1, total: 1, desde: 0, hasta: 0 });
  });
});
