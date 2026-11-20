// Procesos (diseño docs/superpowers/specs/2026-11-20-procesos-design.md): las
// cuentas puras. Campaña, meses de parición esperados, etapa actual, próximas
// fechas, embudo, categoría sugerida y el plan de la decisión del diagnóstico.
import { describe, expect, it } from 'vitest';
import {
  campaniaDe,
  embudo,
  etapaActual,
  mesesEsperados,
  planDecision,
  proximas,
  sugerirCategoria,
  textoMeses,
} from '../src/pecuaria/procesos.calculos.js';
import { ETAPAS_UNICAS, PLANTILLAS, etapaDe } from '../src/pecuaria/procesos.plantillas.js';

const PARAMETROS = { gestacionDias: 283, diagnosticoDesdeDias: 45, desteteEdadDias: 180 };

// Un ancla: { etapa, loteId, fecha, cabezas, datos, anulado }.
const ancla = (etapa, loteId, fecha, cabezas, datos = {}, anulado = false) => ({ etapa, loteId, fecha, cabezas, datos, anulado });

describe('plantilla del reproductivo', () => {
  it('tiene las etapas en orden, y las únicas son las del índice de la base', () => {
    expect(PLANTILLAS.REPRODUCTIVO.etapas.map((e) => e.clave)).toEqual([
      'INICIO',
      'REPASO',
      'FIN_SERVICIO',
      'DIAGNOSTICO',
      'REVISION',
      'ABORTO',
      'PARICION',
      'FIN_PARICION',
      'DESTETE',
    ]);
    expect([...ETAPAS_UNICAS].sort()).toEqual(['DESTETE', 'DIAGNOSTICO', 'FIN_PARICION', 'FIN_SERVICIO', 'INICIO', 'REPASO', 'REVISION']);
  });

  it('un evento suelto de reproducción toma su etapa según lo que ya tiene el lote', () => {
    expect(etapaDe('ENTORE', [])).toBe('INICIO');
    expect(etapaDe('INSEMINACION', [])).toBe('INICIO');
    expect(etapaDe('ENTORE', ['INICIO'])).toBe('REPASO');
    expect(etapaDe('FIN_SERVICIO', ['INICIO'])).toBe('FIN_SERVICIO');
    expect(etapaDe('ECOGRAFIA', ['INICIO'])).toBe('DIAGNOSTICO');
    expect(etapaDe('ECOGRAFIA', ['INICIO', 'DIAGNOSTICO'])).toBe('REVISION');
    expect(etapaDe('ABORTO', ['DIAGNOSTICO'])).toBe('ABORTO');
    expect(etapaDe('VACUNA_AFTOSA', [])).toBeNull();
  });
});

describe('campaña y meses esperados', () => {
  it('la campaña va de julio a junio', () => {
    expect(campaniaDe('2026-11-20')).toBe('2026-27');
    expect(campaniaDe('2027-03-01')).toBe('2026-27');
    expect(campaniaDe('2027-07-01')).toBe('2027-28');
  });

  it('con 283 días: un servicio del 01/01 al 15/03 pare de octubre a diciembre', () => {
    expect(mesesEsperados({ inicio: '2027-01-01', fin: '2027-03-15' }, 283)).toEqual(['2027-10', '2027-11', '2027-12']);
    // IATF sola: un solo mes.
    expect(mesesEsperados({ inicio: '2027-01-01', fin: '2027-01-01' }, 283)).toEqual(['2027-10']);
    expect(textoMeses(['2027-10', '2027-11', '2027-12'])).toBe('oct–dic');
    expect(textoMeses(['2027-10'])).toBe('oct');
  });
});

describe('etapa actual', () => {
  const lotes = [
    { loteId: 1, rol: 'VACIAS', activo: true },
    { loteId: 2, rol: 'PRENADAS', activo: true },
    { loteId: 3, rol: 'CRIAS', activo: true },
  ];

  it('avanza con los anclas, sin contar los anulados', () => {
    const a = [ancla('INICIO', 1, '2027-01-01', 50)];
    expect(etapaActual(a, lotes)).toBe('SERVICIO');
    a.push(ancla('FIN_SERVICIO', 1, '2027-03-15', 50));
    expect(etapaActual(a, lotes)).toBe('ESPERA_DIAGNOSTICO');
    a.push(ancla('DIAGNOSTICO', 1, '2027-04-30', 50, { prenadas: { '2027-10': 40 }, vacias: 10 }, true));
    expect(etapaActual(a, lotes)).toBe('ESPERA_DIAGNOSTICO');
    a.push(ancla('DIAGNOSTICO', 1, '2027-04-30', 50, { prenadas: { '2027-10': 40 }, vacias: 10 }));
    expect(etapaActual(a, lotes)).toBe('PRENEZ');
    a.push(ancla('PARICION', 2, '2027-10-12', 6, { madres: 6, machos: 3, hembras: 3, muertos: 0, madresMuertas: 0 }));
    expect(etapaActual(a, lotes)).toBe('PARICION');
    a.push(ancla('FIN_PARICION', 2, '2028-01-10', 0, { falladas: 0 }));
    expect(etapaActual(a, lotes)).toBe('CRIA');
    a.push(ancla('DESTETE', 3, '2028-04-10', 6, { destetados: 6 }));
    expect(etapaActual(a, lotes)).toBe('TERMINADO');
  });

  it('sin el fin de la parición, si ya no quedan preñadas activas, también es cría', () => {
    const a = [ancla('INICIO', 1, '2027-01-01', 50), ancla('PARICION', 2, '2027-10-12', 6, { madres: 6 })];
    expect(etapaActual(a, [{ loteId: 2, rol: 'PRENADAS', activo: false }, { loteId: 3, rol: 'CRIAS', activo: true }])).toBe('CRIA');
  });
});

describe('próximas fechas', () => {
  const servicio = [ancla('INICIO', 1, '2027-01-01', 50), ancla('FIN_SERVICIO', 1, '2027-03-15', 50)];

  it('el diagnóstico se espera desde el fin + 45 días; se atrasa a los 120', () => {
    expect(proximas({ anclas: servicio, lotes: [], parametros: PARAMETROS, hoy: '2027-04-01' })).toMatchObject({
      etapa: 'DIAGNOSTICO',
      desde: '2027-04-29',
      atrasada: false,
      texto: 'diag. desde 29/04',
    });
    expect(proximas({ anclas: servicio, lotes: [], parametros: PARAMETROS, hoy: '2027-08-01' }).atrasada).toBe(true);
  });

  it('después del diagnóstico, la parición esperada por meses; después de parir, el destete', () => {
    const diag = [...servicio, ancla('DIAGNOSTICO', 1, '2027-04-30', 50, { prenadas: { sin: 40 }, vacias: 10 })];
    const lotes = [{ loteId: 1, rol: 'PRENADAS', activo: true }];
    expect(proximas({ anclas: diag, lotes, parametros: PARAMETROS, hoy: '2027-05-01' })).toMatchObject({
      etapa: 'PARICION',
      desde: '2027-10-11',
      texto: 'parición oct–dic',
      atrasada: false,
    });
    const cria = [...diag, ancla('PARICION', 1, '2027-10-11', 40, { madres: 40, machos: 20, hembras: 20 }), ancla('FIN_PARICION', 1, '2028-01-05', 0)];
    expect(proximas({ anclas: cria, lotes: [{ loteId: 2, rol: 'CRIAS', activo: true }], parametros: PARAMETROS, hoy: '2028-01-10' })).toMatchObject({
      etapa: 'DESTETE',
      desde: '2028-04-08',
      texto: 'destete desde abr',
      atrasada: false,
    });
  });
});

describe('embudo', () => {
  const anclas = [
    ancla('INICIO', 1, '2027-01-01', 50),
    ancla('DIAGNOSTICO', 1, '2027-04-30', 50, { prenadas: { '2027-10': 18, '2027-11': 15, '2027-12': 7 }, vacias: 10 }),
    ancla('PARICION', 2, '2027-10-12', 20, { madres: 20, machos: 10, hembras: 9, muertos: 1, madresMuertas: 0 }),
    ancla('PARICION', 3, '2027-11-12', 18, { madres: 18, machos: 9, hembras: 9, muertos: 0, madresMuertas: 0 }),
    ancla('DESTETE', 4, '2028-04-10', 19, { destetados: 19, pesoPromedioKg: 180 }),
    ancla('DESTETE', 5, '2028-04-10', 17, { destetados: 17, pesoPromedioKg: 180 }),
  ];

  it('servidas → preñadas → paridas → destetados, con los porcentajes sobre las servidas', () => {
    expect(embudo(anclas, [])).toMatchObject({
      servidas: 50,
      diagnosticadas: 50,
      prenadas: 40,
      vacias: 10,
      paridas: 38,
      ternerosVivos: 37,
      nacidosMuertos: 1,
      destetados: 36,
      kgDestetados: 6480,
      porcentajes: { prenez: 80, paricion: 74, destete: 72 },
      corto: '50 → 40 → 38 → 36',
    });
  });

  it('lo que no pasó todavía va con raya; los anulados no cuentan', () => {
    expect(embudo([ancla('INICIO', 1, '2027-01-01', 50), ancla('DIAGNOSTICO', 1, '2027-04-30', 50, { prenadas: { sin: 40 }, vacias: 10 }, true)], [])).toMatchObject({
      servidas: 50,
      prenadas: null,
      porcentajes: { prenez: null, paricion: null, destete: null },
      corto: '50 → — → — → —',
    });
  });

  it('la revisión corrige el diagnóstico; los abortos y las muertes de crías son pérdidas aparte', () => {
    const a = [
      ancla('INICIO', 1, '2027-01-01', 50),
      ancla('DIAGNOSTICO', 1, '2027-04-30', 50, { prenadas: { sin: 40 }, vacias: 10 }),
      ancla('REVISION', 1, '2027-05-20', 10, { aPrenadas: 2, aVacias: 0 }),
      ancla('ABORTO', 2, '2027-07-01', 1),
    ];
    const r = embudo(a, [{ tipo: 'MUERTE', cabezas: 1, rol: 'CRIAS', revertido: false }, { tipo: 'MUERTE', cabezas: 5, rol: 'CRIAS', revertido: true }]);
    expect(r).toMatchObject({ prenadas: 42, vacias: 8, abortos: 1, muertesCrias: 1 });
  });

  it('una ecografía anotada suelta (preñadas como número) también cuenta', () => {
    const a = [ancla('INICIO', 1, '2027-01-01', 50), ancla('DIAGNOSTICO', 1, '2027-04-30', 50, { prenadas: 40, vacias: 10 })];
    expect(embudo(a, [])).toMatchObject({ prenadas: 40, vacias: 10, diagnosticadas: 50 });
  });

  it('los datos iniciales cuentan igual', () => {
    const a = [ancla('INICIO', 1, '2025-12-15', 90, { inicial: true }), ancla('DIAGNOSTICO', 1, '2026-04-30', 90, { prenadas: { sin: 81 }, vacias: 9, inicial: true })];
    expect(embudo(a, [])).toMatchObject({ servidas: 90, prenadas: 81, corto: '90 → 81 → — → —' });
  });
});

describe('categoría sugerida', () => {
  const nombres = [
    'Vaquillonas',
    'Vaquillonas 1-2',
    'Vaquillonas 1-2 preñadas',
    'Vaquillonas +2',
    'Vaquillonas +2 preñadas',
    'Vaquillonas +2 invernar',
    'Vaquillonas paridas',
    'Vacas de cría',
    'Vacas paridas',
    'Vacas invernar',
    'Terneros chicos',
    'Terneras chicas',
  ];
  const cats = nombres.map((nombre, i) => ({ id: i + 1, nombre }));
  const de = (paso, nombre) => sugerirCategoria(paso, cats.find((c) => c.nombre === nombre), cats).nombre;

  it('preñada, parida, destete de la madre, vacía y crías', () => {
    expect(de('PRENADA', 'Vaquillonas 1-2')).toBe('Vaquillonas 1-2 preñadas');
    expect(de('PARIDA', 'Vaquillonas 1-2 preñadas')).toBe('Vaquillonas paridas');
    expect(de('PARIDA', 'Vacas de cría')).toBe('Vacas paridas');
    expect(de('DESTETE_MADRE', 'Vacas paridas')).toBe('Vacas de cría');
    expect(de('DESTETE_MADRE', 'Vaquillonas paridas')).toBe('Vacas de cría');
    expect(de('VACIA', 'Vaquillonas +2')).toBe('Vaquillonas +2 invernar');
    expect(de('VACIA', 'Vaquillonas +2 preñadas')).toBe('Vaquillonas +2 invernar');
    expect(de('VACIA', 'Vacas de cría')).toBe('Vacas invernar');
    expect(de('CRIA_MACHO', 'Vacas paridas')).toBe('Terneros chicos');
    expect(de('CRIA_HEMBRA', 'Vacas paridas')).toBe('Terneras chicas');
  });

  it('si no existe la sugerida, la misma', () => {
    expect(de('PRENADA', 'Vaquillonas')).toBe('Vaquillonas');
    expect(de('VACIA', 'Vaquillonas 1-2')).toBe('Vaquillonas 1-2');
  });
});

describe('plan de la decisión del diagnóstico', () => {
  // Lote V: 50 Vaquillonas (categoría 1) en P8 (potrero 8). Preñadas = categoría 2.
  const lote = { id: 10, cabezas: 50, categoriaId: 1, potreroId: 8 };

  it('oct a P12, nov y dic se quedan como preñadas, vacías después: el lote se queda con las vacías', () => {
    const r = planDecision({
      lote,
      grupos: [
        { clave: '2027-10', cabezas: 18, destino: { potreroId: 12 }, categoriaId: 2 },
        { clave: '2027-11', cabezas: 15, destino: { potreroId: 8 }, categoriaId: 2 },
        { clave: '2027-12', cabezas: 7, destino: { potreroId: 8 }, categoriaId: 2 },
        { clave: 'vacias', cabezas: 10, destino: { despues: true } },
      ],
    });
    expect(r.error).toBeUndefined();
    expect(r.queda).toEqual(['vacias']);
    expect(r.pasos).toEqual([
      { tipo: 'PARTE', grupos: ['2027-10'], cabezas: 18, potreroId: 12, categoriaId: 2 },
      { tipo: 'PARTE', grupos: ['2027-11', '2027-12'], cabezas: 22, potreroId: 8, categoriaId: 2 },
    ]);
  });

  it('todas las preñadas se quedan y las vacías se venden: venta primero, el lote cambia de categoría al final', () => {
    const venta = { precioVentaUsd: 900, precioVentaPor: 'CABEZA' };
    const r = planDecision({
      lote,
      grupos: [
        { clave: '2027-10', cabezas: 18, destino: { potreroId: 8 }, categoriaId: 2 },
        { clave: '2027-11', cabezas: 22, destino: { potreroId: 8 }, categoriaId: 2 },
        { clave: 'vacias', cabezas: 10, destino: { venta } },
      ],
    });
    expect(r.queda).toEqual(['2027-10', '2027-11']);
    expect(r.pasos).toEqual([
      { tipo: 'VENTA', grupos: ['vacias'], cabezas: 10, venta },
      { tipo: 'CATEGORIA', grupos: ['2027-10', '2027-11'], cabezas: 40, categoriaId: 2 },
    ]);
  });

  it('si todos se van a otros potreros, el más grande se lleva el lote entero', () => {
    const r = planDecision({
      lote,
      grupos: [
        { clave: 'prenadas', cabezas: 40, destino: { potreroId: 12 }, categoriaId: 2 },
        { clave: 'vacias', cabezas: 10, destino: { invernada: true, potreroId: 9 }, categoriaId: 3 },
      ],
    });
    expect(r.queda).toEqual(['prenadas']);
    expect(r.pasos).toEqual([
      { tipo: 'PARTE', grupos: ['vacias'], cabezas: 10, potreroId: 9, categoriaId: 3 },
      { tipo: 'MOVER_ENTERO', grupos: ['prenadas'], cabezas: 40, potreroId: 12, categoriaId: 2 },
    ]);
  });

  it('las que no se diagnosticaron se quedan en el lote como estaban', () => {
    const r = planDecision({ lote, grupos: [{ clave: 'sin', cabezas: 30, destino: { potreroId: 12 }, categoriaId: 2 }] });
    expect(r.queda).toEqual(['sinDiagnostico']);
    expect(r.pasos).toEqual([{ tipo: 'PARTE', grupos: ['sin'], cabezas: 30, potreroId: 12, categoriaId: 2 }]);
  });

  it('más cabezas que las del lote es un error', () => {
    expect(planDecision({ lote, grupos: [{ clave: 'a', cabezas: 51, destino: { potreroId: 12 }, categoriaId: 2 }] }).error).toMatch(/tiene 50 cabezas/);
  });
});
