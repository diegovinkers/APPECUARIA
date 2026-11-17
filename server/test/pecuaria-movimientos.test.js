import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { useTestDatabase } from './helpers.js';
import { auditoria, hoy, prepararCampo } from './pecuaria-helpers.js';

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

const mover = (agent, body, esperado = 201) => agent.post('/api/pecuaria/movimientos').send(body).expect(esperado);
const lineas = async (agent, potrero) =>
  (await agent.get(`/api/pecuaria/potreros/${potrero.id}`).expect(200)).body.stock?.lineas.map((l) => [l.lote, l.categoria, l.cabezas, l.pesoPromedioKg]) ?? [];

describe('mover parte de un lote a otro lote', () => {
  it('50 terneros pesados del lote A se suman al lote B: toman su categoría y se recalculan los promedios', async () => {
    const { agent, P1, P2, A, B } = await preparar();
    const { body } = await mover(agent, {
      loteOrigenId: A.id,
      cabezas: 50,
      pesoPromedioKg: 280,
      destinoPotreroId: P2.id,
      modo: 'SUMAR',
      loteDestinoId: B.id,
      nota: 'Los más grandes',
    });

    expect(body.movimiento).toMatchObject({ fecha: hoy(), cabezas: 50, modo: 'SUMAR', categoriaOrigen: 'Terneros', categoriaDestino: 'Vacas' });
    // A: (350 × 250 − 50 × 280) / 300 = 245 ; B: (100 × 300 + 50 × 280) / 150 = 293,33
    expect(await lineas(agent, P1)).toEqual([['Lote A', 'Terneros', 300, 245]]);
    expect(await lineas(agent, P2)).toEqual([['Lote B', 'Vacas', 150, 293.33]]);

    const versiones = await prisma.versionStock.findMany({ where: { origen: 'MOVIMIENTO' } });
    expect(versiones).toHaveLength(2);
    const [fila] = await auditoria('MOVIMIENTO_REGISTRADO');
    expect(fila.detalle).toMatchObject({
      cabezas: 50,
      modo: 'SUMAR',
      origen: { lote: 'Lote A', potrero: 'P1' },
      destino: { lote: 'Lote B', potrero: 'P2' },
      categoriaDestino: 'Vacas',
    });
  });

  it('sin peso de los que salen, se usa el promedio del lote', async () => {
    const { agent, P1, P2, A, B } = await preparar();
    await mover(agent, { loteOrigenId: A.id, cabezas: 50, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id });
    expect(await lineas(agent, P1)).toEqual([['Lote A', 'Terneros', 300, 250]]);
    // (100 × 300 + 50 × 250) / 150 = 283,33
    expect(await lineas(agent, P2)).toEqual([['Lote B', 'Vacas', 150, 283.33]]);
  });
});

describe('formar un lote nuevo', () => {
  it('en un potrero vacío, con nombre y categoría', async () => {
    const { agent, cat, P1, P3, A } = await preparar();
    const { body } = await mover(agent, {
      loteOrigenId: A.id,
      cabezas: 100,
      pesoPromedioKg: 270,
      destinoPotreroId: P3.id,
      modo: 'NUEVO',
      nuevoLote: { nombre: 'Terneros pesados', categoriaId: cat['Terneros'] },
    });
    expect(body.movimiento).toMatchObject({ modo: 'NUEVO', loteDestino: 'Terneros pesados' });
    expect(await lineas(agent, P3)).toEqual([['Terneros pesados', 'Terneros', 100, 270]]);
    // (350 × 250 − 100 × 270) / 250 = 242
    expect(await lineas(agent, P1)).toEqual([['Lote A', 'Terneros', 250, 242]]);
  });

  it('en el mismo potrero (separar un grupo): una sola versión con los dos lotes', async () => {
    const { agent, cat, P1, A } = await preparar();
    await mover(agent, {
      loteOrigenId: A.id,
      cabezas: 50,
      pesoPromedioKg: 300,
      destinoPotreroId: P1.id,
      modo: 'NUEVO',
      nuevoLote: { nombre: 'A pesados', categoriaId: cat['Terneros'] },
    });
    expect(await lineas(agent, P1)).toEqual([
      ['A pesados', 'Terneros', 50, 300],
      ['Lote A', 'Terneros', 300, 241.67],
    ]);
    expect(await prisma.versionStock.count({ where: { potreroId: P1.id, origen: 'MOVIMIENTO' } })).toBe(1);
  });

  it('sin nombre, le pone uno automático; un nombre repetido en el campo es un error', async () => {
    const { agent, cat, P3, A } = await preparar();
    await mover(agent, { loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P3.id, modo: 'NUEVO', nuevoLote: { categoriaId: cat['Terneros'] } });
    expect(await lineas(agent, P3)).toEqual([['P3 · Terneros', 'Terneros', 10, 250]]);

    const res = await mover(
      agent,
      { loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P3.id, modo: 'NUEVO', nuevoLote: { nombre: 'Lote B', categoriaId: cat['Terneros'] } },
      400,
    );
    expect(res.body.errors[0]).toMatch(/Ya existe un lote "Lote B"/);
  });
});

describe('mover un lote entero', () => {
  it('cambia de potrero y mantiene su nombre; se le puede cambiar la categoría', async () => {
    const { agent, cat, P1, P3, A } = await preparar();
    await mover(agent, { loteOrigenId: A.id, cabezas: 350, destinoPotreroId: P3.id, modo: 'ENTERO', categoriaId: cat['Terneros chicos'] });

    expect(await lineas(agent, P1)).toEqual([]);
    expect(await lineas(agent, P3)).toEqual([['Lote A', 'Terneros chicos', 350, 250]]);
    const lote = await prisma.lote.findUnique({ where: { id: A.id } });
    expect(lote).toMatchObject({ potreroId: P3.id, categoriaId: cat['Terneros chicos'], activo: true });
  });

  it('si se vacía el lote al sumarlo a otro, queda cerrado', async () => {
    const { agent, P2, A, B } = await preparar();
    await mover(agent, { loteOrigenId: A.id, cabezas: 350, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id });
    expect((await prisma.lote.findUnique({ where: { id: A.id } })).activo).toBe(false);
  });
});

describe('validaciones', () => {
  it('no deja mover más de lo que hay, ni un lote entero con una parte', async () => {
    const { agent, P2, P3, A, B } = await preparar();
    const mas = await mover(agent, { loteOrigenId: A.id, cabezas: 351, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id }, 400);
    expect(mas.body.errors[0]).toMatch(/solo tiene 350/);
    const parte = await mover(agent, { loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P3.id, modo: 'ENTERO' }, 400);
    expect(parte.body.errors[0]).toMatch(/entero/);
  });

  it('el lote de destino tiene que estar en el potrero de destino y no ser el mismo', async () => {
    const { agent, P2, P3, A, B } = await preparar();
    await mover(agent, { loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P3.id, modo: 'SUMAR', loteDestinoId: B.id }, 400);
    await mover(agent, { loteOrigenId: B.id, cabezas: 10, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id }, 400);
  });

  it('avisa si el peso de los que salen deja un promedio imposible en el origen', async () => {
    const { agent, P2, A, B } = await preparar();
    const res = await mover(
      agent,
      { loteOrigenId: A.id, cabezas: 349, pesoPromedioKg: 251, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id },
      400,
    );
    expect(res.body.errors[0]).toMatch(/peso de los que salen/);
  });

  it('la fecha no puede ser anterior al último dato de los potreros', async () => {
    const { agent, P2, A, B } = await preparar();
    const res = await mover(
      agent,
      { fecha: '2026-11-10', loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id },
      400,
    );
    expect(res.body.errors[0]).toMatch(/anterior al último dato.*13\/11\/2026/);
  });

  it('un lote cerrado no se mueve; sin sesión, 401', async () => {
    const { agent, P2, P3, A, B } = await preparar();
    await mover(agent, { loteOrigenId: A.id, cabezas: 350, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id });
    await mover(agent, { loteOrigenId: A.id, cabezas: 1, destinoPotreroId: P3.id, modo: 'ENTERO' }, 400);
    await request(app).post('/api/pecuaria/movimientos').send({}).expect(401);
  });
});

describe('vista previa del movimiento', () => {
  it('muestra el antes y el después de los dos potreros, sin guardar nada', async () => {
    const { agent, P2, A, B } = await preparar();
    const antes = await prisma.versionStock.count();
    const { body } = await agent
      .post('/api/pecuaria/movimientos/vista-previa')
      .send({ loteOrigenId: A.id, cabezas: 50, pesoPromedioKg: 280, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id })
      .expect(200);

    expect(body.origen).toMatchObject({
      potrero: 'P1',
      antes: { cabezas: 350, cabHa: 3.5 },
      despues: { cabezas: 300, cabHa: 3 },
    });
    expect(body.destino).toMatchObject({
      potrero: 'P2',
      antes: { cabezas: 100, cabHa: 2, ugHa: 1.58 },
      despues: { cabezas: 150, cabHa: 3, ugHa: 2.32 },
    });
    expect(await prisma.versionStock.count()).toBe(antes);
  });
});

describe('historial y nombres de lotes', () => {
  it('el historial de los dos potreros cuenta el movimiento', async () => {
    const { agent, P1, P2, A, B } = await preparar();
    await mover(agent, { loteOrigenId: A.id, cabezas: 50, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id });

    const h1 = (await agent.get(`/api/pecuaria/potreros/${P1.id}/historial`).expect(200)).body;
    const h2 = (await agent.get(`/api/pecuaria/potreros/${P2.id}/historial`).expect(200)).body;
    expect(h1.versiones[0]).toMatchObject({ origen: 'MOVIMIENTO', movimiento: expect.stringMatching(/Salieron 50 Terneros del lote Lote A hacia P2 \(lote Lote B\)/) });
    expect(h2.versiones[0]).toMatchObject({ origen: 'MOVIMIENTO', movimiento: expect.stringMatching(/Llegaron 50 Terneros desde P1 \(lote Lote A\) al lote Lote B, como Vacas/) });
  });

  it('se puede renombrar un lote (auditado); el nombre no se repite en el campo', async () => {
    const { agent, A, B } = await preparar();
    const { body } = await agent.patch(`/api/pecuaria/lotes/${A.id}`).send({ nombre: 'Terneros 10.3' }).expect(200);
    expect(body.nombre).toBe('Terneros 10.3');
    const [fila] = await auditoria('LOTE_EDITADO');
    expect(fila.detalle).toEqual({ antes: { nombre: 'Lote A' }, despues: { nombre: 'Terneros 10.3' } });

    await agent.patch(`/api/pecuaria/lotes/${B.id}`).send({ nombre: 'terneros 10.3' }).expect(409);
  });
});
