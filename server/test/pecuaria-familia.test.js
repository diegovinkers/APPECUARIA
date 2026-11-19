// Fase 1 de docs/LOGISTICA_MOVIMIENTOS.md: el lote repartido entre potreros
// ("familia de lotes"). Mover parte de un lote con mismoLote: la parte sigue
// siendo del mismo lote (misma categoría, nombre automático, misma raíz).
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { BOB, loggedAgent, useTestDatabase, usuarioCon } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

// EJ: potrero 1 con el lote A (100 terneros, 180 kg), potreros 2 y 3 vacíos.
async function preparar() {
  const base = await prepararCampo();
  const { potrero: P1, lote: l1 } = await base.potrero('1', { hectareas: 50, lotes: [['A', 'Terneros', 100, 180]] });
  const { potrero: P2 } = await base.potrero('2', { hectareas: 40 });
  const { potrero: P3 } = await base.potrero('3', { hectareas: 30 });
  return { ...base, P1, P2, P3, A: l1.A };
}

const parte = (agent, body) =>
  agent.post('/api/pecuaria/movimientos').send({ modo: 'NUEVO', mismoLote: true, fecha: '2026-11-14', ...body });
const lineas = async (agent, potrero) =>
  (await agent.get(`/api/pecuaria/potreros/${potrero.id}`).expect(200)).body.stock?.lineas ?? [];

describe('mover parte de un lote: "sigue siendo el mismo lote"', () => {
  it('la parte toma la categoría y un nombre automático, y recuerda de qué lote salió', async () => {
    const { agent, cat, A, P1, P2 } = await preparar();
    // nuevoLote se ignora: la categoría es la del lote.
    const { body } = await parte(agent, { loteOrigenId: A.id, cabezas: 30, destinoPotreroId: P2.id, nuevoLote: { categoriaId: cat.Vacas } }).expect(201);
    expect(body.movimiento).toMatchObject({ loteDestino: 'A · 2', categoriaDestino: 'Terneros', cabezas: 30 });
    const p = await prisma.lote.findFirst({ where: { nombre: 'A · 2' } });
    expect(p).toMatchObject({ raizId: A.id, categoriaId: cat.Terneros, potreroId: P2.id });
    expect((await lineas(agent, P1)).map((l) => [l.lote, l.cabezas])).toEqual([['A', 70]]);
    const [enP2] = await lineas(agent, P2);
    expect(enP2).toMatchObject({ lote: 'A · 2', cabezas: 30, pesoPromedioKg: 180, familiaId: A.id });
  });

  it('una parte de una parte sigue colgando del lote original, y el nombre sale de él', async () => {
    const { agent, A, P2, P3 } = await preparar();
    await parte(agent, { loteOrigenId: A.id, cabezas: 30, destinoPotreroId: P2.id }).expect(201);
    const enP2 = await prisma.lote.findFirst({ where: { nombre: 'A · 2' } });
    await parte(agent, { loteOrigenId: enP2.id, cabezas: 10, destinoPotreroId: P3.id }).expect(201);
    expect(await prisma.lote.findFirst({ where: { nombre: 'A · 3' } })).toMatchObject({ raizId: A.id });
  });

  it('con todas las cabezas o al mismo potrero, no', async () => {
    const { agent, A, P1, P2 } = await preparar();
    const todas = await parte(agent, { loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P2.id }).expect(400);
    expect(todas.body.errors[0]).toMatch(/lote entero/);
    const mismo = await parte(agent, { loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P1.id }).expect(400);
    expect(mismo.body.errors[0]).toMatch(/otro potrero/);
  });

  it('revertir el movimiento cierra la parte y devuelve las cabezas', async () => {
    const { agent, A, P1, P2 } = await preparar();
    const { body } = await parte(agent, { loteOrigenId: A.id, cabezas: 30, destinoPotreroId: P2.id }).expect(201);
    await agent.post(`/api/pecuaria/movimientos/${body.movimiento.id}/revertir`).expect(201);
    expect((await lineas(agent, P1)).map((l) => [l.lote, l.cabezas])).toEqual([['A', 100]]);
    expect(await lineas(agent, P2)).toEqual([]);
    expect((await prisma.lote.findFirst({ where: { nombre: 'A · 2' } })).activo).toBe(false);
  });
});

describe('la ficha del lote muestra la familia', () => {
  it('repartido en varios potreros, con el total; desde cualquiera de las partes', async () => {
    const { agent, A, P2, P3 } = await preparar();
    await parte(agent, { loteOrigenId: A.id, cabezas: 30, destinoPotreroId: P2.id }).expect(201);
    await parte(agent, { loteOrigenId: A.id, cabezas: 20, destinoPotreroId: P3.id }).expect(201);
    const enP3 = await prisma.lote.findFirst({ where: { nombre: 'A · 3' } });
    for (const id of [A.id, enP3.id]) {
      const { body } = await agent.get(`/api/pecuaria/lotes/${id}`).expect(200);
      expect(body.familia).toMatchObject({ raiz: { id: A.id, nombre: 'A' }, cabezas: 100, otrasEstancias: 0 });
      expect(body.familia.partes.map((p) => [p.nombre, p.potrero.nombre, p.cabezas])).toEqual([
        ['A', '1', 50],
        ['A · 2', '2', 30],
        ['A · 3', '3', 20],
      ]);
    }
  });

  it('un lote sin partes no tiene familia', async () => {
    const { agent, A } = await preparar();
    expect((await agent.get(`/api/pecuaria/lotes/${A.id}`).expect(200)).body.familia).toBeNull();
  });

  it('las partes de una estancia que el usuario no tiene solo se cuentan', async () => {
    const { agent, campo, A, P2 } = await preparar();
    await parte(agent, { loteOrigenId: A.id, cabezas: 30, destinoPotreroId: P2.id }).expect(201);
    const enP2 = await prisma.lote.findFirst({ where: { nombre: 'A · 2' } });
    const otra = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra Estancia' } });
    const O1 = await prisma.potrero.create({ data: { campoId: otra.id, nombre: 'O1', hectareas: 25 } });
    await agent
      .post('/api/pecuaria/movimientos/entre-campos')
      .send({ loteOrigenId: enP2.id, cabezas: 30, destinoPotreroId: O1.id, modo: 'ENTERO', fecha: '2026-11-15' })
      .expect(201);
    await usuarioCon(BOB, { permisos: ['pecuaria:VER'], campoIds: [campo.id] });
    const bob = await loggedAgent(BOB);
    const { body } = await bob.get(`/api/pecuaria/lotes/${A.id}`).expect(200);
    expect(body.familia.partes.map((p) => p.nombre)).toEqual(['A']);
    expect(body.familia).toMatchObject({ otrasEstancias: 1, cabezas: 70 });
  });

  it('unir: sumar una parte a la otra en el mismo potrero la cierra y la familia desaparece', async () => {
    const { agent, A, P1, P2 } = await preparar();
    await parte(agent, { loteOrigenId: A.id, cabezas: 30, destinoPotreroId: P2.id }).expect(201);
    const enP2 = await prisma.lote.findFirst({ where: { nombre: 'A · 2' } });
    // Las 30 vuelven al potrero 1 como lote entero: quedan juntas con A.
    await agent.post('/api/pecuaria/movimientos').send({ loteOrigenId: enP2.id, cabezas: 30, destinoPotreroId: P1.id, modo: 'ENTERO', fecha: '2026-11-15' }).expect(201);
    expect((await lineas(agent, P1)).map((l) => l.familiaId)).toEqual([A.id, A.id]);
    await agent.post('/api/pecuaria/movimientos').send({ loteOrigenId: enP2.id, cabezas: 30, destinoPotreroId: P1.id, modo: 'SUMAR', loteDestinoId: A.id, fecha: '2026-11-15' }).expect(201);
    expect((await lineas(agent, P1)).map((l) => [l.lote, l.cabezas])).toEqual([['A', 100]]);
    expect((await agent.get(`/api/pecuaria/lotes/${A.id}`).expect(200)).body.familia).toBeNull();
  });
});
