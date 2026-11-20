import { describe, expect, it } from 'vitest';
import {
  aplicaServicio,
  campaniasParaFiltro,
  cuerpoDiagnostico,
  cuerpoProceso,
  destinoParaApi,
  destinoPorDefecto,
  formatoPorcentaje,
  gruposDiagnostico,
  nombreProceso,
  ofreceNuevoServicio,
  procesosParaEvento,
  textoBotonEtapa,
  totalDiagnostico,
} from './procesos';

describe('procesos (puro)', () => {
  it('el nombre lleva la sigla con todas las estancias', () => {
    const p = { nombre: 'Servicio 2026-27 · Vaquillonas', campo: { sigla: 'EG' } };
    expect(nombreProceso(p, false)).toBe('Servicio 2026-27 · Vaquillonas');
    expect(nombreProceso(p, true)).toBe('EG Servicio 2026-27 · Vaquillonas');
  });

  it('el botón de la etapa que sigue', () => {
    expect(textoBotonEtapa('FIN_SERVICIO')).toBe('Registrar fin del servicio');
    expect(textoBotonEtapa('DIAGNOSTICO')).toBe('Registrar diagnóstico');
    expect(textoBotonEtapa('PARICION')).toBe('Registrar parición');
    expect(textoBotonEtapa('DESTETE')).toBe('Registrar destete');
  });

  it('las campañas del filtro: la de hoy y las dos anteriores', () => {
    expect(campaniasParaFiltro('2026-11-20')).toEqual(['2026-27', '2025-26', '2024-25']);
    expect(campaniasParaFiltro('2027-03-01')).toEqual(['2026-27', '2025-26', '2024-25']);
  });

  it('porcentajes', () => {
    expect(formatoPorcentaje(80)).toBe('80 %');
    expect(formatoPorcentaje(null)).toBe('—');
  });

  it('"empieza un servicio" solo con entore o inseminación, lotes de hembras sueltos que no están en otro proceso', () => {
    const entore = { clave: 'ENTORE' };
    const lotes = [{ loteId: 1, sexo: 'HEMBRA' }, { loteId: 2, sexo: null }];
    const sel = { nivel: 'LOTE' };
    expect(aplicaServicio({ tipo: entore, sel, elegidos: lotes, enProceso: new Set() })).toBe(true);
    expect(aplicaServicio({ tipo: { clave: 'INSEMINACION' }, sel, elegidos: lotes, enProceso: new Set() })).toBe(true);
    expect(aplicaServicio({ tipo: { clave: 'VACUNA_AFTOSA' }, sel, elegidos: lotes, enProceso: new Set() })).toBe(false);
    expect(aplicaServicio({ tipo: entore, sel: { nivel: 'POTRERO' }, elegidos: lotes, enProceso: new Set() })).toBe(false);
    expect(aplicaServicio({ tipo: entore, sel, elegidos: lotes, enProceso: new Set([2]) })).toBe(false);
    expect(aplicaServicio({ tipo: entore, sel, elegidos: [{ loteId: 3, sexo: 'MACHO' }], enProceso: new Set() })).toBe(false);
    expect(aplicaServicio({ tipo: entore, sel, elegidos: [], enProceso: new Set() })).toBe(false);
  });

  it('el cuerpo para crear: un servicio, o uno en curso', () => {
    const elegidos = [{ loteId: 1, cabezas: 50 }, { loteId: 2, cabezas: 30 }];
    expect(
      cuerpoProceso({ modalidad: 'TOROS', campoId: 4, elegidos, cabezas: { 2: '20' }, fecha: '2026-11-15', nombre: ' ', toros: '2', nota: '' }),
    ).toEqual({ campoId: 4, modalidad: 'TOROS', fecha: '2026-11-15', toros: 2, lineas: [{ loteId: 1 }, { loteId: 2, cabezas: 20 }] });
    expect(
      cuerpoProceso({
        modalidad: 'TOROS',
        campoId: 4,
        elegidos,
        enCurso: { etapa: 'PARIENDO', inicio: '2025-12-15', fin: '2026-03-15', servidas: '90', prenadas: '81', vacias: '9' },
        roles: { 1: 'PRENADAS', 2: 'PARIDAS' },
        nombre: 'Vacas 25-26',
      }),
    ).toEqual({
      campoId: 4,
      modalidad: 'TOROS',
      nombre: 'Vacas 25-26',
      enCurso: {
        etapa: 'PARIENDO',
        inicio: '2025-12-15',
        fin: '2026-03-15',
        servidas: 90,
        prenadas: 81,
        vacias: 9,
        lotes: [{ loteId: 1, rol: 'PRENADAS' }, { loteId: 2, rol: 'PARIDAS' }],
      },
    });
  });
});

describe('diagnóstico (puro)', () => {
  // Lote 1: 50 cabezas en el potrero 8, con sus categorías sugeridas.
  const lote = { loteId: 1, nombre: 'Lote V', cabezas: 50, potrero: { id: 8, nombre: 'P8' }, categoriaId: 3, sugeridas: { PRENADA: 4, VACIA: 5 } };

  it('los grupos salen de lo cargado: un grupo por mes con preñadas, y las vacías', () => {
    expect(gruposDiagnostico({ prenadas: { '2027-10': '18', '2027-11': '', sin: '2' }, vacias: '10' })).toEqual([
      { clave: '2027-10', cabezas: 18, nombre: 'Preñadas oct' },
      { clave: 'sin', cabezas: 2, nombre: 'Preñadas (sin mes)' },
      { clave: 'vacias', cabezas: 10, nombre: 'Vacías' },
    ]);
    expect(totalDiagnostico({ prenadas: { '2027-10': '18', sin: '2' }, vacias: '10' })).toBe(30);
  });

  it('el destino por defecto: las preñadas se quedan con la categoría sugerida; las vacías, para decidir después', () => {
    expect(destinoPorDefecto(lote, 'PRENADAS')).toEqual({ tipo: 'QUEDAN', categoriaId: '4' });
    expect(destinoPorDefecto(lote, 'VACIAS')).toEqual({ tipo: 'DESPUES', categoriaId: '5' });
  });

  it('el cuerpo del diagnóstico, con la decisión de cada grupo', () => {
    const datos = { 1: { prenadas: { '2027-10': '18', '2027-11': '22' }, vacias: '10' } };
    const destinos = {
      1: {
        '2027-10': { tipo: 'POTRERO', potreroId: '12', categoriaId: '4' },
        vacias: { tipo: 'VENTA', guia: ' G-1 ', precio: '900', categoriaId: '5' },
      },
    };
    expect(cuerpoDiagnostico({ fecha: '2026-11-18', metodo: 'TACTO', lotes: [lote], datos, destinos })).toEqual({
      fecha: '2026-11-18',
      metodo: 'TACTO',
      lineas: [{ loteId: 1, prenadas: { '2027-10': 18, '2027-11': 22 }, vacias: 10 }],
      decision: [
        {
          loteId: 1,
          grupos: [
            { clave: '2027-10', destino: { potreroId: 12 }, categoriaId: 4 },
            { clave: '2027-11', destino: { potreroId: 8 }, categoriaId: 4 },
            { clave: 'vacias', destino: { venta: { guia: 'G-1', precioVentaUsd: 900, precioVentaPor: 'CABEZA' } } },
          ],
        },
      ],
    });
  });

  it('las otras decisiones de las vacías', () => {
    expect(destinoParaApi({ tipo: 'DESPUES' }, lote)).toEqual({ destino: { despues: true } });
    expect(destinoParaApi({ tipo: 'REENTORE' }, lote)).toEqual({ destino: { reentore: true } });
    expect(destinoParaApi({ tipo: 'INVERNADA', categoriaId: '5' }, lote)).toEqual({ destino: { invernada: true }, categoriaId: 5 });
    expect(destinoParaApi({ tipo: 'POTRERO', potreroId: '12' }, lote)).toEqual({ destino: { potreroId: 12 } });
  });
});

describe('¿de qué proceso? (Eventos)', () => {
  const p = (id, etapa, loteIds = []) => ({ id, nombre: `Proceso ${id}`, etapa, loteIds });
  const procesos = [p(1, 'SERVICIO'), p(2, 'ESPERA_DIAGNOSTICO'), p(3, 'PRENEZ', [30]), p(4, 'PARICION'), p(5, 'CRIA')];
  const de = (clave, extra) => procesosParaEvento(clave, procesos, extra).map((x) => [x.proceso.id, x.etapa]);

  it('cada evento de reproducción, en los procesos donde tiene sentido y con su etapa', () => {
    expect(de('ENTORE')).toEqual([[1, 'REPASO']]);
    expect(de('FIN_SERVICIO')).toEqual([[1, 'FIN_SERVICIO']]);
    expect(de('ECOGRAFIA')).toEqual([
      [1, 'DIAGNOSTICO'],
      [2, 'DIAGNOSTICO'],
      [3, 'REVISION'],
      [4, 'REVISION'],
    ]);
    expect(de('ABORTO')).toEqual([
      [3, 'ABORTO'],
      [4, 'ABORTO'],
    ]);
    expect(de('INSEMINACION')).toEqual([]);
    expect(de('VACUNA_AFTOSA')).toEqual([]);
  });

  it('el proceso del lote de donde se abrió va primero', () => {
    expect(de('ECOGRAFIA', { loteId: 30 })[0]).toEqual([3, 'REVISION']);
  });

  it('el entore y la inseminación ofrecen empezar un servicio', () => {
    expect(ofreceNuevoServicio({ clave: 'ENTORE' })).toBe(true);
    expect(ofreceNuevoServicio({ clave: 'INSEMINACION' })).toBe(true);
    expect(ofreceNuevoServicio({ clave: 'ECOGRAFIA' })).toBe(false);
  });
});
