// Paso 5 del rediseño (docs/superpowers/plans/2026-11-18-traslados.md):
// mover entre campos y movimiento múltiple, guardados como un evento con sus
// pasos que se revierte entero.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { PECUARIA_TODO, loggedAgent, useTestDatabase, usuarioCon } from './helpers.js';
import { auditoria, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const ENCARGADO = { usuario: 'encargado.test', nombre: 'Encargado Test', password: 'encargado-password' };

// Estancia EJ: potrero 1 con 100 terneros (lote A), potrero 2 con 80 vacas
// (lote B), potrero 3 vacío. Estancia OT: potrero O1 vacío.
async function preparar() {
  const base = await prepararCampo();
  const { potrero: P1, lote: l1 } = await base.potrero('1', { hectareas: 50, lotes: [['A', 'Terneros', 100, 180]] });
  const { potrero: P2, lote: l2 } = await base.potrero('2', { hectareas: 40, lotes: [['B', 'Vacas', 80, 450]] });
  const { potrero: P3 } = await base.potrero('3', { hectareas: 30 });
  const otra = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra Estancia' } });
  const O1 = await prisma.potrero.create({ data: { campoId: otra.id, nombre: 'O1', hectareas: 25 } });
  return { ...base, P1, P2, P3, A: l1.A, B: l2.B, otra, O1 };
}

const lineas = async (agent, potrero) =>
  (await agent.get(`/api/pecuaria/potreros/${potrero.id}`).expect(200)).body.stock?.lineas.map((l) => [l.lote, l.categoria, l.cabezas]) ?? [];
const lista = async (agent, campo) => (await agent.get(`/api/pecuaria/campos/${campo.id}/movimientos`).expect(200)).body.movimientos;

describe('mover entre campos', () => {
  it('el lote entero pasa a la otra estancia, con la guía; se ve en las dos listas', async () => {
    const { agent, campo, otra, A, P1, O1 } = await preparar();
    const { body } = await agent
      .post('/api/pecuaria/movimientos/entre-campos')
      .send({ loteOrigenId: A.id, cabezas: 100, destinoPotreroId: O1.id, modo: 'ENTERO', guia: 'G-123', fecha: '2026-11-14' })
      .expect(201);
    expect(body.evento.tipo).toBe('ENTRE_CAMPOS');
    expect(await lineas(agent, P1)).toEqual([]);
    expect(await lineas(agent, O1)).toEqual([['A', 'Terneros', 100]]);
    expect((await prisma.lote.findUnique({ where: { id: A.id } })).campoId).toBe(otra.id);

    const [enOrigen] = await lista(agent, campo);
    const [enDestino] = await lista(agent, otra);
    expect(enOrigen.id).toBe(enDestino.id);
    expect(enOrigen).toMatchObject({ guia: 'G-123', campoOtro: { sigla: 'OT' }, evento: { tipo: 'ENTRE_CAMPOS', pasos: 1, puedeRevertir: true } });
    expect(enOrigen.tipo.clave).toBe('ENTRE_CAMPOS');
    const [a] = await auditoria('MOVIMIENTO_ENTRE_CAMPOS');
    expect(a.detalle).toMatchObject({ campoDestino: 'OT', guia: 'G-123', cabezas: 100 });
  });

  it('una parte forma un lote nuevo en la otra estancia (la guía es opcional)', async () => {
    const { agent, cat, otra, A, P1, O1 } = await preparar();
    await agent
      .post('/api/pecuaria/movimientos/entre-campos')
      .send({ loteOrigenId: A.id, cabezas: 40, destinoPotreroId: O1.id, modo: 'NUEVO', nuevoLote: { categoriaId: cat.Terneros } })
      .expect(201);
    expect(await lineas(agent, P1)).toEqual([['A', 'Terneros', 60]]);
    expect(await lineas(agent, O1)).toEqual([['O1 · Terneros', 'Terneros', 40]]);
    const nuevo = await prisma.lote.findFirst({ where: { nombre: 'O1 · Terneros' } });
    expect(nuevo.campoId).toBe(otra.id);
  });

  it('no suma a un lote del destino ni sirve dentro de la misma estancia', async () => {
    const { agent, A, B, P2, O1 } = await preparar();
    await agent.post('/api/pecuaria/movimientos/entre-campos').send({ loteOrigenId: A.id, cabezas: 10, destinoPotreroId: O1.id, modo: 'SUMAR', loteDestinoId: B.id }).expect(400);
    const mismo = await agent.post('/api/pecuaria/movimientos/entre-campos').send({ loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P2.id, modo: 'ENTERO' }).expect(400);
    expect(mismo.body.errors[0]).toMatch(/otro campo/);
    // Y "mover" común no cruza de estancia.
    const comun = await agent.post('/api/pecuaria/movimientos').send({ loteOrigenId: A.id, cabezas: 100, destinoPotreroId: O1.id, modo: 'ENTERO' }).expect(400);
    expect(comun.body.errors[0]).toMatch(/Mover entre campos/);
  });

  it('la vista previa no guarda nada y del destino muestra solo lo que llega', async () => {
    const { agent, A, O1 } = await preparar();
    const { body } = await agent
      .post('/api/pecuaria/movimientos/entre-campos/vista-previa')
      .send({ loteOrigenId: A.id, cabezas: 100, destinoPotreroId: O1.id, modo: 'ENTERO' })
      .expect(200);
    expect(body.origen.despues.cabezas).toBe(0);
    expect(body.destino).toMatchObject({ campo: { sigla: 'OT' }, potrero: 'O1', lote: 'A', cabezas: 100, loteEntero: true });
    expect(body.destino).not.toHaveProperty('antes');
    expect(await prisma.movimiento.count()).toBe(0);
  });

  it('revertir: el evento entero (no el paso suelto) deja todo como estaba', async () => {
    const { agent, campo, otra, A, P1, O1 } = await preparar();
    const { body } = await agent
      .post('/api/pecuaria/movimientos/entre-campos')
      .send({ loteOrigenId: A.id, cabezas: 100, destinoPotreroId: O1.id, modo: 'ENTERO' })
      .expect(201);
    const res = await agent.post(`/api/pecuaria/movimientos/${body.movimiento.id}/revertir`).expect(400);
    expect(res.body.errors[0]).toMatch(/revertí el evento entero/);

    await agent.post(`/api/pecuaria/eventos/${body.evento.id}/revertir`).expect(201);
    expect(await lineas(agent, P1)).toEqual([['A', 'Terneros', 100]]);
    expect(await lineas(agent, O1)).toEqual([]);
    expect((await prisma.lote.findUnique({ where: { id: A.id } })).campoId).toBe(campo.id);
    // La reversión también se ve en las dos estancias.
    expect((await lista(agent, otra)).map((m) => m.modo)).toEqual(['REVERSION', 'ENTERO']);
    await agent.post(`/api/pecuaria/eventos/${body.evento.id}/revertir`).expect(409);
    const [a] = await auditoria('EVENTO_REVERTIDO');
    expect(a.detalle).toMatchObject({ revierteA: body.evento.id, tipoOriginal: 'ENTRE_CAMPOS' });
  });

  it('el encargado de origen lo registra sin tener la estancia de destino (pero no desde una ajena)', async () => {
    const { campo, otra, A, O1 } = await preparar();
    const ajeno = await prisma.lote.create({ data: { campoId: otra.id, potreroId: O1.id, categoriaId: A.categoriaId, nombre: 'Ajeno' } });
    await usuarioCon(ENCARGADO, { permisos: PECUARIA_TODO, campoIds: [campo.id] });
    const encargado = await loggedAgent(ENCARGADO);

    const destinos = (await encargado.get(`/api/pecuaria/movimientos/entre-campos/destinos?origen=${campo.id}`).expect(200)).body;
    expect(destinos.map((c) => [c.sigla, c.potreros.map((p) => p.nombre)])).toEqual([['OT', ['O1']]]);
    expect(Object.keys(destinos[0].potreros[0]).sort()).toEqual(['id', 'nombre']);
    await encargado.get(`/api/pecuaria/movimientos/entre-campos/destinos?origen=${otra.id}`).expect(404);

    await encargado.post('/api/pecuaria/movimientos/entre-campos').send({ loteOrigenId: A.id, cabezas: 100, destinoPotreroId: O1.id, modo: 'ENTERO' }).expect(201);
    await encargado.post('/api/pecuaria/movimientos/entre-campos').send({ loteOrigenId: ajeno.id, cabezas: 1, destinoPotreroId: O1.id, modo: 'ENTERO' }).expect(404);
  });
});

describe('movimiento múltiple', () => {
  // A → 2 (donde están las vacas) y, para liberarlo, las vacas de 2 → 3.
  const cadena = ({ A, B, P2, P3 }, cat) => ({
    fecha: '2026-11-14',
    nota: 'Liberar el 2 para los terneros',
    pasos: [
      { loteOrigenId: A.id, cabezas: 50, destinoPotreroId: P2.id, modo: 'NUEVO', nuevoLote: { nombre: 'Terneros pesados', categoriaId: cat.Terneros } },
      { loteOrigenId: B.id, cabezas: 80, destinoPotreroId: P3.id, modo: 'ENTERO' },
    ],
  });

  it('A → B y B → C se guardan juntos, como un evento de dos pasos', async () => {
    const datos = await preparar();
    const { agent, campo, cat, P1, P2, P3 } = datos;
    const { body } = await agent.post('/api/pecuaria/movimientos/multiple').send(cadena(datos, cat)).expect(201);
    expect(body.evento.tipo).toBe('MULTIPLE');
    expect(body.pasos.map((p) => [p.paso, p.potreroOrigen, p.potreroDestino, p.cabezas])).toEqual([
      [1, '1', '2', 50],
      [2, '2', '3', 80],
    ]);
    expect(await lineas(agent, P1)).toEqual([['A', 'Terneros', 50]]);
    expect(await lineas(agent, P2)).toEqual([['Terneros pesados', 'Terneros', 50]]);
    expect(await lineas(agent, P3)).toEqual([['B', 'Vacas', 80]]);

    const movs = await lista(agent, campo);
    expect(movs).toHaveLength(2);
    expect(new Set(movs.map((m) => m.evento.id))).toEqual(new Set([body.evento.id]));
    expect(movs.every((m) => m.puedeRevertir === false && m.evento.puedeRevertir === true && m.evento.pasos === 2)).toBe(true);
    expect(movs[0].evento.nota).toBe('Liberar el 2 para los terneros');
    const [a] = await auditoria('MOVIMIENTO_MULTIPLE');
    expect(a.detalle.pasos).toHaveLength(2);
  });

  it('todo o nada: si un paso falla, no se guarda ninguno (y el error dice cuál)', async () => {
    const datos = await preparar();
    const { agent, cat, P1, P2 } = datos;
    const malo = cadena(datos, cat);
    malo.pasos[1].cabezas = 500;
    const res = await agent.post('/api/pecuaria/movimientos/multiple').send(malo).expect(400);
    expect(res.body.errors[0]).toMatch(/^Paso 2: /);
    expect(await prisma.movimiento.count()).toBe(0);
    expect(await prisma.eventoMovimiento.count()).toBe(0);
    expect(await lineas(agent, P1)).toEqual([['A', 'Terneros', 100]]);
    expect(await lineas(agent, P2)).toEqual([['B', 'Vacas', 80]]);
  });

  it('cada paso mueve lo que había antes: no puede salir de un lote que recibió animales', async () => {
    const { agent, A, B, P2, P3 } = await preparar();
    const res = await agent
      .post('/api/pecuaria/movimientos/multiple')
      .send({
        pasos: [
          { loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P2.id, modo: 'SUMAR', loteDestinoId: B.id },
          { loteOrigenId: B.id, cabezas: 90, destinoPotreroId: P3.id, modo: 'ENTERO' },
        ],
      })
      .expect(400);
    expect(res.body.errors[0]).toMatch(/Paso 2: ese lote recibió animales en el paso 1/);
  });

  it('la vista previa no guarda nada y avisa si quedan categorías mezcladas', async () => {
    const { agent, cat, A, P2 } = await preparar();
    const antes = await prisma.lote.count();
    const { body } = await agent
      .post('/api/pecuaria/movimientos/multiple/vista-previa')
      .send({ pasos: [{ loteOrigenId: A.id, cabezas: 50, destinoPotreroId: P2.id, modo: 'NUEVO', nuevoLote: { categoriaId: cat.Terneros } }] })
      .expect(200);
    const p2 = body.potreros.find((p) => p.potrero === '2');
    expect(p2.antes.cabezas).toBe(80);
    expect(p2.despues.cabezas).toBe(130);
    expect(p2.aviso).toMatch(/En 2 quedan juntos: .*Vacas.*Terneros|En 2 quedan juntos: .*Terneros.*Vacas/);
    expect(await prisma.movimiento.count()).toBe(0);
    expect(await prisma.eventoMovimiento.count()).toBe(0);
    expect(await prisma.lote.count()).toBe(antes);
    expect(await lineas(agent, P2)).toEqual([['B', 'Vacas', 80]]);
  });

  it('todos los pasos tienen que ser de la misma estancia', async () => {
    const { agent, A, O1 } = await preparar();
    const res = await agent.post('/api/pecuaria/movimientos/multiple').send({ pasos: [{ loteOrigenId: A.id, cabezas: 10, destinoPotreroId: O1.id, modo: 'ENTERO' }] }).expect(400);
    expect(res.body.errors[0]).toMatch(/Paso 1: .*Mover entre campos/);
  });

  it('se revierte el evento entero, solo si después no hubo otros cambios', async () => {
    const datos = await preparar();
    const { agent, cat, P1, P2, P3, A } = datos;
    const { body } = await agent.post('/api/pecuaria/movimientos/multiple').send(cadena(datos, cat)).expect(201);
    await agent.post(`/api/pecuaria/eventos/${body.evento.id}/revertir`).expect(201);
    expect(await lineas(agent, P1)).toEqual([['A', 'Terneros', 100]]);
    expect(await lineas(agent, P2)).toEqual([['B', 'Vacas', 80]]);
    expect(await lineas(agent, P3)).toEqual([]);

    // Otra vez (hoy: la reversión dejó datos con fecha de hoy), y después un
    // cambio en el potrero 3: ya no se puede revertir.
    const segunda = cadena(datos, cat);
    delete segunda.fecha;
    segunda.pasos[0].nuevoLote.nombre = 'Terneros pesados 2';
    const r2 = await agent.post('/api/pecuaria/movimientos/multiple').send(segunda);
    expect(r2.body.errors ?? []).toEqual([]);
    const otro = r2.body;
    const B = await prisma.lote.findFirst({ where: { nombre: 'B' } });
    await agent.post('/api/pecuaria/movimientos').send({ loteOrigenId: B.id, cabezas: 10, destinoPotreroId: P1.id, modo: 'SUMAR', loteDestinoId: A.id }).expect(201);
    const res = await agent.post(`/api/pecuaria/eventos/${otro.evento.id}/revertir`).expect(409);
    expect(res.body.errors[0]).toMatch(/hubo otros cambios/);
  });

  it('el capataz (sin revertir) registra el múltiple pero no lo revierte', async () => {
    const datos = await preparar();
    await usuarioCon(ENCARGADO, { permisos: ['pecuaria:VER', 'pecuaria:CREAR'], campoIds: [datos.campo.id] });
    const capataz = await loggedAgent(ENCARGADO);
    const { body } = await capataz.post('/api/pecuaria/movimientos/multiple').send(cadena(datos, datos.cat)).expect(201);
    await capataz.post(`/api/pecuaria/eventos/${body.evento.id}/revertir`).expect(403);
  });
});
