// Pasto de los potreros, parte A (docs/superpowers/plans/2026-11-26-pasto.md):
// la altura (Bajo / Medio / Alto) anotada al mover o en una recorrida, y los
// días con ganado o de descanso de cada potrero.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { descanso, diasEntre, ultimaLectura } from '../src/pecuaria/pasto.js';
import { BOB, loggedAgent, useTestDatabase, usuarioCon } from './helpers.js';
import { auditoria, hoy, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

// EJ: potrero 1 con el lote A (100 terneros) y el lote B (20 vacas), potreros
// 2 y 3 vacíos (sin versiones) y un corral.
async function preparar() {
  const base = await prepararCampo();
  const { potrero: P1, lote } = await base.potrero('1', {
    hectareas: 50,
    lotes: [
      ['A', 'Terneros', 100, 180],
      ['B', 'Vacas', 20, 400],
    ],
  });
  const { potrero: P2 } = await base.potrero('2', { hectareas: 40 });
  const { potrero: P3 } = await base.potrero('3', { hectareas: 30 });
  const { potrero: C1 } = await base.potrero('Corral 1', { tipo: 'CORRAL' });
  return { ...base, P1, P2, P3, C1, A: lote.A, B: lote.B };
}

const mover = (agent, body) => agent.post('/api/pecuaria/movimientos').send({ modo: 'ENTERO', fecha: '2026-11-14', ...body });
const lecturas = (where = {}) => prisma.lecturaPasto.findMany({ where, orderBy: { id: 'asc' } });
const enLista = async (agent, campo, potrero) =>
  (await agent.get(`/api/pecuaria/campos/${campo.id}/potreros`).expect(200)).body.find((p) => p.id === potrero.id);

describe('lo puro', () => {
  it('diasEntre cuenta días de calendario', () => {
    expect(diasEntre('2026-11-13', '2026-11-26')).toBe(13);
    expect(diasEntre('2026-02-27', '2026-03-01')).toBe(2);
  });

  it('ultimaLectura: la de fecha más nueva, el mismo día la última cargada, sin las anuladas', () => {
    const l = [
      { id: 1, fecha: '2026-11-10', altura: 'ALTO' },
      { id: 3, fecha: '2026-11-12', altura: 'BAJO' },
      { id: 2, fecha: '2026-11-12', altura: 'MEDIO' },
      { id: 4, fecha: '2026-11-20', altura: 'ALTO', anulada: true },
    ];
    expect(ultimaLectura(l)).toMatchObject({ id: 3, altura: 'BAJO' });
    expect(ultimaLectura([])).toBeNull();
    expect(ultimaLectura([{ id: 1, fecha: '2026-11-01', anulada: true }])).toBeNull();
  });

  it('descanso: vacío desde que salió el último animal', () => {
    const v = [
      { fecha: '2026-11-01', cabezas: 50, origen: 'PLANILLA' },
      { fecha: '2026-11-05', cabezas: 20, origen: 'MOVIMIENTO' },
      { fecha: '2026-11-10', cabezas: 0, origen: 'MOVIMIENTO' },
      { fecha: '2026-11-12', cabezas: 0, origen: 'MANUAL' },
    ];
    expect(descanso(v, '2026-11-26')).toEqual({ conGanado: false, desde: '2026-11-10', dias: 16, masDe: false });
  });

  it('descanso: con ganado desde que entraron', () => {
    const v = [
      { fecha: '2026-11-01', cabezas: 0, origen: 'PLANILLA' },
      { fecha: '2026-11-20', cabezas: 30, origen: 'MOVIMIENTO' },
      { fecha: '2026-11-22', cabezas: 45, origen: 'MOVIMIENTO' },
    ];
    expect(descanso(v, '2026-11-26')).toEqual({ conGanado: true, desde: '2026-11-20', dias: 6, masDe: false });
  });

  it('descanso: así desde la carga inicial = "más de"; desde el primer movimiento, exacto; sin versiones, null', () => {
    expect(descanso([{ fecha: '2026-11-13', cabezas: 0, origen: 'PLANILLA' }], '2026-11-26')).toMatchObject({ conGanado: false, dias: 13, masDe: true });
    expect(descanso([{ fecha: '2026-11-13', cabezas: 80, origen: 'PLANILLA' }], '2026-11-26')).toMatchObject({ conGanado: true, masDe: true });
    expect(descanso([{ fecha: '2026-11-20', cabezas: 30, origen: 'MOVIMIENTO' }], '2026-11-26')).toMatchObject({ conGanado: true, dias: 6, masDe: false });
    expect(descanso([], '2026-11-26')).toBeNull();
  });
});

describe('pasto al mover', () => {
  it('deja una lectura SALIDA en el origen y una ENTRADA en el destino, colgadas del movimiento', async () => {
    const { agent, A, P1, P2 } = await preparar();
    const { body } = await mover(agent, { loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P2.id, pastoOrigen: 'BAJO', pastoDestino: 'ALTO' }).expect(201);
    const ls = await lecturas();
    expect(ls.map((l) => [l.potreroId, l.momento, l.altura, l.movimientoId])).toEqual([
      [P1.id, 'SALIDA', 'BAJO', body.movimiento.id],
      [P2.id, 'ENTRADA', 'ALTO', body.movimiento.id],
    ]);
    expect(ls[0].fecha.toISOString().slice(0, 10)).toBe('2026-11-14');
    const [audit] = await auditoria('MOVIMIENTO_REGISTRADO');
    expect(audit.detalle.pasto).toEqual({ salida: 'Bajo en 1', entrada: 'Alto en 2' });
  });

  it('se puede anotar uno solo, o ninguno (como antes)', async () => {
    const { agent, A, B, P2, P3 } = await preparar();
    await mover(agent, { loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P2.id, pastoDestino: 'MEDIO' }).expect(201);
    await mover(agent, { loteOrigenId: B.id, cabezas: 20, destinoPotreroId: P3.id }).expect(201);
    expect((await lecturas()).map((l) => [l.potreroId, l.momento])).toEqual([[P2.id, 'ENTRADA']]);
  });

  it('un cambio de categoría (mismo potrero) no anota pasto', async () => {
    const { agent, cat, A, P1 } = await preparar();
    await agent
      .post('/api/pecuaria/movimientos')
      .send({ modo: 'CATEGORIA', loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P1.id, categoriaId: cat.Novillos, fecha: '2026-11-14', pastoOrigen: 'ALTO' })
      .expect(201);
    expect(await lecturas()).toEqual([]);
  });

  it('un corral no lleva pasto', async () => {
    const { agent, A, C1 } = await preparar();
    const res = await mover(agent, { loteOrigenId: A.id, cabezas: 10, modo: 'NUEVO', mismoLote: true, destinoPotreroId: C1.id, pastoDestino: 'ALTO' }).expect(400);
    expect(res.body.errors[0]).toMatch(/corral/);
    expect(await lecturas()).toEqual([]);
  });

  it('una altura que no es de la escala da error', async () => {
    const { agent, A, P2 } = await preparar();
    const res = await mover(agent, { loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P2.id, pastoDestino: 'ALTISIMO' }).expect(400);
    expect(res.body.errors[0]).toMatch(/Bajo, Medio o Alto/);
  });

  it('la vista previa lo muestra y no guarda nada', async () => {
    const { agent, A, P2 } = await preparar();
    const { body } = await agent
      .post('/api/pecuaria/movimientos/vista-previa')
      .send({ modo: 'ENTERO', loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P2.id, pastoOrigen: 'MEDIO' })
      .expect(200);
    expect(body.pasto).toEqual({ salida: 'Medio en 1' });
    expect(await lecturas()).toEqual([]);
  });

  it('revertir el movimiento anula sus lecturas', async () => {
    const { agent, A, P2 } = await preparar();
    const { body } = await mover(agent, { loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P2.id, pastoOrigen: 'BAJO', pastoDestino: 'ALTO' }).expect(201);
    await agent.post(`/api/pecuaria/movimientos/${body.movimiento.id}/revertir`).expect(201);
    expect((await lecturas()).map((l) => l.anulada)).toEqual([true, true]);
    expect((await agent.get(`/api/pecuaria/potreros/${P2.id}`).expect(200)).body.pasto).toBeNull();
  });

  it('en un movimiento múltiple, cada paso anota el suyo y revertir el evento los anula todos', async () => {
    const { agent, A, B, P2, P3 } = await preparar();
    const { body } = await agent
      .post('/api/pecuaria/movimientos/multiple')
      .send({
        fecha: '2026-11-14',
        pasos: [
          { loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P2.id, modo: 'ENTERO', pastoDestino: 'ALTO' },
          { loteOrigenId: B.id, cabezas: 20, destinoPotreroId: P3.id, modo: 'ENTERO', pastoOrigen: 'BAJO', pastoDestino: 'MEDIO' },
        ],
      })
      .expect(201);
    expect((await lecturas()).map((l) => [l.momento, l.altura])).toEqual([
      ['ENTRADA', 'ALTO'],
      ['SALIDA', 'BAJO'],
      ['ENTRADA', 'MEDIO'],
    ]);
    await agent.post(`/api/pecuaria/eventos/${body.evento.id}/revertir`).expect(201);
    expect((await lecturas()).every((l) => l.anulada)).toBe(true);
  });
});

describe('recorrida', () => {
  it('varios potreros de una vez, con un solo grupo y su auditoría', async () => {
    const { agent, P1, P2, P3 } = await preparar();
    const { body } = await agent
      .post('/api/pecuaria/pasto')
      .send({
        fecha: '2026-11-20',
        lecturas: [
          { potreroId: P1.id, altura: 'BAJO' },
          { potreroId: P2.id, altura: 'ALTO' },
          { potreroId: P3.id, altura: 'MEDIO' },
        ],
        nota: 'Recorrida de la mañana',
      })
      .expect(201);
    expect(body.lecturas).toHaveLength(3);
    const ls = await lecturas();
    expect(new Set(ls.map((l) => l.grupoId))).toEqual(new Set([body.grupoId]));
    expect(ls.every((l) => l.momento === 'RECORRIDA' && l.movimientoId === null)).toBe(true);
    const [audit] = await auditoria('PASTO_REGISTRADO');
    expect(audit.detalle).toMatchObject({ grupoId: body.grupoId, fecha: '2026-11-20', nota: 'Recorrida de la mañana' });
    expect(audit.detalle.lecturas).toEqual([
      { potrero: '1', altura: 'BAJO' },
      { potrero: '2', altura: 'ALTO' },
      { potrero: '3', altura: 'MEDIO' },
    ]);
  });

  it('sin fecha, hoy', async () => {
    const { agent, P2 } = await preparar();
    const { body } = await agent.post('/api/pecuaria/pasto').send({ lecturas: [{ potreroId: P2.id, altura: 'MEDIO' }] }).expect(201);
    expect(body.fecha).toBe(hoy());
  });

  it('controles: fecha futura, potrero repetido, corral, otra estancia, vacía', async () => {
    const { agent, P1, P2, C1 } = await preparar();
    const post = (body) => agent.post('/api/pecuaria/pasto').send(body).expect(400);
    expect((await post({ fecha: '2099-01-01', lecturas: [{ potreroId: P1.id, altura: 'BAJO' }] })).body.errors[0]).toMatch(/futura/);
    expect((await post({ lecturas: [{ potreroId: P1.id, altura: 'BAJO' }, { potreroId: P1.id, altura: 'ALTO' }] })).body.errors[0]).toMatch(/dos veces/);
    expect((await post({ lecturas: [{ potreroId: C1.id, altura: 'BAJO' }] })).body.errors[0]).toMatch(/corral/);
    expect((await post({ lecturas: [] })).body.errors[0]).toMatch(/al menos un potrero/);
    const otra = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra Estancia' } });
    const O1 = await prisma.potrero.create({ data: { campoId: otra.id, nombre: 'O1', hectareas: 25 } });
    const mezcla = await post({ lecturas: [{ potreroId: P2.id, altura: 'BAJO' }, { potreroId: O1.id, altura: 'ALTO' }] });
    expect(mezcla.body.errors[0]).toMatch(/misma estancia/);
    expect(await lecturas()).toEqual([]);
  });

  it('un feedlot no lleva pasto', async () => {
    const { agent } = await preparar();
    const feedlot = await prisma.campo.create({ data: { sigla: 'FJ', nombre: 'Feedlot Ejemplo', tipo: 'CONFINAMIENTO' } });
    const p = await prisma.potrero.create({ data: { campoId: feedlot.id, nombre: 'C1' } });
    const res = await agent.post('/api/pecuaria/pasto').send({ lecturas: [{ potreroId: p.id, altura: 'BAJO' }] }).expect(400);
    expect(res.body.errors[0]).toMatch(/no lleva pasto/);
  });

  it('anular una lectura de recorrida; la de un movimiento no (se revierte el movimiento)', async () => {
    const { agent, A, P1, P2 } = await preparar();
    await agent.post('/api/pecuaria/pasto').send({ fecha: '2026-11-20', lecturas: [{ potreroId: P1.id, altura: 'ALTO' }] }).expect(201);
    const [recorrida] = await lecturas();
    await agent.post(`/api/pecuaria/pasto/${recorrida.id}/anular`).expect(200);
    expect((await prisma.lecturaPasto.findUnique({ where: { id: recorrida.id } })).anulada).toBe(true);
    await agent.post(`/api/pecuaria/pasto/${recorrida.id}/anular`).expect(409);
    const [audit] = await auditoria('PASTO_ANULADO');
    expect(audit.detalle).toMatchObject({ id: recorrida.id, potrero: '1', altura: 'ALTO' });

    await mover(agent, { loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P2.id, fecha: '2026-11-21', pastoDestino: 'ALTO' }).expect(201);
    const deMov = (await lecturas()).find((l) => l.movimientoId != null);
    const res = await agent.post(`/api/pecuaria/pasto/${deMov.id}/anular`).expect(400);
    expect(res.body.errors[0]).toMatch(/revirtiendo el movimiento/);
  });
});

describe('listas y fichas', () => {
  it('la lista de potreros trae el último pasto (sin las anuladas) y el descanso', async () => {
    const { agent, campo, A, P1, P2, P3, C1 } = await preparar();
    await agent.post('/api/pecuaria/pasto').send({ fecha: '2026-11-15', lecturas: [{ potreroId: P1.id, altura: 'ALTO' }] }).expect(201);
    // El lote A se va del 1 al 2 el 16: el 1 queda con B.
    await mover(agent, { loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P2.id, fecha: '2026-11-16', pastoOrigen: 'MEDIO', pastoDestino: 'ALTO' }).expect(201);
    await agent.post('/api/pecuaria/pasto').send({ fecha: '2026-11-18', lecturas: [{ potreroId: P2.id, altura: 'BAJO' }] }).expect(201);
    const ultima = (await lecturas()).at(-1);
    await agent.post(`/api/pecuaria/pasto/${ultima.id}/anular`).expect(200);

    const p1 = await enLista(agent, campo, P1);
    expect(p1.pasto).toEqual({ altura: 'MEDIO', fecha: '2026-11-16', momento: 'SALIDA' });
    // El 1 tiene ganado desde la planilla del 13: "más de".
    expect(p1.descanso).toMatchObject({ conGanado: true, desde: '2026-11-13', masDe: true });
    const p2 = await enLista(agent, campo, P2);
    expect(p2.pasto).toEqual({ altura: 'ALTO', fecha: '2026-11-16', momento: 'ENTRADA' });
    expect(p2.descanso).toMatchObject({ conGanado: true, desde: '2026-11-16', masDe: false });
    // El 3 nunca tuvo nada.
    const p3 = await enLista(agent, campo, P3);
    expect(p3).toMatchObject({ pasto: null, descanso: null, llevaPasto: true });
    expect((await enLista(agent, campo, C1)).llevaPasto).toBe(false);
  });

  it('descanso: vacío desde que salió el último animal', async () => {
    const { agent, campo, A, B, P1, P2 } = await preparar();
    await mover(agent, { loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P2.id, fecha: '2026-11-16' }).expect(201);
    await mover(agent, { loteOrigenId: B.id, cabezas: 20, destinoPotreroId: P2.id, fecha: '2026-11-18' }).expect(201);
    const p1 = await enLista(agent, campo, P1);
    expect(p1.descanso).toMatchObject({ conGanado: false, desde: '2026-11-18', masDe: false });
    expect(p1.descanso.dias).toBe(diasEntre('2026-11-18', hoy()));
    // También en "todas las estancias".
    const todas = (await agent.get('/api/pecuaria/potreros').expect(200)).body.find((p) => p.id === P1.id);
    expect(todas.descanso).toMatchObject({ conGanado: false, desde: '2026-11-18' });
  });

  it('la ficha y el historial del potrero traen el pasto', async () => {
    const { agent, A, P1, P2 } = await preparar();
    await mover(agent, { loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P2.id, fecha: '2026-11-16', pastoOrigen: 'MEDIO', pastoDestino: 'ALTO' }).expect(201);
    await agent.post('/api/pecuaria/pasto').send({ fecha: '2026-11-18', lecturas: [{ potreroId: P2.id, altura: 'BAJO' }] }).expect(201);

    const ficha = (await agent.get(`/api/pecuaria/potreros/${P2.id}`).expect(200)).body;
    expect(ficha.pasto).toEqual({ altura: 'BAJO', fecha: '2026-11-18', momento: 'RECORRIDA' });
    expect(ficha.descanso).toMatchObject({ conGanado: true, desde: '2026-11-16' });
    expect(ficha.llevaPasto).toBe(true);

    const h1 = (await agent.get(`/api/pecuaria/potreros/${P1.id}/historial`).expect(200)).body;
    expect(h1.versiones[0].pasto).toEqual({ salida: 'MEDIO' });
    expect(h1.versiones[1].pasto).toBeNull();
    const h2 = (await agent.get(`/api/pecuaria/potreros/${P2.id}/historial`).expect(200)).body;
    expect(h2.versiones[0].pasto).toEqual({ entrada: 'ALTO' });
    expect(h2.pasto.map((l) => [l.momento, l.altura])).toEqual([
      ['RECORRIDA', 'BAJO'],
      ['ENTRADA', 'ALTO'],
    ]);

    const solo = (await agent.get(`/api/pecuaria/potreros/${P2.id}/pasto`).expect(200)).body;
    expect(solo.pasto).toMatchObject({ altura: 'BAJO' });
    expect(solo.lecturas).toHaveLength(2);
    await agent.get('/api/pecuaria/potreros/999999/pasto').expect(404);
  });
});

describe('permisos y alcance', () => {
  it('un potrero de otra estancia da 404 y anular pide ANULAR', async () => {
    const { campo, P1 } = await preparar();
    const otra = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra Estancia' } });
    const O1 = await prisma.potrero.create({ data: { campoId: otra.id, nombre: 'O1', hectareas: 25 } });
    await usuarioCon(BOB, { permisos: ['pecuaria:VER', 'pecuaria:CREAR'], campoIds: [campo.id] });
    const bob = await loggedAgent(BOB);
    await bob.post('/api/pecuaria/pasto').send({ lecturas: [{ potreroId: O1.id, altura: 'BAJO' }] }).expect(404);
    await bob.get(`/api/pecuaria/potreros/${O1.id}/pasto`).expect(404);
    await bob.post('/api/pecuaria/pasto').send({ lecturas: [{ potreroId: P1.id, altura: 'BAJO' }] }).expect(201);
    // Anular pide ANULAR.
    const [l] = await lecturas();
    await bob.post(`/api/pecuaria/pasto/${l.id}/anular`).expect(403);
  });
});
