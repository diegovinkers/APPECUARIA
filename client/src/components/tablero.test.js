import { describe, expect, it } from 'vitest';
import { SECCIONES_TABLERO, accionDeGrupo, armarTablero, avance, avisoDeSeccion, ordenarGrupos, textoDeOrigen, textoEstadoGrupo, textoVieneDe } from './tablero';

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
    expect(t.totales).toEqual({ iatf: 0, embriones: 0, entore: 20, prenadas: 150, cria: 0 });
    // Cuántas vienen de IATF en cada sección (van con otro color).
    expect(t.deIatf).toEqual({ iatf: 0, embriones: 0, entore: 20, prenadas: 0, cria: 0 });
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

describe('ordenarGrupos (la tabla de una sección, 25/11)', () => {
  const g = (nombre, cabezas, fecha, potreros = []) => ({ proceso: { nombre }, cabezas, potreros, proxima: fecha ? { fecha } : null });
  const grupos = [g('B', 10, '2026-12-01', ['P9']), g('A', 50, null, ['P10']), g('C', 30, '2026-11-01', ['P2'])];
  const nombres = (lista) => lista.map((x) => x.proceso.nombre);

  it('por defecto, lo que vence primero; sin fecha, al final (también al revés)', () => {
    expect(nombres(ordenarGrupos(grupos))).toEqual(['C', 'B', 'A']);
    expect(nombres(ordenarGrupos(grupos, { col: 'proxima', dir: 'desc' }))).toEqual(['B', 'C', 'A']);
  });

  it('por proceso, por cabezas y por potrero (P2 antes que P10)', () => {
    expect(nombres(ordenarGrupos(grupos, { col: 'proceso' }))).toEqual(['A', 'B', 'C']);
    expect(nombres(ordenarGrupos(grupos, { col: 'cabezas', dir: 'desc' }))).toEqual(['A', 'C', 'B']);
    expect(nombres(ordenarGrupos(grupos, { col: 'potreros' }))).toEqual(['C', 'B', 'A']);
  });

  it('no cambia la lista que recibe', () => {
    ordenarGrupos(grupos, { col: 'proceso' });
    expect(nombres(grupos)).toEqual(['B', 'A', 'C']);
  });
});

describe('avisoDeSeccion (lo que dice una sección cerrada, 25/11)', () => {
  const g = (tipo, proxima) => ({ tipo, proxima });
  const prox = (nombre, fecha, estado, dias) => ({ nombre, fecha, estado, dias });

  it('lo que viene antes, con los días', () => {
    const grupos = [g('PRENADAS', prox('Parición', '2027-09-01', 'PENDIENTE', 290)), g('PRENADAS', prox('Parición', '2027-08-20', 'PENDIENTE', 281))];
    expect(avisoDeSeccion(grupos)).toEqual({ texto: 'Parición: faltan 281 días', estado: 'PENDIENTE' });
  });

  it('lo atrasado primero, aunque haya algo antes sin atrasar', () => {
    const grupos = [g('VIENTRES', prox('Fin del entore', '2026-11-01', 'PROXIMA', 3)), g('VIENTRES', prox('Ecografía', '2026-11-20', 'ATRASADA', -2))];
    expect(avisoDeSeccion(grupos)).toEqual({ texto: 'Ecografía: atrasada 2 días', estado: 'ATRASADA' });
  });

  it('varios atrasados: cuántos y el más atrasado', () => {
    const grupos = [g('VIENTRES', prox('Ecografía', '2026-11-20', 'ATRASADA', -5)), g('VIENTRES', prox('Ecografía', '2026-11-23', 'ATRASADA', -2))];
    expect(avisoDeSeccion(grupos)).toEqual({ texto: '2 grupos atrasados · Ecografía, atrasada 5 días', estado: 'ATRASADA' });
  });

  it('sin fechas, qué falta; sin grupos, nada', () => {
    expect(avisoDeSeccion([g('VACIAS_A_DECIDIR', null)])).toEqual({ texto: 'Vacías: falta decidir', estado: null });
    expect(avisoDeSeccion([])).toBeNull();
  });
});

describe('textoEstadoGrupo (reglas del campo, 25/11)', () => {
  it('en servicio, con el tipo; si el diagnóstico quedó a medias, las sin ecografiar', () => {
    expect(textoEstadoGrupo({ tipo: 'VIENTRES' }, 'IATF')).toBe('En servicio · Inseminación');
    expect(textoEstadoGrupo({ tipo: 'VIENTRES' }, 'TOROS')).toBe('En servicio · Entore');
    expect(textoEstadoGrupo({ tipo: 'VIENTRES', aMedias: 'Diagnóstico a medias: faltan 23' }, 'IATF')).toBe('Sin ecografiar · faltan 23');
    expect(textoEstadoGrupo({ tipo: 'PRENADAS', aMedias: 'Diagnóstico a medias: faltan 23' }, 'IATF')).toBe('Preñadas');
  });
});

describe('transferencia de embriones en el tablero (26/11)', () => {
  it('Embriones tiene su sección, aparte de la IATF (27/11)', () => {
    expect(SECCIONES_TABLERO.map((s) => s.nombre)).toEqual(['Inseminación', 'Embriones', 'Entore', 'Preñadas', 'Con cría al pie']);
    const t = armarTablero([
      { id: 1, nombre: 'TE', modalidad: 'TE', grupos: [{ seccion: 'iatf', tipo: 'VIENTRES', cabezas: 80 }] },
      { id: 2, nombre: 'IATF', modalidad: 'IATF', grupos: [{ seccion: 'iatf', tipo: 'VIENTRES', cabezas: 50 }] },
      { id: 3, nombre: 'TE preñadas', modalidad: 'TE', grupos: [{ seccion: 'prenadas', tipo: 'PRENADAS', cabezas: 30 }] },
    ]);
    expect(t.embriones.map((g) => g.proceso.nombre)).toEqual(['TE']);
    expect(t.iatf.map((g) => g.proceso.nombre)).toEqual(['IATF']);
    // Las preñadas de embriones van a Preñadas, como las de la IATF.
    expect(t.totales).toMatchObject({ iatf: 50, embriones: 80, prenadas: 30 });
  });

  it('lo que pasa al toro dice de dónde viene, y el total de la sección lo separa', () => {
    expect(textoVieneDe({ vieneDe: 'TE' })).toBe('de embriones');
    expect(textoVieneDe({ vieneDe: 'IATF' })).toBe('viene de IATF');
    expect(textoVieneDe({})).toBe('viene de IATF');
    const t = armarTablero([
      { id: 1, nombre: 'TE', modalidad: 'TE', grupos: [{ seccion: 'entore', tipo: 'VACIAS_REENTORE', cabezas: 23, deIatf: true, vieneDe: 'TE' }] },
      { id: 2, nombre: 'IATF', modalidad: 'IATF', grupos: [{ seccion: 'entore', tipo: 'VACIAS_REENTORE', cabezas: 12, deIatf: true, vieneDe: 'IATF' }] },
    ]);
    expect(t.deIatf.entore).toBe(35);
    expect(t.deOrigen.entore).toEqual({ IATF: 12, TE: 23 });
    expect(textoDeOrigen(t.deOrigen.entore)).toBe('12 de IATF · 23 de embriones');
    expect(textoDeOrigen({ IATF: 0, TE: 23 })).toBe('23 de embriones');
    expect(textoDeOrigen(undefined)).toBe('');
  });

  it('el estado de los grupos de una transferencia', () => {
    expect(textoEstadoGrupo({ tipo: 'VIENTRES' }, 'TE')).toBe('En servicio · Embriones');
    expect(textoEstadoGrupo({ tipo: 'VACIAS_REENTORE' }, 'TE')).toBe('Al toro: no aptas o vacías');
    expect(textoEstadoGrupo({ tipo: 'VACIAS_REENTORE' }, 'IATF')).toBe('Vacías para volver a servir');
  });
});
