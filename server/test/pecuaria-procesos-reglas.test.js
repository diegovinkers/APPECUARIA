// Procesos con las reglas del campo (25/11), fase 1: las cuentas puras.
//   R1  al separar, una de las partes cambia de potrero (planDecision, partesJuntas)
//   R4  las vacías siempre tienen destino; el diagnóstico a medias (etapaActual)
//   R5  nunca dos entores seguidos (planDecision)
//   R8  vacas y terneros por potrero
//   R10 avisos por mezcla
import { describe, expect, it } from 'vitest';
import {
  NO_REENTORE,
  diagnosticoAMedias,
  etapaActual,
  partesJuntas,
  planDecision,
  vacasYTernerosPorPotrero,
} from '../src/pecuaria/procesos.calculos.js';
import { avisosDeMezcla, grupoDeManejo } from '../src/pecuaria/mezcla.js';

const ancla = (etapa, loteId, fecha, cabezas, datos = {}, anulado = false) => ({ etapa, loteId, fecha, cabezas, datos, anulado });

describe('R1: al separar, una de las partes cambia de potrero', () => {
  // 100 Vacas de cría (categoría 1) en P8.
  const lote = { id: 10, cabezas: 100, categoriaId: 1, potreroId: 8 };
  const engorde = { invernada: true, potreroId: 9 };

  it('preñadas y vacías en el mismo potrero: error', () => {
    const r = planDecision({
      lote,
      separar: true,
      modalidad: 'IATF',
      grupos: [
        { clave: 'sin', cabezas: 80 },
        { clave: 'vacias', cabezas: 20, clase: 'VACIAS', destino: { invernada: true, potreroId: 8 }, categoriaId: 3 },
      ],
    });
    expect(r.error).toMatch(/Preñadas y vacías para engorde no pueden quedar en el mismo potrero/);
  });

  it('anda si se van las vacías, si se van las preñadas o si se van las dos a potreros distintos', () => {
    const se = (prenadas, vacias) =>
      planDecision({
        lote,
        separar: true,
        modalidad: 'IATF',
        grupos: [
          { clave: 'sin', cabezas: 80, destino: { potreroId: prenadas } },
          { clave: 'vacias', cabezas: 20, clase: 'VACIAS', destino: { invernada: true, potreroId: vacias }, categoriaId: 3 },
        ],
      });
    expect(se(8, 9).error).toBeUndefined();
    expect(se(12, 8).error).toBeUndefined();
    expect(se(12, 9).error).toBeUndefined();
    expect(se(12, 12).error).toMatch(/no pueden quedar en el mismo potrero/);
    // Se van las preñadas: el lote se queda con las vacías (en su potrero),
    // que pasan a la categoría de engorde.
    expect(se(12, 8)).toMatchObject({
      queda: ['vacias'],
      pasos: [
        { tipo: 'PARTE', grupos: ['sin'], cabezas: 80, potreroId: 12 },
        { tipo: 'CATEGORIA', grupos: ['vacias'], cabezas: 20, categoriaId: 3 },
      ],
    });
  });

  it('ecografía por partes: preñadas, vacías y sin ecografiar quedan en tres potreros', () => {
    const r = planDecision({
      lote,
      separar: true,
      modalidad: 'IATF',
      grupos: [
        { clave: 'sin', cabezas: 60, destino: { potreroId: 12 } },
        { clave: 'vacias', cabezas: 20, clase: 'VACIAS', destino: engorde, categoriaId: 3 },
      ],
    });
    expect(r.error).toBeUndefined();
    // Las 20 sin ecografiar se quedan en el lote, en P8.
    expect(r.queda).toEqual(['sinDiagnostico']);
    expect(r.bloques.map((b) => [b.clase, b.potreroId, b.cabezas])).toEqual([
      ['PRENADAS', 12, 60],
      ['VACIAS', 9, 20],
      ['SIN', 8, 20],
    ]);
    // Las preñadas no se pueden quedar con las sin ecografiar.
    const mal = planDecision({ lote, separar: true, modalidad: 'IATF', grupos: [{ clave: 'sin', cabezas: 60 }, { clave: 'vacias', cabezas: 20, clase: 'VACIAS', destino: engorde }] });
    expect(mal.error).toMatch(/Preñadas y sin ecografiar no pueden quedar/);
  });

  it('preñadas de varios meses: juntas en un potrero son un lote; separadas, cada una con su potrero', () => {
    const grupos = (p10, p11) => [
      { clave: '2027-10', cabezas: 50, destino: { potreroId: p10 } },
      { clave: '2027-11', cabezas: 30, destino: { potreroId: p11 } },
      { clave: 'vacias', cabezas: 20, clase: 'VACIAS', destino: engorde, categoriaId: 3 },
    ];
    const juntas = planDecision({ lote, separar: true, modalidad: 'IATF', grupos: grupos(12, 12) });
    expect(juntas.bloques.filter((b) => b.clase === 'PRENADAS').map((b) => b.grupos)).toEqual([['2027-10', '2027-11']]);
    const separadas = planDecision({ lote, separar: true, modalidad: 'IATF', grupos: grupos(12, 13) });
    expect(separadas.error).toBeUndefined();
    expect(separadas.bloques.filter((b) => b.clase === 'PRENADAS').map((b) => b.potreroId)).toEqual([12, 13]);
  });

  it('las vacías siempre tienen destino: entore o engorde', () => {
    const sinDestino = (destino) =>
      planDecision({ lote, separar: true, modalidad: 'IATF', grupos: [{ clave: 'sin', cabezas: 80, destino: { potreroId: 12 } }, { clave: 'vacias', cabezas: 20, clase: 'VACIAS', destino }] }).error;
    expect(sinDestino(undefined)).toMatch(/Elegí qué pasa con las vacías: entore con toros o engorde/);
    expect(sinDestino({ despues: true })).toMatch(/Elegí qué pasa con las vacías/);
    expect(sinDestino({ potreroId: 9 })).toMatch(/Elegí qué pasa con las vacías/);
    expect(sinDestino({ salen: true, potreroId: 9 })).toMatch(/Elegí qué pasa con las vacías/);
    expect(sinDestino({ reentore: true, potreroId: 9 })).toBeUndefined();
    expect(sinDestino({ invernada: true })).toBeUndefined();
  });

  it('vacías para entore y para engorde tampoco quedan juntas', () => {
    const r = planDecision({
      lote,
      separar: true,
      modalidad: 'IATF',
      grupos: [
        { clave: 'sin', cabezas: 80, destino: { potreroId: 12 } },
        { clave: 'vacias', cabezas: 12, clase: 'VACIAS', destino: { reentore: true, potreroId: 9 } },
        { clave: 'otras', cabezas: 8, clase: 'VACIAS', destino: { invernada: true, potreroId: 9 } },
      ],
    });
    expect(r.error).toMatch(/Vacías para el entore y vacías para engorde/);
  });

  it('sin separar (lo viejo), como antes', () => {
    const r = planDecision({ lote, grupos: [{ clave: 'sin', cabezas: 80 }, { clave: 'vacias', cabezas: 20, destino: { despues: true } }] });
    expect(r.error).toBeUndefined();
    expect(r.queda).toEqual(['sin']);
  });

  it('partesJuntas: las paridas, sus crías y las preñadas conviven; lo demás no', () => {
    expect(partesJuntas([{ estado: 'PARIDAS', potreroId: 1 }, { estado: 'CRIAS', potreroId: 1 }, { estado: 'PRENADAS', potreroId: 1 }])).toBeNull();
    expect(partesJuntas([{ estado: 'VIENTRES', potreroId: 1 }, { estado: 'SIN_SERVIR', potreroId: 1 }]).texto).toMatch(/^Servidas y sin inseminar no pueden/);
    expect(partesJuntas([{ estado: 'VIENTRES', potreroId: 1 }, { estado: 'SIN_SERVIR', potreroId: 2 }])).toBeNull();
    // El destete: terneros y vacas, cada uno con su nombre.
    expect(partesJuntas([{ estado: 'CRIAS', potreroId: 5, nombre: 'los terneros' }, { estado: 'LIBRES', potreroId: 5, nombre: 'las vacas' }]).texto).toMatch(/^Los terneros y las vacas no pueden/);
  });
});

describe('R5: nunca dos entores seguidos', () => {
  const lote = { id: 10, cabezas: 100, categoriaId: 1, potreroId: 8 };
  const grupos = [
    { clave: 'sin', cabezas: 80 },
    { clave: 'vacias', cabezas: 20, clase: 'VACIAS', destino: { reentore: true, potreroId: 9 } },
  ];

  it('las vacías de un entore no vuelven a entore; las de una IATF sí', () => {
    expect(planDecision({ lote, grupos, modalidad: 'TOROS' }).error).toBe(NO_REENTORE);
    expect(planDecision({ lote, grupos, modalidad: 'IATF' }).error).toBeUndefined();
    // Los procesos viejos con IA son IATF.
    expect(planDecision({ lote, grupos, modalidad: 'IA' }).error).toBeUndefined();
  });

  it('en un entore, las vacías sin destino piden engorde', () => {
    const r = planDecision({ lote, separar: true, modalidad: 'TOROS', grupos: [{ clave: 'sin', cabezas: 80, destino: { potreroId: 12 } }, { clave: 'vacias', cabezas: 20, clase: 'VACIAS' }] });
    expect(r.error).toMatch(/van a engorde/);
  });
});

describe('diagnóstico a medias', () => {
  const lotes = [
    { loteId: 1, rol: 'VIENTRES', activo: true, cabezas: 23 },
    { loteId: 2, rol: 'PRENADAS', activo: true, cabezas: 60 },
    { loteId: 3, rol: 'VACIAS', activo: true, cabezas: 20 },
  ];

  it('IATF: mientras quede un lote servido sin ecografiar, sigue esperando el diagnóstico', () => {
    const a = [ancla('INICIO', 1, '2026-11-01', 103, { modalidad: 'IATF' }), ancla('DIAGNOSTICO', 1, '2026-12-15', 80, { prenadas: { sin: 60 }, vacias: 20 })];
    expect(etapaActual(a, lotes)).toBe('ESPERA_DIAGNOSTICO');
    expect(diagnosticoAMedias(a, lotes)).toEqual({ lotes: 1, cabezas: 23, texto: 'Diagnóstico a medias: faltan 23' });
    // Se ecografiaron las que faltaban.
    const despues = lotes.map((l) => (l.loteId === 1 ? { ...l, activo: false } : l));
    expect(etapaActual(a, despues)).toBe('PRENEZ');
    expect(diagnosticoAMedias(a, despues)).toBeNull();
  });

  it('entore: un lote servido sin el fin del servicio no está "a medias"', () => {
    const a = [
      ancla('INICIO', 4, '2026-11-01', 50, { modalidad: 'TOROS' }),
      ancla('FIN_SERVICIO', 4, '2027-02-01', 50),
      ancla('DIAGNOSTICO', 4, '2027-03-01', 50, { prenadas: { sin: 40 }, vacias: 10 }),
    ];
    const conTanda = [
      { loteId: 4, rol: 'PRENADAS', activo: true },
      { loteId: 5, rol: 'VIENTRES', activo: true },
    ];
    expect(etapaActual(a, conTanda)).toBe('PRENEZ');
    // Con su fin del servicio, sí.
    a.push(ancla('FIN_SERVICIO', 5, '2027-03-05', 20));
    expect(etapaActual(a, conTanda)).toBe('ESPERA_DIAGNOSTICO');
    // Sin cabezas, cuenta lotes.
    expect(diagnosticoAMedias(a, conTanda).texto).toBe('Diagnóstico a medias: faltan 1 lote');
  });

  it('sin diagnóstico no hay "a medias"; los anulados no cuentan', () => {
    const a = [ancla('INICIO', 1, '2026-11-01', 103, { modalidad: 'IATF' }), ancla('DIAGNOSTICO', 1, '2026-12-15', 80, {}, true)];
    expect(diagnosticoAMedias(a, lotes)).toBeNull();
    expect(etapaActual(a, lotes)).toBe('SERVICIO');
  });
});

describe('R8: vacas y terneros por potrero', () => {
  it('"P12: 40 vacas (25 paridas · 15 preñadas) · 24 terneros"', () => {
    const r = vacasYTernerosPorPotrero([
      { rol: 'PARIDAS', cabezas: 25, potreroId: 12, potrero: 'P12' },
      { rol: 'PRENADAS', cabezas: 15, potreroId: 12, potrero: 'P12' },
      { rol: 'CRIAS', cabezas: 24, potreroId: 12, potrero: 'P12' },
      { rol: 'PRENADAS', cabezas: 30, potreroId: 3, potrero: 'P3' },
      { rol: 'LIBRES', cabezas: 9, potreroId: 3, potrero: 'P3' },
      { rol: 'PARIDAS', cabezas: 1, potreroId: 20, potrero: 'P20' },
      { rol: 'CRIAS', cabezas: 1, potreroId: 20, potrero: 'P20' },
    ]);
    expect(r.map((p) => p.texto)).toEqual(['P3: 30 preñadas', 'P12: 40 vacas (25 paridas · 15 preñadas) · 24 terneros', 'P20: 1 parida · 1 ternero']);
    expect(r[1]).toMatchObject({ vacas: 40, paridas: 25, prenadas: 15, terneros: 24 });
  });

  it('sin animales o sin roles de cría, nada', () => {
    expect(vacasYTernerosPorPotrero([{ rol: 'PARIDAS', cabezas: 0, potreroId: 1, potrero: 'P1' }, { rol: 'LIBRES', cabezas: 5, potreroId: 1, potrero: 'P1' }])).toEqual([]);
  });
});

describe('R10: avisos por mezcla', () => {
  it('grupos de manejo por nombre, con su Wagyu', () => {
    expect(grupoDeManejo('Vacas de cría Wagyu')).toBe('VIENTRES');
    expect(grupoDeManejo('Vaquillonas +2 preñadas')).toBe('VIENTRES');
    expect(grupoDeManejo('VACAS PARIDAS')).toBe('CRIA');
    expect(grupoDeManejo('Vacas invernar Wagyu')).toBe('ENGORDE_HEMBRAS');
    expect(grupoDeManejo('Novillos 2-3')).toBe('ENGORDE_MACHOS');
    expect(grupoDeManejo('Novillos Wagyu 1-2')).toBe('ENGORDE_MACHOS');
    expect(grupoDeManejo('Vaquillonas')).toBe('RECRIA');
    expect(grupoDeManejo('Terneras Wagyu')).toBe('DESTETADOS');
    expect(grupoDeManejo('Toros puros Angus')).toBe('TOROS');
    expect(grupoDeManejo('Caballos')).toBeNull();
  });

  it('lo más importante: dos estados del mismo proceso, aunque sean de la misma categoría', () => {
    const proceso = { id: 1, nombre: 'Servicio 26-27 · Vacas' };
    const avisos = avisosDeMezcla(
      [
        { categoria: 'Vacas de cría', rol: 'PRENADAS', proceso },
        { categoria: 'Vacas de cría', rol: 'VACIAS', proceso },
      ],
      { potrero: 'P8' },
    );
    expect(avisos).toEqual(['En P8 quedan juntas preñadas y vacías de "Servicio 26-27 · Vacas": en el campo no se van a poder distinguir']);
    // Paridas, crías y preñadas conviven; de procesos distintos no se compara el estado.
    expect(avisosDeMezcla([{ categoria: 'Vacas paridas', rol: 'PARIDAS', proceso }, { categoria: 'Terneros/as', rol: 'CRIAS', proceso }, { categoria: 'Vacas de cría', rol: 'PRENADAS', proceso }])).toEqual([]);
    expect(avisosDeMezcla([{ categoria: 'Vacas de cría', rol: 'PRENADAS', proceso }, { categoria: 'Vacas de cría', rol: 'VACIAS', proceso: { id: 2 } }])).toEqual([]);
    // Las que salieron del proceso no cuentan.
    expect(avisosDeMezcla([{ categoria: 'Vacas de cría', rol: 'PRENADAS', proceso }, { categoria: 'Vacas de cría', rol: 'LIBRES', proceso }])).toEqual([]);
  });

  it('por categoría, según los grupos de manejo', () => {
    const juntos = (...categorias) => avisosDeMezcla(categorias.map((categoria) => ({ categoria })));
    // Sin aviso.
    expect(juntos('Vacas paridas', 'Terneros chicos', 'Terneras chicas', 'Vaquillonas +2 preñadas')).toEqual([]);
    expect(juntos('Vacas de cría', 'Vacas de cría Wagyu', 'Vaquillonas 1-2')).toEqual([]);
    expect(juntos('Vacas invernar', 'Vacas CUT')).toEqual([]);
    expect(juntos('Novillos 1-2', 'Novillos 2-3', 'Terneros')).toEqual([]);
    expect(juntos('Terneras', 'Terneras Wagyu')).toEqual([]);
    expect(juntos('Vaquillonas', 'Vaquillonas')).toEqual([]);
    expect(juntos('Caballos', 'Novillos')).toEqual([]);
    // Con aviso.
    expect(juntos('Novillos 1-2', 'Vacas de cría')).toEqual(['Quedan juntos Novillos 1-2 y Vacas de cría: no se suelen mezclar (engorde de machos con vientres)']);
    expect(juntos('Terneros', 'Terneras')).toHaveLength(1);
    expect(juntos('Novillos', 'Terneras')).toHaveLength(1);
    expect(juntos('Vaquillonas', 'Toros')).toHaveLength(1);
    expect(juntos('Vacas paridas', 'Vacas invernar')).toHaveLength(1);
    expect(juntos('Vacas de cría', 'Terneros')).toHaveLength(1);
    expect(juntos('Vacas invernar', 'Terneras')).toHaveLength(1);
  });

  it('primero el aviso de estados, después los de categoría', () => {
    const proceso = { id: 1, nombre: 'IATF' };
    const avisos = avisosDeMezcla(
      [
        { categoria: 'Vacas de cría', rol: 'VIENTRES', proceso },
        { categoria: 'Vacas de cría', rol: 'SIN_SERVIR', proceso },
        { categoria: 'Novillos' },
      ],
      { potrero: 'P8' },
    );
    expect(avisos[0]).toMatch(/^En P8 quedan juntas servidas y sin inseminar de "IATF"/);
    expect(avisos[1]).toMatch(/^En P8 quedan juntos Vacas de cría y Novillos/);
  });
});
