// Los feedlots como entidades propias (docs/superpowers/plans/2026-11-19-feedlots.md):
// grupo "estancias" / "feedlots" en Resumen, Potreros y Movimientos; los datos
// propios del corral (metros de comedero, entrada del lote); los parámetros
// GMD_FEEDLOT_KG y CICLO_FEEDLOT_DIAS; y el análisis por corral.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { analisisFeedlot, diasEntre, sumarDias } from '../src/pecuaria/feedlot.service.js';
import { BOB, loggedAgent, useTestDatabase, usuarioCon } from './helpers.js';
import { auditoria, dia, hoy, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

// --- La función pura, con fechas fijas ---

const FX = { id: 9, sigla: 'FX', nombre: 'Feedlot Ejemplo' };
const corral = (id, nombre, metros, lineas) => ({ id, nombre, metrosComedero: metros, campo: FX, fecha: '2026-11-12', lineas });
const linea = (loteId, categoriaId, cabezas, extra = {}) => ({ loteId, lote: `L${loteId}`, categoriaId, categoria: `Cat ${categoriaId}`, cabezas, pesoPromedioKg: null, fechaEntrada: null, pesoEntradaKg: null, ...extra });

describe('analisisFeedlot (cálculo puro)', () => {
  const parametros = {
    kgPorUg: 380,
    categorias: new Map([
      [1, { pesoPromedioKg: 360, precioUsd: 3, precioPor: 'KG' }],
      [2, { pesoPromedioKg: 600, precioUsd: 5000, precioPor: 'CABEZA' }],
    ]),
  };
  const corrales = [
    // 100 cab que entraron el 01/10 con 300 kg: 40 días, ≈360 kg, salen el 29/01.
    corral(1, 'Corral 1', 40, [linea(11, 1, 100, { fechaEntrada: '2026-10-01', pesoEntradaKg: 300, pesoPromedioKg: 300 })]),
    // 50 cab que entraron el 20/07: 114 días, salen el 17/11 (faltan 6: en ámbar). Sin peso de entrada.
    corral(2, 'Corral 2', 25, [linea(21, 1, 50, { fechaEntrada: '2026-07-20' })]),
    // 10 toros sin fecha ni peso, valuados por cabeza; sin metros de comedero.
    corral(3, 'Corral 3', null, [linea(31, 2, 10)]),
    // Vacío.
    corral(4, 'Corral 4', 40, []),
  ];
  const r = analisisFeedlot({ corrales, hoy: '2026-11-10', gmdKg: 1.5, cicloDias: 120, parametros });

  it('días de encierre, peso estimado, salida probable y m de comedero por cabeza', () => {
    expect(r.filas).toHaveLength(3);
    expect(r.filas[0]).toMatchObject({
      corral: 'Corral 1',
      cabezas: 100,
      diasEncierre: 40,
      pesoEntradaKg: 300,
      pesoEstimadoKg: 360,
      salidaProbable: '2027-01-29',
      diasParaSalida: 80,
      salidaCerca: false,
      mComederoPorCabeza: 0.4,
      // 100 × 360 kg × USD 3.
      valorUsd: 108_000,
      valorAprox: true,
    });
    expect(r.filas[1]).toMatchObject({ diasEncierre: 113, pesoEstimadoKg: null, salidaProbable: '2026-11-17', diasParaSalida: 7, salidaCerca: false, mComederoPorCabeza: 0.5 });
  });

  it('si falta un dato, lo que depende de él queda en null', () => {
    expect(r.filas[2]).toMatchObject({ diasEncierre: null, pesoEstimadoKg: null, salidaProbable: null, diasParaSalida: null, mComederoPorCabeza: null, valorUsd: 50_000 });
    expect(r.vacios).toEqual([{ corralId: 4, corral: 'Corral 4', campo: FX }]);
  });

  it('la salida se marca si falta menos de una semana; si ya pasó, está atrasado', () => {
    const tarde = analisisFeedlot({ corrales, hoy: '2026-11-11', gmdKg: 1.5, cicloDias: 120, parametros });
    expect(tarde.filas[1]).toMatchObject({ diasParaSalida: 6, salidaCerca: true, atrasado: false });
    const pasada = analisisFeedlot({ corrales, hoy: '2026-12-01', gmdKg: 1.5, cicloDias: 120, parametros });
    expect(pasada.filas[1]).toMatchObject({ diasParaSalida: -14, salidaCerca: false, atrasado: true });
    expect(pasada.totales).toMatchObject({ atrasados: 1, proximos: 0 });
  });

  it('totales: cabezas, corrales, días ponderados por cabezas, valor, atrasados y salidas en 30 días', () => {
    // Días: (40 × 100 + 113 × 50) / 150 = 64,3. El corral 2 no tiene peso: se valúa con el de la categoría (≈360 kg).
    expect(r.totales).toMatchObject({ cabezas: 160, corrales: 3, diasPromedio: 64.3, atrasados: 0, proximos: 1 });
    expect(r.totales.valorUsd).toBe(108_000 + 50 * 360 * 3 + 50_000);
    expect(r.totales.valorCompleto).toBe(true);
    expect(r.fecha).toBe('2026-11-12');
  });

  it('el GMD y el ciclo salen de los parámetros', () => {
    const otro = analisisFeedlot({ corrales, hoy: '2026-11-10', gmdKg: 1, cicloDias: 90, parametros });
    expect(otro.filas[0]).toMatchObject({ pesoEstimadoKg: 340, salidaProbable: '2026-12-30' });
  });

  it('sin los parámetros de las categorías no hay valor', () => {
    const sin = analisisFeedlot({ corrales, hoy: '2026-11-10' });
    expect(sin.filas[0].valorUsd).toBeNull();
    expect(sin.totales).toMatchObject({ valorUsd: null, valorCompleto: false });
  });

  it('cuenta los días entre fechas', () => {
    expect(diasEntre('2026-09-24', '2026-11-12')).toBe(49);
    expect(sumarDias('2026-12-15', 30)).toBe('2027-01-14');
  });
});

// --- La API ---

// EJ (estancia): potrero 1 con 100 terneros (lote A). FX (feedlot, orden 10):
// corral C1 con 80 novillos (lote F, entró hace 30 días con 300 kg, 40 m de
// comedero) y C2 vacío. Bob solo tiene EJ; Carla solo FX.
async function preparar() {
  const base = await prepararCampo();
  const { potrero: P1, lote: l1 } = await base.potrero('1', { hectareas: 50, lotes: [['A', 'Terneros', 100, 180]] });
  const fx = await prisma.campo.create({ data: { sigla: 'FX', nombre: 'Feedlot Ejemplo', tipo: 'CONFINAMIENTO', orden: 10 } });
  const C1 = await prisma.potrero.create({ data: { campoId: fx.id, nombre: 'C1', tipo: 'CORRAL', metrosComedero: 40, orden: 1 } });
  const C2 = await prisma.potrero.create({ data: { campoId: fx.id, nombre: 'C2', tipo: 'CORRAL', orden: 2 } });
  const entro = sumarDias(hoy(), -30);
  const F = await prisma.lote.create({
    data: { campoId: fx.id, potreroId: C1.id, categoriaId: base.cat.Novillos, nombre: 'F', fechaEntrada: dia(entro), pesoEntradaKg: 300 },
  });
  await prisma.versionStock.create({
    data: { potreroId: C1.id, fecha: dia('2026-11-12'), origen: 'PLANILLA', lineas: { create: [{ loteId: F.id, categoriaId: base.cat.Novillos, cabezas: 80, pesoPromedioKg: 300 }] } },
  });
  await usuarioCon(BOB, { permisos: ['pecuaria:VER'], campoIds: [base.campo.id] });
  const CARLA = { usuario: 'carla', nombre: 'Carla Test', password: 'password789' };
  await usuarioCon(CARLA, { permisos: ['pecuaria:VER'], campoIds: [fx.id] });
  return { ...base, P1, A: l1.A, fx, C1, C2, F, entro, bob: await loggedAgent(BOB), carla: await loggedAgent(CARLA) };
}

const siglas = (potreros) => potreros.map((p) => `${p.campo.sigla} ${p.nombre}`);

describe('grupo estancias / feedlots', () => {
  it('GET /campos trae el tipo de cada campo', async () => {
    const { agent } = await preparar();
    const { body } = await agent.get('/api/pecuaria/campos').expect(200);
    expect(body.map((c) => [c.sigla, c.tipo])).toEqual([['EJ', 'ESTANCIA'], ['FX', 'CONFINAMIENTO']]);
  });

  it('Resumen: sin el parámetro, solo las estancias; con grupo=feedlots, solo los feedlots', async () => {
    const { agent } = await preparar();
    const estancias = (await agent.get('/api/pecuaria/resumen').expect(200)).body;
    expect(estancias.estancias.map((e) => e.sigla)).toEqual(['EJ']);
    expect(estancias.totales.total).toBe(100);
    expect((await agent.get('/api/pecuaria/resumen?grupo=estancias').expect(200)).body.totales.total).toBe(100);
    const feedlots = (await agent.get('/api/pecuaria/resumen?grupo=feedlots').expect(200)).body;
    expect(feedlots.estancias.map((e) => e.sigla)).toEqual(['FX']);
    // Los feedlots, por etapa del encierre: el lote F entró hace 30 días (engorde).
    expect(feedlots.totales).toMatchObject({ total: 80, ENGORDE: 80 });
    await agent.get('/api/pecuaria/resumen?grupo=todo').expect(400);
  });

  it('Potreros: cada grupo con lo suyo', async () => {
    const { agent } = await preparar();
    expect(siglas((await agent.get('/api/pecuaria/potreros').expect(200)).body)).toEqual(['EJ 1']);
    const feedlots = (await agent.get('/api/pecuaria/potreros?grupo=feedlots').expect(200)).body;
    expect(siglas(feedlots)).toEqual(['FX C1', 'FX C2']);
    // Un corral no tiene hectáreas: los valores por hectárea quedan vacíos, sin romper nada.
    expect(feedlots[0]).toMatchObject({ tipo: 'CORRAL', hectareas: null, metrosComedero: 40, stock: { cabezas: 80, cabHa: null, ugHa: null } });
  });

  it('el alcance por usuario se sigue respetando', async () => {
    const { bob, carla } = await preparar();
    expect(siglas((await bob.get('/api/pecuaria/potreros?grupo=feedlots').expect(200)).body)).toEqual([]);
    expect((await bob.get('/api/pecuaria/resumen?grupo=feedlots').expect(200)).body.estancias).toEqual([]);
    expect(siglas((await carla.get('/api/pecuaria/potreros').expect(200)).body)).toEqual([]);
    expect(siglas((await carla.get('/api/pecuaria/potreros?grupo=feedlots').expect(200)).body)).toEqual(['FX C1', 'FX C2']);
  });

  it('un movimiento de la estancia al feedlot aparece en las dos listas, y la entrada al corral queda cargada', async () => {
    const { agent, A, C2, cat } = await preparar();
    const { body } = await agent
      .post('/api/pecuaria/movimientos/entre-campos')
      .send({ loteOrigenId: A.id, cabezas: 40, destinoPotreroId: C2.id, modo: 'NUEVO', nuevoLote: { categoriaId: cat.Terneros }, fecha: '2026-11-14' })
      .expect(201);
    const claves = async (grupo) => (await agent.get(`/api/pecuaria/movimientos?grupo=${grupo}`).expect(200)).body.movimientos.map((m) => m.tipo.clave);
    expect(await claves('estancias')).toEqual(['ENTRE_CAMPOS']);
    expect(await claves('feedlots')).toEqual(['ENTRE_CAMPOS']);
    await agent.get('/api/pecuaria/movimientos?grupo=x').expect(400);

    const lote = await prisma.lote.findFirst({ where: { potreroId: C2.id, activo: true } });
    expect(lote.fechaEntrada.toISOString().slice(0, 10)).toBe('2026-11-14');
    // El peso de entrada: el de los que llegan (el promedio del lote, 180 kg).
    expect(Number(lote.pesoEntradaKg)).toBe(180);
    expect(body.movimiento.potreroDestino).toBe('C2');
  });

  it('si el lote ya tenía la fecha de entrada, no se pisa', async () => {
    const { agent, A, C2 } = await preparar();
    await prisma.lote.update({ where: { id: A.id }, data: { fechaEntrada: dia('2026-11-01') } });
    await agent.post('/api/pecuaria/movimientos/entre-campos').send({ loteOrigenId: A.id, cabezas: 100, destinoPotreroId: C2.id, modo: 'ENTERO', fecha: '2026-11-14' }).expect(201);
    const lote = await prisma.lote.findUnique({ where: { id: A.id } });
    expect(lote.fechaEntrada.toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(Number(lote.pesoEntradaKg)).toBe(180);
  });

  it('de un corral a otro, una parte que forma un lote nuevo conserva la entrada', async () => {
    const { agent, F, C2, cat, entro } = await preparar();
    await agent.post('/api/pecuaria/movimientos').send({ loteOrigenId: F.id, cabezas: 20, destinoPotreroId: C2.id, modo: 'NUEVO', nuevoLote: { categoriaId: cat.Novillos } }).expect(201);
    const parte = await prisma.lote.findFirst({ where: { potreroId: C2.id, activo: true } });
    expect(parte.fechaEntrada.toISOString().slice(0, 10)).toBe(entro);
    expect(Number(parte.pesoEntradaKg)).toBe(300);
  });
});

describe('datos propios del corral', () => {
  it('los metros de comedero se editan (EDITAR) y quedan en la auditoría', async () => {
    const { agent, C1 } = await preparar();
    const { body } = await agent.patch(`/api/pecuaria/potreros/${C1.id}`).send({ metrosComedero: '42,5' }).expect(200);
    expect(body.metrosComedero).toBe(42.5);
    expect((await agent.get(`/api/pecuaria/potreros/${C1.id}`).expect(200)).body.metrosComedero).toBe(42.5);
    const [fila] = await auditoria('POTRERO_EDITADO');
    expect(fila.detalle).toEqual({ antes: { metrosComedero: 40 }, despues: { metrosComedero: 42.5 } });
    await agent.patch(`/api/pecuaria/potreros/${C1.id}`).send({ metrosComedero: -1 }).expect(400);
    await agent.patch(`/api/pecuaria/potreros/${C1.id}`).send({ metrosComedero: '' }).expect(200);
  });

  it('la entrada del lote (fecha y peso) se edita (CREAR) y queda en la auditoría', async () => {
    const { agent, F, entro } = await preparar();
    const { body } = await agent.patch(`/api/pecuaria/lotes/${F.id}`).send({ fechaEntrada: '2026-10-01', pesoEntradaKg: '310' }).expect(200);
    expect(body).toMatchObject({ nombre: 'F', fechaEntrada: '2026-10-01', pesoEntradaKg: 310 });
    const [fila] = await auditoria('LOTE_EDITADO');
    expect(fila.detalle).toEqual({ antes: { fechaEntrada: entro, pesoEntradaKg: 300 }, despues: { fechaEntrada: '2026-10-01', pesoEntradaKg: 310 } });
    // La ficha del lote y la del corral la muestran.
    expect((await agent.get(`/api/pecuaria/lotes/${F.id}`).expect(200)).body.lote).toMatchObject({ fechaEntrada: '2026-10-01', pesoEntradaKg: 310, potrero: { tipo: 'CORRAL' } });
    expect((await agent.get(`/api/pecuaria/potreros/${F.potreroId}`).expect(200)).body.stock.lineas[0]).toMatchObject({ fechaEntrada: '2026-10-01', pesoEntradaKg: 310 });
    // Vacío borra el dato; una fecha futura o un cuerpo vacío, no.
    expect((await agent.patch(`/api/pecuaria/lotes/${F.id}`).send({ pesoEntradaKg: '' }).expect(200)).body.pesoEntradaKg).toBeNull();
    await agent.patch(`/api/pecuaria/lotes/${F.id}`).send({ fechaEntrada: '2999-01-01' }).expect(400);
    await agent.patch(`/api/pecuaria/lotes/${F.id}`).send({}).expect(400);
  });

  it('quien solo ve no edita', async () => {
    const { carla, C1, F } = await preparar();
    await carla.patch(`/api/pecuaria/potreros/${C1.id}`).send({ metrosComedero: 10 }).expect(403);
    await carla.patch(`/api/pecuaria/lotes/${F.id}`).send({ pesoEntradaKg: 10 }).expect(403);
  });
});

describe('parámetros del feedlot', () => {
  it('el seed trae GMD_FEEDLOT_KG (1,5) y CICLO_FEEDLOT_DIAS (120), y se editan', async () => {
    const { agent } = await preparar();
    const parametros = (await agent.get('/api/pecuaria/parametros').expect(200)).body;
    expect(parametros).toContainEqual(expect.objectContaining({ clave: 'GMD_FEEDLOT_KG', valor: 1.5 }));
    expect(parametros).toContainEqual(expect.objectContaining({ clave: 'CICLO_FEEDLOT_DIAS', valor: 120 }));
    await agent.put('/api/pecuaria/parametros/CICLO_FEEDLOT_DIAS').send({ valor: 100 }).expect(200);
    const [fila] = await auditoria('PARAMETRO_CAMBIADO');
    expect(fila).toMatchObject({ entidadId: 'CICLO_FEEDLOT_DIAS', detalle: { antes: 120, despues: 100 } });
  });
});

describe('GET /campos/:id/feedlot y /feedlots', () => {
  it('el análisis de un feedlot, con los parámetros', async () => {
    const { agent, fx, entro } = await preparar();
    await agent.put('/api/pecuaria/parametros/GMD_FEEDLOT_KG').send({ valor: 2 }).expect(200);
    const { body } = await agent.get(`/api/pecuaria/campos/${fx.id}/feedlot`).expect(200);
    expect(body.campo).toMatchObject({ sigla: 'FX' });
    expect(body).toMatchObject({ gmdKg: 2, cicloDias: 120, fecha: '2026-11-12' });
    expect(body.filas).toHaveLength(1);
    expect(body.filas[0]).toMatchObject({
      corral: 'C1',
      lote: 'F',
      categoria: 'Novillos',
      cabezas: 80,
      fechaEntrada: entro,
      diasEncierre: 30,
      pesoEntradaKg: 300,
      pesoEstimadoKg: 360,
      salidaProbable: sumarDias(entro, 120),
      diasParaSalida: 90,
      mComederoPorCabeza: 0.5,
    });
    expect(body.vacios.map((v) => v.corral)).toEqual(['C2']);
    expect(body.totales).toMatchObject({ cabezas: 80, corrales: 1, diasPromedio: 30, atrasados: 0, proximos: 0 });
  });

  it('una estancia no tiene esta vista; otra estancia del usuario contesta 404', async () => {
    const { agent, bob, campo, fx } = await preparar();
    await agent.get(`/api/pecuaria/campos/${campo.id}/feedlot`).expect(400);
    await bob.get(`/api/pecuaria/campos/${fx.id}/feedlot`).expect(404);
  });

  it('todos los feedlots del usuario, con una fila por feedlot', async () => {
    const { agent, bob, carla } = await preparar();
    const { body } = await agent.get('/api/pecuaria/feedlots').expect(200);
    expect(body.feedlots).toEqual([expect.objectContaining({ sigla: 'FX', cabezas: 80, corrales: 1 })]);
    expect(body.filas.map((f) => `${f.campo.sigla} ${f.corral}`)).toEqual(['FX C1']);
    expect((await carla.get('/api/pecuaria/feedlots').expect(200)).body.totales.cabezas).toBe(80);
    const deBob = (await bob.get('/api/pecuaria/feedlots').expect(200)).body;
    expect(deBob).toMatchObject({ feedlots: [], filas: [], totales: { cabezas: 0 } });
  });
});
