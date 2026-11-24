import { describe, expect, it } from 'vitest';
import { accionDeGrupo, armarTablero, avance } from './tablero';

describe('armarTablero', () => {
  it('junta los grupos por sección, con el total de cabezas, y ordena por lo que vence primero', () => {
    const t = armarTablero([
      { id: 1, nombre: 'B', grupos: [{ seccion: 'prenadas', tipo: 'PRENADAS', cabezas: 100, proxima: { fecha: '2026-12-01' } }] },
      {
        id: 2,
        nombre: 'A',
        grupos: [
          { seccion: 'prenadas', tipo: 'PRENADAS', cabezas: 50, proxima: { fecha: '2026-10-01' } },
          { seccion: 'entore', tipo: 'VACIAS_REENTORE', cabezas: 20, proxima: null, deIatf: true },
        ],
      },
      { id: 3, nombre: 'C' },
    ]);
    expect(t.prenadas.map((g) => g.proceso.nombre)).toEqual(['A', 'B']);
    expect(t.totales).toEqual({ iatf: 0, entore: 20, prenadas: 150, cria: 0 });
    // Cuántas vienen de IATF en cada sección (van con otro color).
    expect(t.deIatf).toEqual({ iatf: 0, entore: 20, prenadas: 0, cria: 0 });
    expect(t.entore[0].clave).toBe('2-VACIAS_REENTORE-iatf');
  });
});

describe('avance', () => {
  it('lo que pasó del tiempo estimado, entre 0 y 1', () => {
    expect(avance('2026-01-01', '2026-01-11', '2026-01-06')).toBe(0.5);
    expect(avance('2026-01-01', '2026-01-11', '2025-12-01')).toBe(0);
    expect(avance('2026-01-01', '2026-01-11', '2026-02-01')).toBe(1);
    expect(avance(null, '2026-01-11', '2026-01-06')).toBeNull();
  });
});

describe('accionDeGrupo', () => {
  it('vacías para volver a servir → empezar el entore; sin decidir → decidir; el resto, la etapa que viene', () => {
    expect(accionDeGrupo(4, { tipo: 'VACIAS_REENTORE' })).toEqual({ texto: 'Empezar el entore', ruta: '/pecuaria/procesos/nuevo?desde=4' });
    expect(accionDeGrupo(4, { tipo: 'VACIAS_A_DECIDIR' })).toEqual({ texto: 'Decidir', ruta: '/pecuaria/procesos/4/etapa/DECISION' });
    expect(accionDeGrupo(4, { tipo: 'PRENADAS', proxima: { etapa: 'PARICION' } })).toEqual({ texto: 'Registrar parición', ruta: '/pecuaria/procesos/4/etapa/PARICION' });
    expect(accionDeGrupo(4, { tipo: 'PARIDAS', proxima: { etapa: 'DESTETE' } }).texto).toBe('Destetar');
    expect(accionDeGrupo(4, { tipo: 'PARIDAS', proxima: null })).toBeNull();
  });
});
