// @vitest-environment jsdom
// Lo puro de los eventos: la hoja (grupos), los usados hace poco, el
// buscador, lo elegido en "a quién" y el cuerpo para la API.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { agruparEventos, formularioDe, guardarRecientes, leerRecientes, nombreCorto, sexoCorresponde } from '../navegacion/eventos';
import { SIN_ELEGIR, buscar, cambiarSeleccion, cuerpoEvento, indexarLotes, lotesDelTipo, lotesElegidos, opcionesDe, recientesDe, seleccionInicial } from './eventos';

const TODOS = ['CAMPO', 'POTRERO', 'CATEGORIA', 'LOTE', 'PARTE_LOTE'];
const tipo = (id, clave, nombre, extra = {}) => ({ id, clave, nombre, efecto: 'REGISTRO', activo: true, orden: id * 10, sexo: 'CUALQUIERA', niveles: TODOS, ...extra });
const PESADA = tipo(15, 'PESADA', 'Pesada', { niveles: ['POTRERO', 'CATEGORIA', 'LOTE', 'PARTE_LOTE'] });
const ECOGRAFIA = tipo(16, 'ECOGRAFIA', 'Ecografía', { sexo: 'HEMBRA', niveles: ['CATEGORIA', 'LOTE', 'PARTE_LOTE'] });
const VACUNA = tipo(24, 'VACUNA_AFTOSA', 'Vacuna aftosa');
const RECUENTO = tipo(27, 'RECUENTO', 'Recuento', { niveles: ['CAMPO', 'POTRERO', 'LOTE'] });
const ALIMENTACION = tipo(26, 'ALIMENTACION', 'Alimentación', { niveles: ['POTRERO', 'CATEGORIA', 'LOTE'] });

const POTREROS = [
  {
    id: 10,
    nombre: '10.3',
    stock: {
      lotes: [
        { loteId: 101, lote: '10.3 · Terneros', categoriaId: 1, categoria: 'Terneros', sexo: 'MACHO', cabezas: 80, pesoPromedioKg: 250 },
        { loteId: 102, lote: '10.3 · Vacas', categoriaId: 2, categoria: 'Vacas', sexo: 'HEMBRA', cabezas: 40, pesoPromedioKg: null },
      ],
    },
  },
  { id: 12, nombre: '12', stock: { lotes: [{ loteId: 121, lote: '12 · Novillos', categoriaId: 3, categoria: 'Novillos', sexo: 'MACHO', cabezas: 50 }] } },
  { id: 14, nombre: '14', stock: { lotes: [] } },
];
const LOTES = indexarLotes(POTREROS);

describe('la hoja "Eventos"', () => {
  it('Pesada y Recuento arriba; los grupos en orden; un tipo nuevo va a Otros; sin los inactivos ni los que mueven', () => {
    const tipos = [
      VACUNA,
      RECUENTO,
      PESADA,
      ECOGRAFIA,
      ALIMENTACION,
      tipo(30, 'BANO', 'Baño'),
      tipo(31, 'DOSIS', 'Dosificación', { activo: false }),
      { ...tipo(1, 'VENTA', 'Venta'), efecto: 'SALE' },
    ];
    const { destacados, grupos } = agruparEventos(tipos);
    expect(destacados.map((t) => t.clave)).toEqual(['PESADA', 'RECUENTO']);
    expect(grupos.map((g) => [g.titulo, g.tipos.map((t) => t.clave)])).toEqual([
      ['Sanidad', ['VACUNA_AFTOSA']],
      ['Reproducción (hembras)', ['ECOGRAFIA']],
      ['Manejo', ['ALIMENTACION']],
      ['Otros', ['BANO']],
    ]);
  });

  it('nombres cortos, el formulario de cada tipo y el sexo', () => {
    expect(nombreCorto({ clave: 'TRATAMIENTO', nombre: 'Otros tratamientos sanitarios' })).toBe('Otro tratamiento');
    expect(formularioDe(PESADA)).toBe('pesada');
    expect(formularioDe(VACUNA)).toBe('producto');
    expect(formularioDe(tipo(30, 'BANO', 'Baño'))).toBe('cabezas');
    expect(sexoCorresponde(ECOGRAFIA, 'MACHO')).toBe(false);
    expect(sexoCorresponde(ECOGRAFIA, null)).toBe(true);
    expect(sexoCorresponde(VACUNA, 'MACHO')).toBe(true);
  });
});

describe('usados hace poco', () => {
  afterEach(() => vi.restoreAllMocks());

  it('se guardan los más nuevos primero, sin repetir, hasta 6', () => {
    const datos = new Map();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => datos.get(k) ?? null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => datos.set(k, v));
    guardarRecientes([{ tipo: 'lote', id: 1, campoId: 1 }]);
    guardarRecientes([{ tipo: 'potrero', id: 10, campoId: 1 }, { tipo: 'lote', id: 1, campoId: 1 }]);
    expect(leerRecientes().map((r) => `${r.tipo}${r.id}`)).toEqual(['potrero10', 'lote1']);
    guardarRecientes(Array.from({ length: 8 }, (_, i) => ({ tipo: 'lote', id: 100 + i, campoId: 1 })));
    expect(leerRecientes()).toHaveLength(6);
  });

  it('sin almacenamiento (modo privado) no se rompe: no hay recientes', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(leerRecientes()).toEqual([]);
    expect(guardarRecientes([{ tipo: 'lote', id: 1, campoId: 1 }])).toEqual([{ tipo: 'lote', id: 1, campoId: 1 }]);
  });
});

describe('a quién', () => {
  it('los lotes con animales, y los que no corresponden por el sexo', () => {
    expect(LOTES.map((l) => l.loteId)).toEqual([101, 102, 121]);
    const { lotes, omitidos } = lotesDelTipo(LOTES, ECOGRAFIA);
    expect(lotes.map((l) => l.loteId)).toEqual([102]);
    expect(omitidos).toBe(2);
  });

  it('el buscador encuentra por potrero, lote o categoría', () => {
    expect(buscar(LOTES, '').potreros.map((p) => p.potrero)).toEqual(['10.3', '12']);
    expect(buscar(LOTES, '12').potreros.map((p) => p.potrero)).toEqual(['12']);
    const vacas = buscar(LOTES, 'vacas');
    expect(vacas.potreros.map((p) => [p.potrero, p.lotes.map((l) => l.loteId)])).toEqual([['10.3', [102]]]);
    expect(vacas.categorias.map((c) => c.categoria)).toEqual(['Vacas']);
    // Sin tildes ni mayúsculas.
    expect(buscar(LOTES, 'NOVÍLLOS').potreros.map((p) => p.potrero)).toEqual(['12']);
  });

  it('elegir lotes, un potrero entero, la estancia o una categoría', () => {
    const op = opcionesDe(VACUNA);
    let sel = cambiarSeleccion(SIN_ELEGIR, { tipo: 'lote', id: 101 }, LOTES, op);
    sel = cambiarSeleccion(sel, { tipo: 'lote', id: 121 }, LOTES, op);
    expect(sel).toMatchObject({ nivel: 'LOTE', loteIds: [101, 121] });
    // Con lotes sueltos elegidos, el potrero suma sus lotes (y si ya están todos, los saca).
    sel = cambiarSeleccion(sel, { tipo: 'potrero', id: 10 }, LOTES, op);
    expect(sel.loteIds.sort()).toEqual([101, 102, 121]);
    sel = cambiarSeleccion(sel, { tipo: 'potrero', id: 10 }, LOTES, op);
    expect(sel.loteIds).toEqual([121]);
    // Sin nada elegido, el potrero entero es un atajo (nivel POTRERO).
    expect(cambiarSeleccion(SIN_ELEGIR, { tipo: 'potrero', id: 10 }, LOTES, op)).toMatchObject({ nivel: 'POTRERO', potreroIds: [10] });
    const estancia = cambiarSeleccion(SIN_ELEGIR, { tipo: 'campo' }, LOTES, op);
    expect(lotesElegidos(estancia, LOTES)).toHaveLength(3);
    // Sacar un lote de la estancia entera: pasan a ser lotes sueltos.
    expect(cambiarSeleccion(estancia, { tipo: 'lote', id: 102 }, LOTES, op)).toMatchObject({ nivel: 'LOTE', loteIds: [101, 121] });
    const cat = cambiarSeleccion(SIN_ELEGIR, { tipo: 'categoria', id: 2 }, LOTES, op);
    expect(lotesElegidos(cat, LOTES).map((l) => l.loteId)).toEqual([102]);
    expect(cambiarSeleccion(cat, { tipo: 'categoria', id: 2 }, LOTES, op)).toEqual(SIN_ELEGIR);
  });

  it('arranca con el potrero o el lote de donde se abrió', () => {
    expect(seleccionInicial({ potrero: 10 }, LOTES, opcionesDe(PESADA))).toMatchObject({ nivel: 'POTRERO', potreroIds: [10] });
    // Un tipo que no va por potrero entero: sus lotes.
    expect(seleccionInicial({ potrero: 10 }, LOTES, opcionesDe(ECOGRAFIA))).toMatchObject({ nivel: 'LOTE', loteIds: [101, 102] });
    expect(seleccionInicial({ lote: 121 }, LOTES, opcionesDe(VACUNA))).toMatchObject({ nivel: 'LOTE', loteIds: [121] });
    expect(seleccionInicial({ lote: 999 }, LOTES, opcionesDe(VACUNA))).toEqual(SIN_ELEGIR);
  });
});

describe('el cuerpo para la API', () => {
  const base = { campoId: 1, lotes: LOTES, fecha: '2026-11-20' };

  it('lotes sueltos: una línea por lote con lo suyo', () => {
    const sel = { ...SIN_ELEGIR, loteIds: [101, 102] };
    const cuerpo = cuerpoEvento({ ...base, tipo: PESADA, sel, datosLote: { 101: { pesoPromedioKg: '262,5', pesadas: '80' }, 102: { pesoPromedioKg: '430', pesadas: '' } }, nota: ' ok ' });
    expect(cuerpo).toEqual({
      tipoId: 15,
      fecha: '2026-11-20',
      nota: 'ok',
      nivel: 'LOTE',
      lineas: [
        { loteId: 101, pesoPromedioKg: '262,5', pesadas: '80' },
        { loteId: 102, pesoPromedioKg: '430' },
      ],
    });
  });

  it('la estancia entera: el atajo, el producto y sin líneas', () => {
    const cuerpo = cuerpoEvento({ ...base, tipo: VACUNA, sel: { ...SIN_ELEGIR, nivel: 'CAMPO' }, comunes: { producto: ' Bivalente ' } });
    expect(cuerpo).toEqual({ tipoId: 24, fecha: '2026-11-20', nivel: 'CAMPO', campoId: 1, datos: { producto: 'Bivalente' } });
  });

  it('un potrero entero en un recuento: las líneas con lo contado (y el motivo solo si hay diferencia)', () => {
    const sel = { ...SIN_ELEGIR, nivel: 'POTRERO', potreroIds: [10] };
    const cuerpo = cuerpoEvento({ ...base, tipo: RECUENTO, sel, datosLote: { 101: { contadas: '78', motivo: 'Abigeato' }, 102: { contadas: '40', motivo: 'no va' } } });
    expect(cuerpo).toEqual({
      tipoId: 27,
      fecha: '2026-11-20',
      nivel: 'POTRERO',
      potreroIds: [10],
      lineas: [
        { loteId: 101, contadas: '78', motivo: 'Abigeato' },
        { loteId: 102, contadas: '40' },
      ],
    });
  });

  it('lo que se guarda en "usados hace poco"', () => {
    expect(recientesDe({ ...SIN_ELEGIR, loteIds: [101] }, LOTES, 1)).toEqual([{ tipo: 'lote', id: 101, campoId: 1 }]);
    expect(recientesDe({ ...SIN_ELEGIR, nivel: 'POTRERO', potreroIds: [10] }, LOTES, 1)).toEqual([{ tipo: 'potrero', id: 10, campoId: 1 }]);
    expect(recientesDe({ ...SIN_ELEGIR, nivel: 'CAMPO' }, LOTES, 1)).toEqual([]);
  });
});
