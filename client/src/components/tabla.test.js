import { describe, expect, it } from 'vitest';
import { paginar, paginasVisibles } from './tabla.jsx';

describe('paginasVisibles', () => {
  it('en la 1 de 100: las 5 siguientes, el 30%, el 50% y la última', () => {
    expect(paginasVisibles(1, 100)).toEqual([1, 2, 3, 4, 5, 6, '…', 30, '…', 50, '…', 100]);
  });

  it('los saltos se cuentan desde donde estás, y la 1 siempre está', () => {
    expect(paginasVisibles(40, 100)).toEqual([1, '…', 40, 41, 42, 43, 44, 45, '…', 69, '…', 89, '…', 100]);
  });

  it('cerca del final, los saltos que se pasan no aparecen', () => {
    expect(paginasVisibles(97, 100)).toEqual([1, '…', 97, 98, 99, 100]);
  });

  it('con pocas páginas, todas seguidas', () => {
    expect(paginasVisibles(1, 4)).toEqual([1, 2, 3, 4]);
    expect(paginasVisibles(1, 1)).toEqual([]);
  });

  it('con 20 páginas, el salto del 30% cae dentro de las siguientes y no se repite', () => {
    expect(paginasVisibles(1, 20)).toEqual([1, 2, 3, 4, 5, 6, '…', 10, '…', 20]);
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
