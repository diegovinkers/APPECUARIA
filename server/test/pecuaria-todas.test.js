// "Todas las estancias" en Potreros y Movimientos
// (docs/superpowers/specs/2026-11-19-todas-las-estancias-design.md): las
// listas de todas las estancias del usuario, con la sigla de cada potrero.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { BOB, loggedAgent, useTestDatabase, usuarioCon } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

// EJ (orden 0): potreros 1 (lote A, 100 terneros), 2 (lote B, 80 vacas) y 3.
// OT (orden 1): potrero "1" (mismo nombre que en EJ) y O1.
// AA (orden 5): potrero Z (va al final aunque "AA" sea primero por sigla).
// Bob solo tiene OT.
async function preparar() {
  const base = await prepararCampo();
  const { potrero: P1, lote: l1 } = await base.potrero('1', { hectareas: 50, lotes: [['A', 'Terneros', 100, 180]] });
  const { potrero: P2, lote: l2 } = await base.potrero('2', { hectareas: 40, lotes: [['B', 'Vacas', 80, 450]] });
  const { potrero: P3 } = await base.potrero('3', { hectareas: 30 });
  const otra = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra Estancia', orden: 1 } });
  const ultima = await prisma.campo.create({ data: { sigla: 'AA', nombre: 'Última Estancia', orden: 5 } });
  const OT1 = await prisma.potrero.create({ data: { campoId: otra.id, nombre: '1', hectareas: 20 } });
  const O1 = await prisma.potrero.create({ data: { campoId: otra.id, nombre: 'O1', hectareas: 25, orden: 1 } });
  await prisma.potrero.create({ data: { campoId: ultima.id, nombre: 'Z', hectareas: 10 } });
  await prisma.potrero.create({ data: { campoId: otra.id, nombre: 'De baja', activo: false } });
  await usuarioCon(BOB, { permisos: ['pecuaria:VER'], campoIds: [otra.id] });
  const bob = await loggedAgent(BOB);
  return { ...base, bob, P1, P2, P3, A: l1.A, B: l2.B, otra, OT1, O1 };
}

const nombres = (potreros) => potreros.map((p) => `${p.campo.sigla} ${p.nombre}`);

describe('GET /api/pecuaria/potreros (todas las estancias)', () => {
  it('trae los potreros activos de todas, en el orden de las estancias y con su sigla', async () => {
    const { agent } = await preparar();
    const { body } = await agent.get('/api/pecuaria/potreros').expect(200);
    expect(nombres(body)).toEqual(['EJ 1', 'EJ 2', 'EJ 3', 'OT 1', 'OT O1', 'AA Z']);
    expect(body[0].campo).toMatchObject({ sigla: 'EJ', nombre: 'Estancia Ejemplo' });
    expect(body[0].stock.cabezas).toBe(100);
  });

  it('cada uno ve solo sus estancias', async () => {
    const { bob } = await preparar();
    const { body } = await bob.get('/api/pecuaria/potreros').expect(200);
    expect(nombres(body)).toEqual(['OT 1', 'OT O1']);
  });

  it('la lista de una estancia también trae la sigla', async () => {
    const { agent, otra } = await preparar();
    const { body } = await agent.get(`/api/pecuaria/campos/${otra.id}/potreros`).expect(200);
    expect(nombres(body)).toEqual(['OT 1', 'OT O1']);
  });

  it('pide el permiso VER', async () => {
    await preparar();
    const sinPermiso = { usuario: 'sin.permiso', nombre: 'Sin Permiso', password: 'sin-permiso-pw' };
    await usuarioCon(sinPermiso, { permisos: [], todas: true });
    await (await loggedAgent(sinPermiso)).get('/api/pecuaria/potreros').expect(403);
  });
});

describe('GET /api/pecuaria/movimientos (todas las estancias)', () => {
  async function conMovimientos() {
    const datos = await preparar();
    const { agent, cat, A, B, P3, O1 } = datos;
    await agent
      .post('/api/pecuaria/movimientos/entre-campos')
      .send({ loteOrigenId: A.id, cabezas: 100, destinoPotreroId: O1.id, modo: 'ENTERO', fecha: '2026-11-14' })
      .expect(201);
    await agent.post('/api/pecuaria/movimientos').send({ loteOrigenId: B.id, cabezas: 30, destinoPotreroId: P3.id, modo: 'NUEVO', nuevoLote: { categoriaId: cat.Vacas }, fecha: '2026-11-15' }).expect(201);
    return datos;
  }

  it('trae los de todas; uno entre campos aparece una sola vez, con la sigla de cada potrero', async () => {
    const { agent } = await conMovimientos();
    const { body } = await agent.get('/api/pecuaria/movimientos').expect(200);
    expect(body.movimientos.map((m) => m.tipo.clave)).toEqual(['LOTE_NUEVO', 'ENTRE_CAMPOS']);
    const [, entre] = body.movimientos;
    expect(entre.potreroOrigen).toMatchObject({ nombre: '1', campo: { sigla: 'EJ' } });
    expect(entre.potreroDestino).toMatchObject({ nombre: 'O1', campo: { sigla: 'OT' } });
    expect(body.resumen).toMatchObject({ movimientos: 2, cabezas: 130 });
  });

  it('cada uno ve solo lo que toca sus estancias', async () => {
    const { bob } = await conMovimientos();
    const { body } = await bob.get('/api/pecuaria/movimientos').expect(200);
    expect(body.movimientos.map((m) => m.tipo.clave)).toEqual(['ENTRE_CAMPOS']);
  });

  it('usa los mismos filtros que la lista de una estancia', async () => {
    const { agent, P3 } = await conMovimientos();
    const porPotrero = (await agent.get('/api/pecuaria/movimientos').query({ potreroId: P3.id }).expect(200)).body;
    expect(porPotrero.movimientos.map((m) => m.tipo.clave)).toEqual(['LOTE_NUEVO']);
    const porFecha = (await agent.get('/api/pecuaria/movimientos').query({ hasta: '2026-11-14' }).expect(200)).body;
    expect(porFecha.movimientos.map((m) => m.tipo.clave)).toEqual(['ENTRE_CAMPOS']);
    await agent.get('/api/pecuaria/movimientos').query({ desde: 'ayer' }).expect(400);
  });
});
