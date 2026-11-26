// Pasto de los potreros (26/11): lo puro.
import { describe, expect, it } from 'vitest';
import { ALTURAS, altura, diasCortos, hace, lecturasDe, ordenDescanso, ordenPasto, textoDescanso, textoMomento, textoPasto } from './pasto';

describe('la escala', () => {
  it('una sola para todos: Bajo, Medio y Alto, con los cm', () => {
    expect(ALTURAS.map((a) => [a.valor, a.nombre, a.ayuda])).toEqual([
      ['BAJO', 'Bajo', 'menos de 10 cm'],
      ['MEDIO', 'Medio', 'de 10 a 20 cm'],
      ['ALTO', 'Alto', 'más de 20 cm'],
    ]);
    expect(altura('MEDIO').letra).toBe('M');
    expect(altura('OTRA')).toBeNull();
  });
});

describe('textos', () => {
  it('hace: hoy, ayer, hace N días', () => {
    expect(hace('2026-11-26', '2026-11-26')).toBe('hoy');
    expect(hace('2026-11-25', '2026-11-26')).toBe('ayer');
    expect(hace('2026-11-20', '2026-11-26')).toBe('hace 6 días');
  });

  it('textoPasto: la altura y hace cuánto', () => {
    expect(textoPasto({ altura: 'ALTO', fecha: '2026-11-23' }, '2026-11-26')).toBe('Alto · hace 3 días');
    expect(textoPasto(null, '2026-11-26')).toBeNull();
  });

  it('textoMomento', () => {
    expect(textoMomento('ENTRADA')).toBe('al entrar');
    expect(textoMomento('SALIDA')).toBe('al salir');
    expect(textoMomento('RECORRIDA')).toBe('en una recorrida');
  });

  it('descanso: vacío, con ganado y "más de" cuando no se sabe desde cuándo', () => {
    expect(textoDescanso({ conGanado: false, dias: 12, masDe: false })).toBe('descansa hace 12 días');
    expect(textoDescanso({ conGanado: false, dias: 13, masDe: true })).toBe('descansa hace más de 13 días');
    expect(textoDescanso({ conGanado: true, dias: 1, masDe: false })).toBe('con ganado hace 1 día');
    expect(textoDescanso(null)).toBeNull();
    expect(diasCortos({ dias: 12, masDe: false })).toBe('12 d');
    expect(diasCortos({ dias: 13, masDe: true })).toBe('+13 d');
  });
});

describe('orden y lecturas', () => {
  it('ordenPasto: Bajo < Medio < Alto; sin dato, null', () => {
    expect([ordenPasto({ altura: 'BAJO' }), ordenPasto({ altura: 'MEDIO' }), ordenPasto({ altura: 'ALTO' }), ordenPasto(null)]).toEqual([1, 2, 3, null]);
  });

  it('ordenDescanso: primero los que descansan hace más, después los que tienen ganado', () => {
    const lista = [
      { n: 'con ganado 2', d: { conGanado: true, dias: 2 } },
      { n: 'descansa 5', d: { conGanado: false, dias: 5 } },
      { n: 'descansa 30', d: { conGanado: false, dias: 30 } },
      { n: 'con ganado 40', d: { conGanado: true, dias: 40 } },
      { n: 'recién vacío', d: { conGanado: false, dias: 0 } },
    ];
    const orden = [...lista].sort((a, b) => ordenDescanso(b.d) - ordenDescanso(a.d)).map((x) => x.n);
    expect(orden).toEqual(['descansa 30', 'descansa 5', 'recién vacío', 'con ganado 2', 'con ganado 40']);
    expect(ordenDescanso(null)).toBeNull();
  });

  it('lecturasDe: solo los potreros marcados', () => {
    expect(lecturasDe({ 1: 'BAJO', 2: '', 3: 'ALTO' })).toEqual([
      { potreroId: 1, altura: 'BAJO' },
      { potreroId: 3, altura: 'ALTO' },
    ]);
    expect(lecturasDe({})).toEqual([]);
  });
});
