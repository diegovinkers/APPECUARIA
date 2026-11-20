import { describe, expect, it } from 'vitest';
import { aplicaServicio, campaniasParaFiltro, cuerpoProceso, formatoPorcentaje, nombreProceso, textoBotonEtapa } from './procesos';

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
