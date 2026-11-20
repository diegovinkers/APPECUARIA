// Feedlot por etapas, atrasados y precio de venta real
// (docs/superpowers/plans/2026-11-20-feedlot-etapas-y-ventas.md):
//   1. la tabla de categorías del feedlot por etapa del encierre, con el valor
//      del peso estimado de hoy (el mismo que el análisis por corral);
//   2. los corrales atrasados aparte de los que salen en los próximos 30 días;
//   3. el precio de venta real en las salidas de tipo VENTA y las "Últimas ventas".
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { analisisFeedlot, columnasEtapas, etapaDeEncierre, problemaEtapas, resumenPorEtapas, sumarDias, ventaConEstimado } from '../src/pecuaria/feedlot.service.js';
import { valorVenta } from '../src/pecuaria/calculos.js';
import { auditoria, dia, hoy, prepararCampo } from './pecuaria-helpers.js';
import { useTestDatabase } from './helpers.js';

useTestDatabase();

const API = '/api/pecuaria';
const ETAPAS = { adaptacionDias: 20, engordeDias: 90, cicloDias: 120 };

// --- Funciones puras, con fechas fijas ---

describe('etapaDeEncierre', () => {
  it('cada etapa hasta su límite (inclusive); sin días, "Sin fecha"', () => {
    expect(etapaDeEncierre(0, ETAPAS)).toBe('ADAPTACION');
    expect(etapaDeEncierre(20, ETAPAS)).toBe('ADAPTACION');
    expect(etapaDeEncierre(21, ETAPAS)).toBe('ENGORDE');
    expect(etapaDeEncierre(90, ETAPAS)).toBe('ENGORDE');
    expect(etapaDeEncierre(91, ETAPAS)).toBe('TERMINACION');
    expect(etapaDeEncierre(120, ETAPAS)).toBe('TERMINACION');
    expect(etapaDeEncierre(121, ETAPAS)).toBe('PARA_SALIR');
    expect(etapaDeEncierre(null, ETAPAS)).toBe('SIN_FECHA');
    // Una fecha de entrada futura cuenta como recién entrado.
    expect(etapaDeEncierre(-3, ETAPAS)).toBe('ADAPTACION');
    // Con otros parámetros.
    expect(etapaDeEncierre(25, { adaptacionDias: 30, engordeDias: 60, cicloDias: 100 })).toBe('ADAPTACION');
    // Sin parámetros, los de arranque (20 / 90 / 120).
    expect(etapaDeEncierre(100)).toBe('TERMINACION');
  });

  it('adaptación < engorde < ciclo', () => {
    expect(problemaEtapas(ETAPAS)).toBeNull();
    expect(problemaEtapas({ ...ETAPAS, adaptacionDias: 90 })).toMatch(/adaptación/);
    expect(problemaEtapas({ ...ETAPAS, engordeDias: 120 })).toMatch(/engorde/);
  });

  it('las columnas: en el celular Adaptación y Engorde van juntas; "Sin fecha" solo si hay', () => {
    const sin = columnasEtapas(ETAPAS, false);
    expect(sin.map((c) => c.clave)).toEqual(['ADAPTACION', 'ENGORDE', 'HASTA_ENGORDE', 'TERMINACION', 'PARA_SALIR']);
    expect(sin.find((c) => c.clave === 'HASTA_ENGORDE')).toMatchObject({ nombre: 'Hasta 90 d', celular: true, suma: ['ADAPTACION', 'ENGORDE'] });
    expect(sin.filter((c) => c.compu).map((c) => c.clave)).toEqual(['ADAPTACION', 'ENGORDE']);
    expect(sin.find((c) => c.clave === 'ENGORDE').detalle).toBe('21 a 90 días');
    expect(columnasEtapas(ETAPAS, true).at(-1)).toMatchObject({ clave: 'SIN_FECHA', nombre: 'Sin fecha' });
  });
});

const FX = { id: 9, sigla: 'FX', nombre: 'Feedlot Ejemplo' };
const corral = (id, lineas) => ({ id, nombre: `C${id}`, metrosComedero: null, campo: FX, fecha: '2026-11-12', lineas });
const linea = (loteId, categoriaId, cabezas, fechaEntrada, pesoEntradaKg = null) => ({
  loteId,
  lote: `L${loteId}`,
  categoriaId,
  categoria: categoriaId === 1 ? 'Novillos' : 'Toros',
  categoriaOrden: categoriaId,
  cabezas,
  pesoPromedioKg: null,
  fechaEntrada,
  pesoEntradaKg,
});

describe('atrasados y próximos (con fechas fijas)', () => {
  // Hoy 10/11, ciclo de 120 días.
  const corrales = [
    corral(1, [linea(11, 1, 10, '2026-07-01')]), // salía el 29/10: atrasado 12 días
    corral(2, [linea(21, 1, 10, '2026-07-15')]), // sale el 12/11: en 2 días (cerca)
    corral(3, [linea(31, 1, 10, '2026-08-01')]), // sale el 29/11: en 19 días
    corral(4, [linea(41, 1, 10, '2026-09-01')]), // sale el 30/12: en 50 días
    corral(5, [linea(51, 1, 10, '2026-07-13')]), // sale hoy (10/11): no está atrasado
    // Un corral con un lote atrasado y otro que sale pronto cuenta como atrasado.
    corral(6, [linea(61, 1, 5, '2026-06-01'), linea(62, 1, 5, '2026-07-20')]),
  ];
  const r = analisisFeedlot({ corrales, hoy: '2026-11-10', cicloDias: 120 });
  const por = Object.fromEntries(r.filas.map((f) => [f.loteId, f]));

  it('cada lote: atrasado (la salida ya pasó) o cerca (menos de una semana)', () => {
    expect(por[11]).toMatchObject({ diasParaSalida: -12, atrasado: true, salidaCerca: false });
    expect(por[21]).toMatchObject({ diasParaSalida: 2, atrasado: false, salidaCerca: true });
    expect(por[31]).toMatchObject({ diasParaSalida: 19, atrasado: false, salidaCerca: false });
    expect(por[51]).toMatchObject({ diasParaSalida: 0, atrasado: false, salidaCerca: true });
  });

  it('los totales los cuentan por separado, por corral', () => {
    // Atrasados: C1 y C6. Próximos (de hoy a hoy + 30): C2, C3 y C5.
    expect(r.totales).toMatchObject({ atrasados: 2, proximos: 3 });
    expect(r.totales.salenEn30).toBeUndefined();
  });
});

describe('resumenPorEtapas (cálculo puro)', () => {
  const parametros = {
    kgPorUg: 380,
    categorias: new Map([
      [1, { pesoPromedioKg: 400, precioUsd: 3, precioPor: 'KG' }],
      [2, { pesoPromedioKg: 600, precioUsd: 5000, precioPor: 'CABEZA' }],
    ]),
  };
  const corrales = [
    corral(1, [linea(11, 1, 100, '2026-10-31', 300)]), // 10 días: adaptación
    corral(2, [linea(21, 1, 50, '2026-09-01', 250), linea(22, 2, 4, '2026-07-01')]), // 70 días: engorde · 132 días: para salir
    corral(3, [linea(31, 1, 20, '2026-07-20', 200)]), // 113 días: terminación
    corral(4, [linea(41, 2, 3, null)]), // sin fecha
  ];
  const analisis = analisisFeedlot({ corrales, hoy: '2026-11-10', gmdKg: 1.5, cicloDias: 120, parametros });
  const r = resumenPorEtapas(analisis, ETAPAS);

  it('una fila por categoría, con las cabezas de cada etapa', () => {
    expect(r.tipo).toBe('FEEDLOT');
    expect(r.filas.map((f) => [f.categoria, f.ADAPTACION, f.ENGORDE, f.TERMINACION, f.PARA_SALIR, f.SIN_FECHA, f.total])).toEqual([
      ['Novillos', 100, 50, 20, 0, 0, 170],
      ['Toros', 0, 0, 0, 4, 3, 7],
    ]);
    expect(r.totales).toEqual({ ADAPTACION: 100, ENGORDE: 50, TERMINACION: 20, PARA_SALIR: 4, SIN_FECHA: 3, total: 177 });
    // Hay lotes sin fecha: aparece la columna.
    expect(r.columnas.map((c) => c.clave)).toContain('SIN_FECHA');
    expect(r.porGrupo).toEqual([]);
  });

  it('el valor es el del peso estimado de hoy: el mismo que el análisis por corral', () => {
    // Novillos: 100 × 315 × 3 + 50 × 355 × 3 + 20 × 369,5 × 3. Toros: 7 × 5000.
    const novillos = 100 * 315 * 3 + 50 * 355 * 3 + 20 * 369.5 * 3;
    expect(r.filas[0].valorUsd).toBe(novillos);
    expect(r.filas[1].valorUsd).toBe(35_000);
    expect(r.valor).toEqual({ usd: analisis.totales.valorUsd, completo: true });
    expect(r.valor.usd).toBe(novillos + 35_000);
  });

  it('sin lotes sin fecha, no hay columna "Sin fecha"', () => {
    const otro = resumenPorEtapas(analisisFeedlot({ corrales: corrales.slice(0, 1), hoy: '2026-11-10', parametros }), ETAPAS);
    expect(otro.columnas.map((c) => c.clave)).not.toContain('SIN_FECHA');
  });
});

describe('valor de una venta y peso estimado (cálculo puro)', () => {
  it('por kilo: cabezas × peso × precio; por cabeza: cabezas × precio', () => {
    expect(valorVenta({ cabezas: 10, pesoPromedioKg: 360, precioVentaUsd: 3.2, precioVentaPor: 'KG' })).toBe(11_520);
    expect(valorVenta({ cabezas: 2, pesoPromedioKg: null, precioVentaUsd: 4800, precioVentaPor: 'CABEZA' })).toBe(9600);
    expect(valorVenta({ cabezas: 10, pesoPromedioKg: null, precioVentaUsd: 3.2, precioVentaPor: 'KG' })).toBeNull();
    expect(valorVenta({ cabezas: 10, pesoPromedioKg: 360, precioVentaUsd: null, precioVentaPor: null })).toBeNull();
  });

  it('el peso estimado a la fecha de la venta y la diferencia con el real', () => {
    const v = ventaConEstimado(
      { id: 1, fecha: '2026-11-10', cabezas: 10, pesoPromedioKg: 360, precioVentaUsd: 3.2, precioVentaPor: 'KG', corral: 'C1', campo: FX, categoria: 'Novillos', lote: { fechaEntrada: '2026-10-01', pesoEntradaKg: 300 } },
      1.5,
    );
    expect(v).toMatchObject({ diasEncierre: 40, pesoRealKg: 360, pesoEstimadoKg: 360, diferenciaKg: 0, precioVentaUsd: 3.2, valorVentaUsd: 11_520 });
    const sin = ventaConEstimado({ id: 2, fecha: '2026-11-10', cabezas: 1, pesoPromedioKg: null, precioVentaUsd: null, corral: 'C1', campo: FX, categoria: 'Toros', lote: { fechaEntrada: null, pesoEntradaKg: null } });
    expect(sin).toMatchObject({ pesoRealKg: null, pesoEstimadoKg: null, diferenciaKg: null, precioVentaUsd: null, precioVentaPor: null, valorVentaUsd: null });
  });
});

// --- La API ---

// EJ (estancia): potrero 1 con 100 terneros. FX (feedlot):
//   C1  80 Novillos (lote F), entraron hace 30 días con 300 kg (engorde)
//   C2  20 Novillos (lote G), hace 10 días con 250 kg (adaptación)
//   C3  30 Terneros (lote T), hace 130 días con 200 kg (para salir: atrasado)
//   C4   5 Vacas (lote S), sin fecha de entrada
// Precios: Novillos USD 3/kg, Terneros USD 4/kg, Vacas USD 5.000 por cabeza.
async function preparar() {
  const base = await prepararCampo();
  const { potrero: P1, lote } = await base.potrero('1', { hectareas: 50, lotes: [['A', 'Terneros', 100, 180]] });
  const { cat, agent } = base;
  await prisma.categoria.update({ where: { id: cat.Novillos }, data: { pesoPromedioKg: 400, precioUsd: 3, precioPor: 'KG' } });
  await prisma.categoria.update({ where: { id: cat.Terneros }, data: { pesoPromedioKg: 180, precioUsd: 4, precioPor: 'KG' } });
  await prisma.categoria.update({ where: { id: cat.Vacas }, data: { pesoPromedioKg: 700, precioUsd: 5000, precioPor: 'CABEZA' } });
  const fx = await prisma.campo.create({ data: { sigla: 'FX', nombre: 'Feedlot Ejemplo', tipo: 'CONFINAMIENTO', orden: 10 } });
  const fechaDato = sumarDias(hoy(), -5);
  const lotes = {};
  const corrales = {};
  for (const [n, nombre, categoria, cabezas, dias, peso] of [
    [1, 'F', 'Novillos', 80, 30, 300],
    [2, 'G', 'Novillos', 20, 10, 250],
    [3, 'T', 'Terneros', 30, 130, 200],
    [4, 'S', 'Vacas', 5, null, null],
  ]) {
    const c = await prisma.potrero.create({ data: { campoId: fx.id, nombre: `C${n}`, tipo: 'CORRAL', orden: n } });
    const l = await prisma.lote.create({
      data: { campoId: fx.id, potreroId: c.id, categoriaId: cat[categoria], nombre, fechaEntrada: dias == null ? null : dia(sumarDias(hoy(), -dias)), pesoEntradaKg: peso },
    });
    await prisma.versionStock.create({
      data: { potreroId: c.id, fecha: dia(fechaDato), origen: 'PLANILLA', lineas: { create: [{ loteId: l.id, categoriaId: cat[categoria], cabezas, pesoPromedioKg: peso }] } },
    });
    corrales[`C${n}`] = c;
    lotes[nombre] = l;
  }
  const tipos = Object.fromEntries((await agent.get(`${API}/tipos-movimiento`).expect(200)).body.map((t) => [t.clave, t]));
  return { ...base, P1, A: lote.A, fx, ...corrales, ...lotes, tipos };
}

const registrar = async (agent, body, esperado = 201) => (await agent.post(`${API}/entradas-salidas`).send(body).expect(esperado)).body;

describe('el Resumen del feedlot, por etapa del encierre', () => {
  it('GET /resumen?grupo=feedlots: las categorías por etapa, con el valor del peso estimado de hoy', async () => {
    const { agent } = await preparar();
    const { body } = await agent.get(`${API}/resumen?grupo=feedlots`).expect(200);
    expect(body.tipo).toBe('FEEDLOT');
    expect(body.columnas.map((c) => c.clave)).toEqual(['ADAPTACION', 'ENGORDE', 'HASTA_ENGORDE', 'TERMINACION', 'PARA_SALIR', 'SIN_FECHA']);
    const fila = (categoria) => body.filas.find((f) => f.categoria === categoria);
    expect(fila('Novillos')).toMatchObject({ ADAPTACION: 20, ENGORDE: 80, TERMINACION: 0, PARA_SALIR: 0, SIN_FECHA: 0, total: 100 });
    expect(fila('Terneros')).toMatchObject({ PARA_SALIR: 30, total: 30 });
    expect(fila('Vacas')).toMatchObject({ SIN_FECHA: 5, total: 5 });
    expect(body.totales).toEqual({ ADAPTACION: 20, ENGORDE: 80, TERMINACION: 0, PARA_SALIR: 30, SIN_FECHA: 5, total: 135 });
    // F: 80 × (300 + 30 × 1,5) × 3 · G: 20 × 265 × 3 · T: 30 × 395 × 4 · S: 5 × 5.000.
    expect(fila('Novillos').valorUsd).toBe(80 * 345 * 3 + 20 * 265 * 3);
    expect(body.valor).toEqual({ usd: 82_800 + 15_900 + 47_400 + 25_000, completo: true });
    expect(body.estancias).toEqual([expect.objectContaining({ sigla: 'FX', cabezas: 135, potreros: 4, valorUsd: 171_100 })]);
    // El mismo valor que el análisis por corral.
    const analisis = (await agent.get(`${API}/feedlots`).expect(200)).body;
    expect(analisis.totales.valorUsd).toBe(body.valor.usd);
    expect(analisis.totales).toMatchObject({ atrasados: 1, proximos: 0 });
    expect(analisis.filas.find((f) => f.lote === 'T')).toMatchObject({ atrasado: true, diasParaSalida: -10 });
  });

  it('GET /campos/:id/resumen de un feedlot, también por etapa', async () => {
    const { agent, fx } = await preparar();
    const { body } = await agent.get(`${API}/campos/${fx.id}/resumen`).expect(200);
    expect(body).toMatchObject({ tipo: 'FEEDLOT', campo: { sigla: 'FX' }, totales: { total: 135, ENGORDE: 80 }, etapas: { adaptacionDias: 20, engordeDias: 90, cicloDias: 120 } });
  });

  it('el de las estancias no cambia: CN / Verdeos / Corral / Otro', async () => {
    const { agent, campo } = await preparar();
    const todas = (await agent.get(`${API}/resumen`).expect(200)).body;
    expect(todas.tipo).toBe('ESTANCIA');
    expect(todas.columnas.map((c) => c.clave)).toEqual(['CN', 'VERDEO', 'CORRAL', 'OTRO']);
    expect(todas.totales).toEqual({ CN: 0, VERDEO: 0, CORRAL: 0, OTRO: 100, total: 100 });
    expect(todas.porGrupo.map((g) => g.grupo)).toEqual(['CN', 'VERDEO', 'CORRAL', 'OTRO']);
    const una = (await agent.get(`${API}/campos/${campo.id}/resumen`).expect(200)).body;
    expect(una).toMatchObject({ tipo: 'ESTANCIA', totales: { total: 100 } });
    expect(una.filas[0]).not.toHaveProperty('ADAPTACION');
  });

  it('los límites de las etapas salen de Configuración', async () => {
    const { agent } = await preparar();
    // Con 40 días de adaptación, el lote F (30 días) pasa a adaptación.
    await agent.put(`${API}/parametros/FEEDLOT_ADAPTACION_DIAS`).send({ valor: 40 }).expect(200);
    const { body } = await agent.get(`${API}/resumen?grupo=feedlots`).expect(200);
    expect(body.totales).toMatchObject({ ADAPTACION: 100, ENGORDE: 0 });
    expect(body.columnas.find((c) => c.clave === 'ENGORDE').detalle).toBe('41 a 90 días');
  });
});

describe('parámetros de las etapas', () => {
  it('el seed trae FEEDLOT_ADAPTACION_DIAS (20) y FEEDLOT_ENGORDE_DIAS (90)', async () => {
    const { agent } = await preparar();
    const parametros = (await agent.get(`${API}/parametros`).expect(200)).body;
    expect(parametros).toContainEqual(expect.objectContaining({ clave: 'FEEDLOT_ADAPTACION_DIAS', valor: 20 }));
    expect(parametros).toContainEqual(expect.objectContaining({ clave: 'FEEDLOT_ENGORDE_DIAS', valor: 90 }));
  });

  it('se validan de a uno: adaptación < engorde < ciclo', async () => {
    const { agent } = await preparar();
    expect((await agent.put(`${API}/parametros/FEEDLOT_ADAPTACION_DIAS`).send({ valor: 90 }).expect(400)).body.errors[0]).toMatch(/adaptación/);
    expect((await agent.put(`${API}/parametros/FEEDLOT_ENGORDE_DIAS`).send({ valor: 130 }).expect(400)).body.errors[0]).toMatch(/engorde/);
    await agent.put(`${API}/parametros/CICLO_FEEDLOT_DIAS`).send({ valor: 80 }).expect(400);
    expect(await auditoria('PARAMETRO_CAMBIADO')).toHaveLength(0);
  });

  it('PUT /parametros guarda varios juntos (y los controla juntos), con su auditoría', async () => {
    const { agent } = await preparar();
    // De a uno no se puede (el engorde pasaría al ciclo); juntos, sí.
    const { body } = await agent.put(`${API}/parametros`).send({ valores: { FEEDLOT_ENGORDE_DIAS: 130, CICLO_FEEDLOT_DIAS: 150 } }).expect(200);
    expect(body.map((p) => [p.clave, p.valor])).toEqual([
      ['FEEDLOT_ENGORDE_DIAS', 130],
      ['CICLO_FEEDLOT_DIAS', 150],
    ]);
    expect((await auditoria('PARAMETRO_CAMBIADO')).map((a) => a.entidadId)).toEqual(['FEEDLOT_ENGORDE_DIAS', 'CICLO_FEEDLOT_DIAS']);
    await agent.put(`${API}/parametros`).send({ valores: { FEEDLOT_ADAPTACION_DIAS: 140 } }).expect(400);
    // Si uno no existe, no se guarda ninguno.
    await agent.put(`${API}/parametros`).send({ valores: { GMD_FEEDLOT_KG: 2, NO_EXISTE: 1 } }).expect(404);
    expect((await agent.get(`${API}/parametros`).expect(200)).body).toContainEqual(expect.objectContaining({ clave: 'GMD_FEEDLOT_KG', valor: 1.5 }));
    await agent.put(`${API}/parametros`).send({ valores: {} }).expect(400);
  });
});

describe('precio de venta real', () => {
  it('se valida: solo en una venta; hay que decir si es por kilo o por cabeza; por kilo pide el peso', async () => {
    const { agent, tipos, F } = await preparar();
    const venta = { tipoId: tipos.VENTA.id, loteId: F.id, cabezas: 10, guia: 'V-1' };
    expect((await registrar(agent, { tipoId: tipos.PERDIDA.id, loteId: F.id, cabezas: 1, precioVentaUsd: 3, precioVentaPor: 'KG', pesoPromedioKg: 300 }, 400)).errors[0]).toMatch(
      /no lleva precio de venta/,
    );
    expect((await registrar(agent, { ...venta, precioVentaUsd: 3 }, 400)).errors[0]).toMatch(/por kilo o por cabeza/);
    expect((await registrar(agent, { ...venta, precioVentaUsd: 3, precioVentaPor: 'KG' }, 400)).errors[0]).toMatch(/peso de salida/);
    await registrar(agent, { ...venta, precioVentaUsd: -1, precioVentaPor: 'KG', pesoPromedioKg: 360 }, 400);
    await registrar(agent, { ...venta, precioVentaUsd: 3, precioVentaPor: 'LITRO', pesoPromedioKg: 360 }, 400);
    // La vista previa también lo controla, y dice cuánto vale la venta.
    await agent.post(`${API}/entradas-salidas/vista-previa`).send({ ...venta, precioVentaUsd: 3 }).expect(400);
    const previa = (await agent.post(`${API}/entradas-salidas/vista-previa`).send({ ...venta, pesoPromedioKg: 360, precioVentaUsd: 3.2, precioVentaPor: 'KG' }).expect(200)).body;
    expect(previa.valorVentaUsd).toBe(11_520);
    expect(await prisma.movimiento.count()).toBe(0);
  });

  it('se guarda, se ve en la lista y queda en la auditoría', async () => {
    const { agent, tipos, F, fx } = await preparar();
    const { movimientos } = await registrar(agent, { tipoId: tipos.VENTA.id, loteId: F.id, cabezas: 10, pesoPromedioKg: 360, precioVentaUsd: 3.2, precioVentaPor: 'KG', guia: 'V-1' });
    expect(movimientos[0]).toMatchObject({ modo: 'SALIDA', cabezas: 10, pesoPromedioKg: 360, precioVentaUsd: 3.2, precioVentaPor: 'KG', valorVentaUsd: 11_520 });
    const fila = await prisma.movimiento.findUnique({ where: { id: movimientos[0].id } });
    expect([Number(fila.precioVentaUsd), fila.precioVentaPor]).toEqual([3.2, 'KG']);

    const lista = (await agent.get(`${API}/campos/${fx.id}/movimientos`).expect(200)).body.movimientos;
    expect(lista[0]).toMatchObject({ precioVentaUsd: 3.2, precioVentaPor: 'KG', valorVentaUsd: 11_520 });

    const [a] = await auditoria('MOVIMIENTO_REGISTRADO');
    expect(a.detalle).toMatchObject({ tipo: 'Venta o faena', cabezas: 10, pesoPromedioKg: 360, precioVentaUsd: 3.2, precioVentaPor: 'KG', valorVentaUsd: 11_520, guia: 'V-1' });
  });

  it('por cabeza no pide el peso; una venta sin precio no lo lleva', async () => {
    const { agent, tipos, S, G } = await preparar();
    const porCabeza = await registrar(agent, { tipoId: tipos.VENTA.id, loteId: S.id, cabezas: 2, precioVentaUsd: 4800, precioVentaPor: 'CABEZA', guia: 'V-2' });
    expect(porCabeza.movimientos[0]).toMatchObject({ precioVentaUsd: 4800, precioVentaPor: 'CABEZA', valorVentaUsd: 9600 });
    const sin = await registrar(agent, { tipoId: tipos.VENTA.id, loteId: G.id, cabezas: 2, guia: 'V-3', precioVentaPor: 'KG' });
    expect(sin.movimientos[0]).toMatchObject({ precioVentaUsd: null, precioVentaPor: null, valorVentaUsd: null });
    const [, a] = await auditoria('MOVIMIENTO_REGISTRADO');
    expect(a.detalle).not.toHaveProperty('precioVentaUsd');
  });

  it('revertir una venta con precio sigue funcionando igual', async () => {
    const { agent, tipos, F, C1, fx } = await preparar();
    const { movimientos } = await registrar(agent, { tipoId: tipos.VENTA.id, loteId: F.id, cabezas: 80, pesoPromedioKg: 360, precioVentaUsd: 3.2, precioVentaPor: 'KG', guia: 'V-1' });
    expect((await prisma.lote.findUnique({ where: { id: F.id } })).activo).toBe(false);
    await agent.post(`${API}/movimientos/${movimientos[0].id}/revertir`).expect(201);
    const corral = (await agent.get(`${API}/potreros/${C1.id}`).expect(200)).body;
    expect(corral.stock.lineas.map((l) => [l.lote, l.cabezas])).toEqual([['F', 80]]);
    const lista = (await agent.get(`${API}/campos/${fx.id}/movimientos`).expect(200)).body.movimientos;
    expect(lista.find((m) => m.id === movimientos[0].id)).toMatchObject({ revertido: true, valorVentaUsd: 92_160 });
    // Una venta revertida no está entre las últimas ventas.
    expect((await agent.get(`${API}/campos/${fx.id}/feedlot`).expect(200)).body.ventas).toEqual([]);
  });
});

describe('Últimas ventas, en el análisis del feedlot', () => {
  it('las ventas de los corrales en los últimos 90 días, con el peso estimado a esa fecha', async () => {
    const { agent, tipos, F, S, A, fx, C1, cat } = await preparar();
    const ayer = sumarDias(hoy(), -1);
    await registrar(agent, { tipoId: tipos.VENTA.id, loteId: F.id, cabezas: 10, pesoPromedioKg: 360, precioVentaUsd: 3.2, precioVentaPor: 'KG', guia: 'V-1', fecha: ayer });
    await registrar(agent, { tipoId: tipos.VENTA.id, loteId: S.id, cabezas: 1, guia: 'V-2' });
    // Una venta de la estancia no es del feedlot; una muerte no es una venta.
    await registrar(agent, { tipoId: tipos.VENTA.id, loteId: A.id, cabezas: 5, guia: 'V-3', pesoPromedioKg: 200, precioVentaUsd: 4, precioVentaPor: 'KG' });
    // Una de hace más de 90 días no entra.
    await prisma.movimiento.create({
      data: {
        campoId: fx.id,
        tipoId: tipos.VENTA.id,
        modo: 'SALIDA',
        fecha: dia(sumarDias(hoy(), -100)),
        cabezas: 3,
        loteOrigenId: F.id,
        potreroOrigenId: C1.id,
        categoriaOrigenId: cat.Novillos,
        precioVentaUsd: 3,
        precioVentaPor: 'KG',
        pesoPromedioKg: 300,
      },
    });

    const { body } = await agent.get(`${API}/campos/${fx.id}/feedlot`).expect(200);
    expect(body.ventas).toHaveLength(2);
    const [sinPrecio, venta] = body.ventas;
    // F entró hace 30 días con 300 kg; ayer llevaba 29 días: ≈343,5 kg.
    expect(venta).toMatchObject({
      fecha: ayer,
      corral: 'C1',
      campo: { sigla: 'FX' },
      categoria: 'Novillos',
      cabezas: 10,
      diasEncierre: 29,
      pesoRealKg: 360,
      pesoEstimadoKg: 343.5,
      diferenciaKg: 16.5,
      precioVentaUsd: 3.2,
      precioVentaPor: 'KG',
      valorVentaUsd: 11_520,
    });
    // Vacas sin fecha ni peso ni precio: "—".
    expect(sinPrecio).toMatchObject({ corral: 'C4', categoria: 'Vacas', cabezas: 1, pesoRealKg: null, pesoEstimadoKg: null, diferenciaKg: null, precioVentaUsd: null, valorVentaUsd: null });
    // Con "Todos los feedlots", también.
    expect((await agent.get(`${API}/feedlots`).expect(200)).body.ventas).toHaveLength(2);
  });
});
