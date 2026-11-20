import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { useTestDatabase } from './helpers.js';
import { auditoria, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

// Campo ficticio:
//   P1  CN, 100 ha: lote A = 350 Terneros de 250 kg
//   P2  Raygras, 50 ha: lote B = 100 Vacas de 300 kg
//   P3  Raygras, 40 ha: vacío
async function preparar() {
  const base = await prepararCampo();
  const p1 = await base.potrero('P1', { hectareas: 100, usoNombre: 'Campo natural', lotes: [['Lote A', 'Terneros', 350, 250]] });
  const p2 = await base.potrero('P2', { hectareas: 50, usoNombre: 'Raygras', lotes: [['Lote B', 'Vacas', 100, 300]] });
  const p3 = await base.potrero('P3', { hectareas: 40, usoNombre: 'Raygras' });
  return { ...base, P1: p1.potrero, P2: p2.potrero, P3: p3.potrero, A: p1.lote['Lote A'], B: p2.lote['Lote B'] };
}

const mover = async (agent, body, esperado = 201) => (await agent.post('/api/pecuaria/movimientos').send(body).expect(esperado)).body;
const revertir = (agent, id, esperado = 201) => agent.post(`/api/pecuaria/movimientos/${id}/revertir`).expect(esperado);
const lista = async (agent, campo, query = '') => (await agent.get(`/api/pecuaria/campos/${campo.id}/movimientos${query}`).expect(200)).body;
const lineas = async (agent, potrero) =>
  (await agent.get(`/api/pecuaria/potreros/${potrero.id}`).expect(200)).body.stock?.lineas.map((l) => [l.lote, l.categoria, l.cabezas, l.pesoPromedioKg]) ?? [];

describe('cambio de categoría como movimiento', () => {
  it('el lote entero cambia de categoría en su potrero, y queda registrado', async () => {
    const { agent, cat, P1, A } = await preparar();
    const { movimiento } = await mover(agent, {
      loteOrigenId: A.id,
      cabezas: 350,
      destinoPotreroId: P1.id,
      modo: 'CATEGORIA',
      categoriaId: cat['Terneros chicos'],
    });
    expect(movimiento).toMatchObject({ modo: 'CATEGORIA', categoriaOrigen: 'Terneros', categoriaDestino: 'Terneros chicos', loteDestino: 'Lote A' });
    expect(await lineas(agent, P1)).toEqual([['Lote A', 'Terneros chicos', 350, 250]]);
    expect((await prisma.lote.findUnique({ where: { id: A.id } })).categoriaId).toBe(cat['Terneros chicos']);
  });

  it('tienen que ser todas las cabezas, en el mismo potrero, y otra categoría', async () => {
    const { agent, cat, P1, P2, A } = await preparar();
    const base = { loteOrigenId: A.id, modo: 'CATEGORIA', categoriaId: cat['Terneros chicos'] };
    const parte = await mover(agent, { ...base, cabezas: 100, destinoPotreroId: P1.id }, 400);
    expect(parte.errors[0]).toMatch(/todas sus cabezas/);
    await mover(agent, { ...base, cabezas: 350, destinoPotreroId: P2.id }, 400);
    const igual = await mover(agent, { ...base, cabezas: 350, destinoPotreroId: P1.id, categoriaId: cat.Terneros }, 400);
    expect(igual.errors[0]).toMatch(/ya es Terneros/);
  });
});

describe('lista de movimientos del campo', () => {
  async function tresMovimientos() {
    const ctx = await preparar();
    const { agent, cat, P1, P2, P3, A, B } = ctx;
    const m1 = (await mover(agent, { loteOrigenId: A.id, cabezas: 50, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id })).movimiento;
    const m2 = (await mover(agent, { loteOrigenId: B.id, cabezas: 150, destinoPotreroId: P2.id, modo: 'CATEGORIA', categoriaId: cat['Vacas CUT'] }))
      .movimiento;
    const m3 = (
      await mover(agent, {
        loteOrigenId: A.id,
        cabezas: 20,
        destinoPotreroId: P3.id,
        modo: 'NUEVO',
        nuevoLote: { nombre: 'Nuevos', categoriaId: cat.Terneros },
      })
    ).movimiento;
    return { ...ctx, m1, m2, m3 };
  }

  it('lista todos, del más nuevo al más viejo, con un resumen', async () => {
    const { agent, campo, m1, m2, m3 } = await tresMovimientos();
    const { movimientos, resumen } = await lista(agent, campo);
    expect(movimientos.map((m) => m.id)).toEqual([m3.id, m2.id, m1.id]);
    expect(resumen).toEqual({ movimientos: 3, cabezas: 220, entradas: 0, salidas: 0, eventos: 0 });
    expect(movimientos[2]).toMatchObject({
      modo: 'SUMAR',
      cabezas: 50,
      loteOrigen: { nombre: 'Lote A' },
      loteDestino: { nombre: 'Lote B' },
      potreroOrigen: { nombre: 'P1' },
      potreroDestino: { nombre: 'P2' },
      categoriaOrigen: 'Terneros',
      categoriaDestino: 'Vacas',
      usuario: 'Alice Test',
      revertido: false,
    });
  });

  it('filtra por potrero, lote, categoría y fechas', async () => {
    const { agent, campo, cat, P3, B, m1, m2, m3 } = await tresMovimientos();
    const ids = async (q) => (await lista(agent, campo, q)).movimientos.map((m) => m.id);
    expect(await ids(`?potreroId=${P3.id}`)).toEqual([m3.id]);
    expect(await ids(`?loteId=${B.id}`)).toEqual([m2.id, m1.id]);
    expect(await ids(`?categoriaId=${cat['Vacas CUT']}`)).toEqual([m2.id]);
    expect(await ids('?hasta=2026-01-01')).toEqual([]);
  });

  it('dice cuáles se pueden revertir: solo si después no hubo otros cambios en esos potreros', async () => {
    const { agent, campo, m1, m2, m3 } = await tresMovimientos();
    const { movimientos } = await lista(agent, campo);
    const puede = Object.fromEntries(movimientos.map((m) => [m.id, m.puedeRevertir]));
    expect(puede).toEqual({ [m3.id]: true, [m2.id]: true, [m1.id]: false });
  });

  it('sin sesión, 401; campo inexistente, 404', async () => {
    const { agent } = await preparar();
    await agent.get('/api/pecuaria/campos/9999/movimientos').expect(404);
    await request(app).get('/api/pecuaria/campos/1/movimientos').expect(401);
  });
});

describe('revertir un movimiento', () => {
  it('deja los dos potreros como estaban, registra la reversión y la audita', async () => {
    const { agent, campo, P1, P2, A, B } = await preparar();
    const { movimiento } = await mover(agent, { loteOrigenId: A.id, cabezas: 50, pesoPromedioKg: 280, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id });

    const { body } = await revertir(agent, movimiento.id);
    expect(body.movimiento).toMatchObject({ modo: 'REVERSION', revierteA: movimiento.id, cabezas: 50 });
    expect(await lineas(agent, P1)).toEqual([['Lote A', 'Terneros', 350, 250]]);
    expect(await lineas(agent, P2)).toEqual([['Lote B', 'Vacas', 100, 300]]);

    const { movimientos } = await lista(agent, campo);
    expect(movimientos.map((m) => [m.modo, m.revertido])).toEqual([
      ['REVERSION', false],
      ['SUMAR', true],
    ]);
    const [fila] = await auditoria('MOVIMIENTO_REVERTIDO');
    expect(fila).toMatchObject({ entidad: 'movimiento', entidadId: String(movimiento.id) });
  });

  it('un lote nuevo se cierra y el de origen vuelve', async () => {
    const { agent, cat, P1, P3, A } = await preparar();
    const { movimiento } = await mover(agent, {
      loteOrigenId: A.id,
      cabezas: 350,
      destinoPotreroId: P3.id,
      modo: 'NUEVO',
      nuevoLote: { nombre: 'N', categoriaId: cat.Terneros },
    });
    expect((await prisma.lote.findUnique({ where: { id: A.id } })).activo).toBe(false);

    await revertir(agent, movimiento.id);
    expect(await lineas(agent, P1)).toEqual([['Lote A', 'Terneros', 350, 250]]);
    expect(await lineas(agent, P3)).toEqual([]);
    expect((await prisma.lote.findUnique({ where: { id: A.id } })).activo).toBe(true);
    expect((await prisma.lote.findFirst({ where: { nombre: 'N' } })).activo).toBe(false);
  });

  it('un lote entero vuelve a su potrero y a su categoría', async () => {
    const { agent, cat, P1, P3, A } = await preparar();
    const { movimiento } = await mover(agent, { loteOrigenId: A.id, cabezas: 350, destinoPotreroId: P3.id, modo: 'ENTERO', categoriaId: cat['Terneros chicos'] });
    await revertir(agent, movimiento.id);
    expect(await lineas(agent, P1)).toEqual([['Lote A', 'Terneros', 350, 250]]);
    expect(await prisma.lote.findUnique({ where: { id: A.id } })).toMatchObject({ potreroId: P1.id, categoriaId: cat.Terneros, activo: true });
  });

  it('no se revierte si después hubo cambios, dos veces, ni una reversión', async () => {
    const { agent, cat, P2, P3, A, B } = await preparar();
    const m1 = (await mover(agent, { loteOrigenId: A.id, cabezas: 50, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id })).movimiento;
    const m2 = (await mover(agent, { loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P3.id, modo: 'NUEVO', nuevoLote: { categoriaId: cat.Terneros } })).movimiento;

    const despues = await revertir(agent, m1.id, 409);
    expect(despues.body.errors[0]).toMatch(/hubo otros cambios en P1/);

    const { body } = await revertir(agent, m2.id);
    expect((await revertir(agent, m2.id, 409)).body.errors[0]).toMatch(/ya fue revertido/);
    expect((await revertir(agent, body.movimiento.id, 400)).body.errors[0]).toMatch(/reversión/);
    await revertir(agent, 9999, 404);
  });
});

describe('historial de un lote', () => {
  it('muestra el lote, dónde está y sus movimientos', async () => {
    const { agent, cat, P2, P3, A, B } = await preparar();
    await mover(agent, { loteOrigenId: A.id, cabezas: 50, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id });
    await mover(agent, { loteOrigenId: A.id, cabezas: 300, destinoPotreroId: P3.id, modo: 'ENTERO', categoriaId: cat['Terneros chicos'] });

    const { body } = await agent.get(`/api/pecuaria/lotes/${A.id}`).expect(200);
    expect(body.lote).toMatchObject({ nombre: 'Lote A', activo: true, categoria: 'Terneros chicos', potrero: { nombre: 'P3' } });
    expect(body.actual).toMatchObject({ cabezas: 300, pesoPromedioKg: 250 });
    expect(body.movimientos.map((m) => m.modo)).toEqual(['ENTERO', 'SUMAR']);
    await agent.get('/api/pecuaria/lotes/9999').expect(404);
  });
});
