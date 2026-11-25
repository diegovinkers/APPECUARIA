import { describe, expect, it } from 'vitest';
import {
  aplicaServicio,
  campaniasParaFiltro,
  cuerpoDiagnostico,
  faltaDestete,
  faltaEcografia,
  gruposEcografia,
  opcionesEcografia,
  quienesSeVan,
  separarIatf,
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
  diasCorto,
  estiloSugerencia,
  lotesPorEstado,
  rutaRegistrar,
  sePuedeDescartar,
  textoTipo,
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
    // Repartidas en potreros (las filas sin potrero o sin cabezas no van) y, en
    // una IATF, a dónde van las inseminadas.
    expect(
      cuerpoProceso({
        modalidad: 'TOROS',
        campoId: 4,
        elegidos,
        fecha: '2026-11-15',
        reparto: { 1: [{ potreroId: '12', cabezas: '20', toros: '1' }, { potreroId: '', cabezas: '5' }, { potreroId: '13', cabezas: '' }] },
      }).lineas,
    ).toEqual([{ loteId: 1, reparto: [{ potreroId: 12, cabezas: 20, toros: 1 }] }, { loteId: 2 }]);
    expect(cuerpoProceso({ modalidad: 'IATF', campoId: 4, elegidos, fecha: '2026-11-15', cabezas: { 1: '30' }, destinos: { 1: '12' } }).lineas).toEqual([
      { loteId: 1, cabezas: 30, potreroId: 12 },
      { loteId: 2 },
    ]);
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

  it('el destino por defecto: las preñadas se quedan con la categoría del lote; las vacías, sin destino (ya no hay "decidir después")', () => {
    expect(destinoPorDefecto(lote, 'PRENADAS')).toEqual({ tipo: 'QUEDAN', categoriaId: '3' });
    expect(destinoPorDefecto(lote, 'VACIAS')).toEqual({ tipo: '', categoriaId: '5' });
  });

  it('el cuerpo del diagnóstico, con lo elegido de cada lote', () => {
    const datos = { 1: { prenadas: { '2027-10': '18', '2027-11': '22' }, vacias: '10' } };
    const elecciones = { 1: { seVan: 'DOS', porMes: true, potreroMes: { '2027-10': '12', '2027-11': '13' }, potreroVacias: '9', vaciasA: 'ENTORE' } };
    expect(cuerpoDiagnostico({ fecha: '2026-11-18', metodo: 'TACTO', lotes: [lote], datos, elecciones, iatf: true })).toEqual({
      fecha: '2026-11-18',
      metodo: 'TACTO',
      lineas: [{ loteId: 1, prenadas: { '2027-10': 18, '2027-11': 22 }, vacias: 10 }],
      decision: [
        {
          loteId: 1,
          grupos: [
            { clave: '2027-10', destino: { potreroId: 12 } },
            { clave: '2027-11', destino: { potreroId: 13 } },
            { clave: 'vacias', destino: { reentore: true, potreroId: 9 } },
          ],
        },
      ],
    });
  });

  it('entore y engorde para las vacías (y lo de antes)', () => {
    expect(destinoParaApi({ tipo: 'ENTORE', potreroId: '12' }, lote)).toEqual({ destino: { reentore: true, potreroId: 12 } });
    expect(destinoParaApi({ tipo: 'ENGORDE', categoriaId: '5' }, lote)).toEqual({ destino: { invernada: true }, categoriaId: 5 });
    expect(destinoParaApi({ tipo: 'ENGORDE', potreroId: '9', categoriaId: '5' }, lote)).toEqual({ destino: { invernada: true, potreroId: 9 }, categoriaId: 5 });
  });

  it('las otras decisiones de las vacías (lo de antes)', () => {
    expect(destinoParaApi({ tipo: 'DESPUES' }, lote)).toEqual({ destino: { despues: true } });
    expect(destinoParaApi({ tipo: 'REENTORE' }, lote)).toEqual({ destino: { reentore: true } });
    expect(destinoParaApi({ tipo: 'REENTORE', potreroId: '12' }, lote)).toEqual({ destino: { reentore: true, potreroId: 12 } });
    expect(destinoParaApi({ tipo: 'SALEN', potreroId: '13', categoriaId: '5' }, lote)).toEqual({ destino: { salen: true, potreroId: 13 }, categoriaId: 5 });
    expect(destinoParaApi({ tipo: 'SALEN' }, lote)).toEqual({ destino: { salen: true, potreroId: lote.potrero.id } });
    expect(destinoParaApi({ tipo: 'INVERNADA', categoriaId: '5' }, lote)).toEqual({ destino: { invernada: true }, categoriaId: 5 });
    expect(destinoParaApi({ tipo: 'POTRERO', potreroId: '12' }, lote)).toEqual({ destino: { potreroId: 12 } });
  });
});

describe('la ecografía con las reglas del campo (R1/R4)', () => {
  // 50 en P8. Lo cargado: 40 preñadas y 10 vacías.
  const lote = { loteId: 1, cabezas: 50, potrero: { id: 8 }, categoriaId: 3, sugeridas: { VACIA: 5 } };
  const d = { prenadas: { sin: '40' }, vacias: '10' };

  it('pregunta quiénes se van solo si hay preñadas y vacías y no quedan sin ecografiar', () => {
    expect(opcionesEcografia(lote, d)).toMatchObject({ pregunta: true, sinEcografiar: 0, porMes: false });
    expect(opcionesEcografia(lote, { prenadas: { sin: '30' }, vacias: '10' })).toMatchObject({ pregunta: false, sinEcografiar: 10 });
    expect(opcionesEcografia(lote, { prenadas: { '2027-10': '20', '2027-11': '20' }, vacias: '10' }).porMes).toBe(true);
    expect(quienesSeVan(lote, d, {})).toEqual({ prenadas: false, vacias: true });
    expect(quienesSeVan(lote, d, { seVan: 'PRENADAS' })).toEqual({ prenadas: true, vacias: false });
    expect(quienesSeVan(lote, d, { seVan: 'DOS' })).toEqual({ prenadas: true, vacias: true });
    // Con sin ecografiar se van las dos.
    expect(quienesSeVan(lote, { prenadas: { sin: '30' }, vacias: '10' }, { seVan: 'VACIAS' })).toEqual({ prenadas: true, vacias: true });
  });

  it('lo que falta: el destino de las vacías (IATF), el potrero de las que se van y que no queden juntas', () => {
    expect(faltaEcografia(lote, d, {}, { iatf: true })).toMatch(/entore con toros o engorde/);
    expect(faltaEcografia(lote, d, {})).toBe('Elegí a qué potrero van las vacías');
    expect(faltaEcografia(lote, d, { potreroVacias: '8' })).toBe('Elegí a qué potrero van las vacías');
    expect(faltaEcografia(lote, d, { potreroVacias: '9' })).toBeNull();
    expect(faltaEcografia(lote, d, { seVan: 'DOS', potreroVacias: '9', potreroPrenadas: '9' })).toBe('Las vacías y las preñadas no pueden quedar en el mismo potrero');
    expect(faltaEcografia(lote, { prenadas: { sin: '30' }, vacias: '10' }, { potreroVacias: '9' })).toBe('Elegí a qué potrero van las preñadas');
  });

  it('los grupos para la API: engorde con la categoría de invernar; las que se quedan, en el potrero del lote', () => {
    expect(gruposEcografia(lote, d, { potreroVacias: '9' })).toEqual([
      { clave: 'sin', destino: { potreroId: 8 } },
      { clave: 'vacias', destino: { invernada: true, potreroId: 9 }, categoriaId: 5 },
    ]);
    // En un entore no hay entore para las vacías, aunque se haya elegido.
    expect(gruposEcografia(lote, d, { potreroVacias: '9', vaciasA: 'ENTORE' })[1].destino).toEqual({ invernada: true, potreroId: 9 });
  });
});

describe('IATF de una parte y destete (R2/R9)', () => {
  const lote = { cabezas: 103, potrero: { id: 8 } };

  it('con menos inseminadas, un grupo se va: las inseminadas (potreroId) o las sin inseminar (sinInseminarA)', () => {
    expect(separarIatf(lote, { cabezas: '80' })).toMatchObject({ n: 80, parte: true, sinInseminar: 23, falta: 'Elegí a qué potrero van las 80 inseminadas', api: {} });
    expect(separarIatf(lote, { cabezas: '80', potreroId: '12' }).api).toEqual({ potreroId: 12 });
    expect(separarIatf(lote, { cabezas: '80', seVan: 'SIN', potreroId: '12' })).toMatchObject({ falta: null, api: { sinInseminarA: 12 } });
    expect(separarIatf(lote, { cabezas: '80', seVan: 'SIN' }).falta).toBe('Elegí a qué potrero van las 23 sin inseminar');
    // Todas: se pueden quedar.
    expect(separarIatf(lote, { cabezas: '' })).toMatchObject({ n: 103, parte: false, falta: null, api: {} });
    expect(separarIatf(lote, { cabezas: '200' }).falta).toBe('El lote tiene 103');
  });

  it('el destete: terneros y vacas no quedan en el mismo potrero', () => {
    expect(faltaDestete(lote, {})).toBe('Elegí a qué potrero van los terneros');
    expect(faltaDestete(lote, { potreroId: '8' })).toBe('Los terneros y las vacas no pueden quedar en el mismo potrero');
    expect(faltaDestete(lote, { potreroId: '12' })).toBeNull();
    expect(faltaDestete(lote, { potreroId: '12', madresPotreroId: '12' })).toBe('Los terneros y las vacas no pueden quedar en el mismo potrero');
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
    // El destete, desde que empiezan a parir (24/11).
    expect(de('DESTETE')).toEqual([
      [4, 'DESTETE'],
      [5, 'DESTETE'],
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

describe('sugerencias y cronograma (fase 5)', () => {
  it('textoTipo: entore o inseminación', () => {
    expect(textoTipo('TOROS')).toBe('Entore');
    expect(textoTipo('IATF')).toBe('Inseminación');
    expect(textoTipo('IA')).toBe('Inseminación');
  });

  it('diasCorto: lo que va en la lista', () => {
    expect(diasCorto({ estado: 'PROXIMA', dias: 5 })).toBe('faltan 5 días');
    expect(diasCorto({ estado: 'PENDIENTE', dias: 1 })).toBe('falta 1 día');
    expect(diasCorto({ estado: 'HOY', dias: 0 })).toBe('hoy');
    expect(diasCorto({ estado: 'HOY', dias: -5, hasta: '2027-12-09' })).toBe('en curso');
    expect(diasCorto({ estado: 'ATRASADA', dias: -3 })).toBe('atrasada 3 días');
    expect(diasCorto({ estado: 'ATRASADA', dias: -100, hasta: '2027-12-09' })).toBe('atrasada');
    expect(diasCorto(null)).toBe('');
  });

  it('rutaRegistrar: la pantalla de la etapa, el nuevo proceso enganchado, o nada', () => {
    expect(rutaRegistrar(7, { etapa: 'DIAGNOSTICO' })).toBe('/pecuaria/procesos/7/etapa/DIAGNOSTICO');
    expect(rutaRegistrar(7, { etapa: 'NUEVO_ENTORE' })).toBe('/pecuaria/procesos/nuevo?desde=7');
    expect(rutaRegistrar(7, { etapa: 'OTRA' })).toBeNull();
    expect(rutaRegistrar(7, null)).toBeNull();
  });

  it('sePuedeDescartar: lo abierto, no el inicio ni lo hecho', () => {
    expect(sePuedeDescartar({ clave: 'DIAGNOSTICO', estado: 'PROXIMA' })).toBe(true);
    expect(sePuedeDescartar({ clave: 'INICIO', estado: 'HECHA' })).toBe(false);
    expect(sePuedeDescartar({ clave: 'FIN_SERVICIO', estado: 'HECHA' })).toBe(false);
    expect(sePuedeDescartar({ clave: 'FIN_SERVICIO', estado: 'DESCARTADA' })).toBe(false);
  });

  it('estiloSugerencia: cada estado con su color (lo desconocido, como pendiente)', () => {
    expect(estiloSugerencia('ATRASADA').tarjeta).toContain('red');
    expect(estiloSugerencia('X')).toBe(estiloSugerencia('PENDIENTE'));
  });

  it('lotesPorEstado: en el orden de los estados, con su nombre; los que salieron, aparte', () => {
    const grupos = lotesPorEstado(
      [
        { loteId: 1, rol: 'PRENADAS', cabezas: 165, activo: true },
        { loteId: 2, rol: 'VACIAS', cabezas: 35, activo: true },
        { loteId: 3, rol: 'VIENTRES', cabezas: 0, activo: false },
        { loteId: 4, rol: 'PRENADAS', cabezas: 5, activo: true },
      ],
      { PRENADAS: 'Preñada', VACIAS: 'Falladas' },
    );
    expect(grupos.map((g) => [g.rol, g.nombre, g.cabezas, g.lotes.length])).toEqual([
      ['PRENADAS', 'Preñada', 170, 2],
      ['VACIAS', 'Falladas', 35, 1],
      ['LIBRES', 'LIBRES', 0, 1],
    ]);
  });
});
