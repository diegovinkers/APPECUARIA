// El asistente, fase 2: acciones con Confirmar
// (docs/superpowers/plans/2026-11-27-asistente-fase2.md).
// Claude está simulado: estos tests no gastan nada.
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { leerCatalogo } from '../src/asistente/herramientas.js';
import { accion, buscarCausa, proponer } from '../src/asistente/acciones.js';
import { MAX_PROPUESTAS, dependencias } from '../src/asistente/asistente.service.js';
import { armarInstrucciones, versionPara } from '../src/asistente/instrucciones.js';
import { desdeElAsistente } from '../src/audit/audit.js';
import { ALICE, BOB, PECUARIA_TODO, loggedAgent, sessionCookie, useTestDatabase, usuarioCon } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const crearClienteOriginal = dependencias.crearCliente;
afterEach(() => {
  dependencias.crearCliente = crearClienteOriginal;
});

const CAROL = { usuario: 'carol', nombre: 'Carol Test', password: 'password789' };
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo' }).format(new Date());

async function cookieDe({ usuario, password }) {
  const res = await request(app).post('/api/login').send({ usuario, password }).expect(200);
  return sessionCookie(res).split(';')[0];
}

// EJ: 8.1 (100 terneros, 180 kg), 8.2/3 (80 vacas, 450 kg) y 12 (vacío).
// OT: O1 (vacío). Bob solo consulta OT. Carol puede todo, en todas.
async function preparar() {
  const base = await prepararCampo();
  const { potrero: p81, lote: l81 } = await base.potrero('8.1', { hectareas: 50, usoNombre: 'Campo natural', lotes: [['8.1 · Terneros', 'Terneros', 100, 180]] });
  const { potrero: p82, lote: l82 } = await base.potrero('8.2/3', { hectareas: 40, lotes: [['8.2 · Vacas', 'Vacas', 80, 450]] });
  const { potrero: p12 } = await base.potrero('12', { hectareas: 30 });
  const otra = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra Estancia', orden: 1 } });
  const o1 = await prisma.potrero.create({ data: { campoId: otra.id, nombre: 'O1', hectareas: 25 } });
  await usuarioCon(BOB, { permisos: ['pecuaria:VER'], campoIds: [otra.id] });
  await usuarioCon(CAROL, { permisos: PECUARIA_TODO, todas: true });
  const ctx = { app, cookie: await cookieDe(ALICE) };
  ctx.catalogo = await leerCatalogo(ctx);
  return { ...base, p81, p82, p12, otra, o1, terneros: l81['8.1 · Terneros'], vacas: l82['8.2 · Vacas'], ctx };
}

const contar = async () => ({
  movimientos: await prisma.movimiento.count(),
  versiones: await prisma.versionStock.count(),
  eventos: await prisma.eventoRegistro.count(),
  pasto: await prisma.lecturaPasto.count(),
});

// Un Claude de mentira: `guion(params, n)` dice qué contesta en la vuelta n.
function clienteFalso(guion) {
  const pedidos = [];
  return {
    pedidos,
    messages: {
      stream(params) {
        pedidos.push(structuredClone(params));
        const paso = guion(params, pedidos.length);
        const oyentes = [];
        return {
          on(evento, cb) {
            if (evento === 'text') oyentes.push(cb);
            return this;
          },
          async finalMessage() {
            for (const b of paso.content) if (b.type === 'text') for (const cb of oyentes) cb(b.text);
            return {
              stop_reason: paso.content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
              content: paso.content,
              usage: { input_tokens: 10, output_tokens: 5 },
            };
          },
        };
      },
    },
  };
}

const texto = (t) => ({ content: [{ type: 'text', text: t }] });
const usar = (...pedidos) => ({
  content: pedidos.map(([name, input], i) => ({ type: 'tool_use', id: `toolu_${i}_${name}`, name, input })),
});

async function preguntar(agent, cuerpo) {
  const res = await agent
    .post('/api/asistente')
    .send(cuerpo)
    .buffer(true)
    .parse((r, cb) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => cb(null, d));
    });
  const eventos = res.status === 200 ? res.body.trim().split('\n').map((l) => JSON.parse(l)) : null;
  return { res, eventos };
}

// Lo que le devolvió nuestro servidor a Claude en la vuelta n (los tool_result).
const resultadosEn = (cliente, n) => cliente.pedidos[n - 1].messages.at(-1).content;

describe('proponer: arma la vista previa y NO registra', () => {
  it('mover una parte: sigue siendo el mismo lote, con los números de antes y después', async () => {
    const { ctx, terneros, p12 } = await preparar();
    const antes = await contar();
    const p = await proponer(ctx, accion('proponer_movimiento'), { loteId: terneros.id, cabezas: 30, destinoPotreroId: p12.id }, { hoy: HOY });
    expect(p.ruta).toBe('/movimientos');
    expect(p.cuerpo).toMatchObject({ loteOrigenId: terneros.id, cabezas: 30, destinoPotreroId: p12.id, modo: 'NUEVO', mismoLote: true });
    expect(p.tarjeta.titulo).toBe('Mover 30 Terneros de 8.1 a 12');
    expect(p.tarjeta.renglones).toEqual(expect.arrayContaining(['8.1: 100 → 70 cab.', '12: vacío → 30 cab.']));
    expect(p.tarjeta.link).toBe(`/pecuaria/potreros/${p12.id}`);
    expect(await contar()).toEqual(antes);
  });

  it('mover todas: el lote entero; con otra parte del mismo lote en el destino, se suma a ella', async () => {
    const { ctx, agent, terneros, p12 } = await preparar();
    const entero = await proponer(ctx, accion('proponer_movimiento'), { loteId: terneros.id, cabezas: 100, destinoPotreroId: p12.id }, { hoy: HOY });
    expect(entero.cuerpo.modo).toBe('ENTERO');
    // Una parte ya en el 12 (con la pantalla de siempre): la segunda se suma.
    await agent.post('/api/pecuaria/movimientos').send({ loteOrigenId: terneros.id, cabezas: 20, destinoPotreroId: p12.id, modo: 'NUEVO', mismoLote: true }).expect(201);
    const parte = await prisma.lote.findFirst({ where: { raizId: terneros.id } });
    const suma = await proponer(ctx, accion('proponer_movimiento'), { loteId: terneros.id, cabezas: 10, destinoPotreroId: p12.id }, { hoy: HOY });
    expect(suma.cuerpo).toMatchObject({ modo: 'SUMAR', loteDestinoId: parte.id });
  });

  it('cambio de categoría: se queda en su potrero', async () => {
    const { ctx, vacas } = await preparar();
    const p = await proponer(ctx, accion('proponer_movimiento'), { loteId: vacas.id, cabezas: 80, como: 'cambio_categoria', categoria: 'Vacas de invernada' }, { hoy: HOY });
    expect(p.cuerpo).toMatchObject({ modo: 'CATEGORIA', destinoPotreroId: vacas.potreroId });
    expect(p.tarjeta.renglones[0]).toBe('80 cab. pasan a Vacas invernar');
  });

  it('el error de la vista previa vuelve tal cual (por ejemplo, más cabezas de las que hay)', async () => {
    const { ctx, terneros, p12 } = await preparar();
    await expect(
      proponer(ctx, accion('proponer_movimiento'), { loteId: terneros.id, cabezas: 150, destinoPotreroId: p12.id, como: 'lote_nuevo' }, { hoy: HOY }),
    ).rejects.toThrow(/100/);
  });

  it('venta con precio por kilo: el total en la tarjeta; la guía y la causa se piden por el tipo', async () => {
    const { ctx, vacas } = await preparar();
    const a = accion('proponer_entrada_salida');
    const p = await proponer(ctx, a, { tipo: 'VENTA', loteId: vacas.id, cabezas: 10, pesoPromedioKg: 450, precioVentaUsd: 3.3, precioVentaPor: 'KG', guia: 'A123' }, { hoy: HOY });
    expect(p.cuerpo).toMatchObject({ loteId: vacas.id, cabezas: 10, precioVentaUsd: 3.3, precioVentaPor: 'KG', guia: 'A123' });
    expect(p.tarjeta.titulo).toBe('Venta o faena: 10 cab. de 8.2/3');
    expect(p.tarjeta.renglones).toEqual(expect.arrayContaining(['8.2/3: 80 → 70 cab.', expect.stringMatching(/total USD 14\.850/)]));
    // Sin la guía, el error de la ruta de siempre.
    await expect(proponer(ctx, a, { tipo: 'VENTA', loteId: vacas.id, cabezas: 10 }, { hoy: HOY })).rejects.toThrow(/guía/);
    // La causa por su nombre.
    const muerte = await proponer(ctx, a, { tipo: 'muerte', loteId: vacas.id, cabezas: 2, causa: 'mordida' }, { hoy: HOY });
    expect(muerte.tarjeta.renglones).toContain('Causa: Mordida');
    await expect(proponer(ctx, a, { tipo: 'MUERTE', loteId: vacas.id, cabezas: 2, causa: 'rayo' }, { hoy: HOY })).rejects.toThrow(/Las que hay: Cobra/);
  });

  it('compra: entra a un potrero como lote nuevo', async () => {
    const { ctx, p12 } = await preparar();
    const p = await proponer(ctx, accion('proponer_entrada_salida'), { tipo: 'COMPRA', potreroId: p12.id, guia: 'B1', lineas: [{ cabezas: 40, categoria: 'vaquillonas' }] }, { hoy: HOY });
    expect(p.cuerpo.lineas[0]).toMatchObject({ cabezas: 40, nuevoLote: { categoriaId: expect.any(Number) } });
    expect(p.tarjeta.renglones[0]).toBe('12: vacío → 40 cab.');
  });

  it('evento: pesada por lote; los de reproducción van por los procesos', async () => {
    const { ctx, terneros } = await preparar();
    const a = accion('proponer_evento');
    const p = await proponer(ctx, a, { tipo: 'Pesada', lotes: [{ loteId: terneros.id, pesoPromedioKg: 190 }] }, { hoy: HOY });
    expect(p.cuerpo).toMatchObject({ nivel: 'LOTE', lineas: [{ loteId: terneros.id, pesoPromedioKg: 190 }] });
    expect(p.tarjeta.titulo).toMatch(/^Pesada: 100 cab\. en 1 lote/);
    await expect(proponer(ctx, a, { tipo: 'ECOGRAFIA', lotes: [{ loteId: terneros.id }] }, { hoy: HOY })).rejects.toThrow(/procesos/);
    await expect(proponer(ctx, a, { tipo: 'VENTA', lotes: [{ loteId: terneros.id }] }, { hoy: HOY })).rejects.toThrow(/no es un evento/);
  });

  it('pasto: los nombres de los potreros; un potrero de otra estancia no existe para quien no la ve', async () => {
    const { ctx, p81, p12, o1 } = await preparar();
    const a = accion('proponer_pasto');
    const p = await proponer(ctx, a, { lecturas: [{ potreroId: p81.id, altura: 'BAJO' }, { potreroId: p12.id, altura: 'ALTO' }] }, { hoy: HOY });
    expect(p.tarjeta.renglones).toEqual(['8.1: Bajo', '12: Alto']);
    const ctxBob = { app, cookie: await cookieDe(BOB) };
    ctxBob.catalogo = await leerCatalogo(ctxBob);
    await expect(proponer(ctxBob, a, { lecturas: [{ potreroId: p81.id, altura: 'BAJO' }] }, { hoy: HOY })).rejects.toThrow(/no encontrado/i);
    // Bob ve OT pero no registra: la ruta de siempre se lo dice al confirmar (acá, el corral no aplica).
    expect(o1.id).toBeGreaterThan(0);
  });

  it('entre estancias: una parte forma un lote nuevo en el destino', async () => {
    const { ctx, terneros, o1 } = await preparar();
    const p = await proponer(ctx, accion('proponer_entre_campos'), { loteId: terneros.id, cabezas: 20, destinoPotreroId: o1.id, guia: 'G-7' }, { hoy: HOY });
    expect(p.ruta).toBe('/movimientos/entre-campos');
    expect(p.cuerpo).toMatchObject({ modo: 'NUEVO', guia: 'G-7', nuevoLote: { categoriaId: terneros.categoriaId } });
    expect(p.tarjeta.titulo).toBe('Llevar 20 Terneros de EJ 8.1 a OT O1');
  });

  it('buscarCausa por código o por nombre', () => {
    const tipo = { causas: [{ id: 1, codigo: 'MO-001', nombre: 'Mordida' }] };
    expect(buscarCausa(tipo, 'mo-001').id).toBe(1);
    expect(buscarCausa(tipo, 'MORDIDA').id).toBe(1);
    expect(buscarCausa(tipo, 'cobra')).toBeNull();
  });
});

describe('el chat: la propuesta, Confirmar y Cancelar', () => {
  it('propone, la persona confirma una sola vez, queda auditado "desde el asistente" y Claude se entera', async () => {
    const { agent, terneros, p12 } = await preparar();
    const cliente = clienteFalso((params, n) =>
      n === 1 ? usar(['proponer_movimiento', { loteId: terneros.id, cabezas: 30, destinoPotreroId: p12.id }]) : texto('Te dejé la propuesta para confirmar.'),
    );
    dependencias.crearCliente = () => cliente;
    const antes = await contar();

    const { eventos } = await preguntar(agent, { pregunta: 'Mové 30 terneros del 8.1 al 12' });
    const propuesta = eventos.find((e) => e.tipo === 'propuesta').propuesta;
    expect(propuesta).toMatchObject({ estado: 'PENDIENTE', herramienta: 'proponer_movimiento', tarjeta: { titulo: 'Mover 30 Terneros de 8.1 a 12' } });
    expect(eventos.at(-1)).toEqual({ tipo: 'fin' });
    // A Claude se le ofrecieron las acciones y se le dijo que no se registró nada.
    expect(cliente.pedidos[0].tools.map((t) => t.name)).toContain('proponer_movimiento');
    expect(cliente.pedidos[0].system).toMatch(/Proponer NO registra/);
    expect(resultadosEn(cliente, 2)[0].content).toMatch(/Todavía NO se registró nada/);
    expect(await contar()).toEqual(antes);

    const { body } = await agent.post(`/api/asistente/propuestas/${propuesta.id}/confirmar`).expect(200);
    expect(body.propuesta).toMatchObject({ estado: 'CONFIRMADA', resultado: { movimientoId: expect.any(Number) } });
    expect(await prisma.movimiento.count()).toBe(antes.movimientos + 1);
    const auditoria = await prisma.auditoria.findFirst({ where: { accion: 'MOVIMIENTO_REGISTRADO' } });
    expect(auditoria.detalle).toMatchObject({ origen: 'asistente', propuestaId: propuesta.id, cabezas: 30 });

    // El segundo toque no registra otra vez.
    const otra = await agent.post(`/api/asistente/propuestas/${propuesta.id}/confirmar`).expect(409);
    expect(otra.body).toEqual({ errors: ['Esta propuesta ya se confirmó.'], code: 'PROPUESTA_CONFIRMADA' });
    expect(await prisma.movimiento.count()).toBe(antes.movimientos + 1);

    // En la pregunta siguiente, Claude se entera (una sola vez).
    const cliente2 = clienteFalso(() => texto('Listo.'));
    dependencias.crearCliente = () => cliente2;
    await preguntar(agent, { pregunta: '¿Y ahora cuántos quedan?' });
    expect(cliente2.pedidos[0].messages.at(-1).content).toMatch(new RegExp(`propuesta #${propuesta.id} \\(Mover 30 Terneros de 8\\.1 a 12\\): la confirmó y quedó registrada`));
    const cliente3 = clienteFalso(() => texto('Ok.'));
    dependencias.crearCliente = () => cliente3;
    await preguntar(agent, { pregunta: 'Gracias' });
    expect(cliente3.pedidos[0].messages.at(-1).content).not.toMatch(/Desde la última pregunta/);

    // El historial trae la tarjeta con su estado.
    const { body: h } = await agent.get('/api/asistente/historial').expect(200);
    expect(h.consultas[0].propuestas).toEqual([expect.objectContaining({ id: propuesta.id, estado: 'CONFIRMADA' })]);
  });

  it('cancelar no registra nada; después no se puede confirmar', async () => {
    const { agent, terneros, p12 } = await preparar();
    dependencias.crearCliente = () =>
      clienteFalso((params, n) => (n === 1 ? usar(['proponer_movimiento', { loteId: terneros.id, cabezas: 30, destinoPotreroId: p12.id }]) : texto('Ok.')));
    const { eventos } = await preguntar(agent, { pregunta: 'Mové 30 terneros al 12' });
    const { id } = eventos.find((e) => e.tipo === 'propuesta').propuesta;
    const { body } = await agent.post(`/api/asistente/propuestas/${id}/cancelar`).expect(200);
    expect(body.propuesta.estado).toBe('CANCELADA');
    const r = await agent.post(`/api/asistente/propuestas/${id}/confirmar`).expect(409);
    expect(r.body.code).toBe('PROPUESTA_CANCELADA');
    expect(await prisma.movimiento.count()).toBe(0);
  });

  it('vence a la hora', async () => {
    const { agent, terneros, p12 } = await preparar();
    dependencias.crearCliente = () =>
      clienteFalso((params, n) => (n === 1 ? usar(['proponer_movimiento', { loteId: terneros.id, cabezas: 30, destinoPotreroId: p12.id }]) : texto('Ok.')));
    const { eventos } = await preguntar(agent, { pregunta: 'Mové 30 terneros al 12' });
    const { id } = eventos.find((e) => e.tipo === 'propuesta').propuesta;
    await prisma.asistentePropuesta.update({ where: { id }, data: { creadaEn: new Date(Date.now() - 61 * 60 * 1000) } });
    const r = await agent.post(`/api/asistente/propuestas/${id}/confirmar`).expect(409);
    expect(r.body).toEqual({ errors: ['Esta propuesta venció (pasó más de una hora). Pedila de nuevo.'], code: 'PROPUESTA_VENCIDA' });
    expect((await prisma.asistentePropuesta.findUnique({ where: { id } })).estado).toBe('VENCIDA');
    expect(await prisma.movimiento.count()).toBe(0);
  });

  it('si algo cambió en el medio, el error de la ruta de siempre y la propuesta queda ERROR', async () => {
    const { agent, terneros, p12, p82 } = await preparar();
    dependencias.crearCliente = () =>
      clienteFalso((params, n) => (n === 1 ? usar(['proponer_movimiento', { loteId: terneros.id, cabezas: 90, destinoPotreroId: p12.id, como: 'lote_nuevo' }]) : texto('Ok.')));
    const { eventos } = await preguntar(agent, { pregunta: 'Mové 90 terneros al 12' });
    const { id } = eventos.find((e) => e.tipo === 'propuesta').propuesta;
    // Mientras tanto, alguien se lleva 50 desde la pantalla.
    await agent.post('/api/pecuaria/movimientos').send({ loteOrigenId: terneros.id, cabezas: 50, destinoPotreroId: p82.id, modo: 'NUEVO', mismoLote: true }).expect(201);
    const { body } = await agent.post(`/api/asistente/propuestas/${id}/confirmar`).expect(200);
    expect(body.propuesta.estado).toBe('ERROR');
    expect(body.propuesta.error).toMatch(/50/);
    expect(await prisma.movimiento.count()).toBe(1);
  });

  it('otra persona no puede confirmar ni cancelar tu propuesta', async () => {
    const { agent, terneros, p12 } = await preparar();
    dependencias.crearCliente = () =>
      clienteFalso((params, n) => (n === 1 ? usar(['proponer_movimiento', { loteId: terneros.id, cabezas: 30, destinoPotreroId: p12.id }]) : texto('Ok.')));
    const { eventos } = await preguntar(agent, { pregunta: 'Mové 30 terneros al 12' });
    const { id } = eventos.find((e) => e.tipo === 'propuesta').propuesta;
    const carol = await loggedAgent(CAROL);
    await carol.post(`/api/asistente/propuestas/${id}/confirmar`).expect(404);
    await carol.post(`/api/asistente/propuestas/${id}/cancelar`).expect(404);
    // Bob no puede registrar: ni siquiera llega.
    const bob = await loggedAgent(BOB);
    await bob.post(`/api/asistente/propuestas/${id}/confirmar`).expect(403);
    expect(await prisma.movimiento.count()).toBe(0);
  });

  it('sin permiso de registrar, a Claude no se le ofrecen las acciones (y si las pide, no existen)', async () => {
    const { o1 } = await preparar();
    const bob = await loggedAgent(BOB);
    const cliente = clienteFalso((params, n) => (n === 1 ? usar(['proponer_pasto', { lecturas: [{ potreroId: o1.id, altura: 'BAJO' }] }]) : texto('No tenés permiso.')));
    dependencias.crearCliente = () => cliente;
    const { eventos } = await preguntar(bob, { pregunta: 'Anotá pasto bajo en O1' });
    expect(cliente.pedidos[0].tools.map((t) => t.name).some((n) => n.startsWith('proponer_'))).toBe(false);
    expect(cliente.pedidos[0].system).toMatch(/no tiene permiso para registrar/);
    expect(resultadosEn(cliente, 2)[0]).toMatchObject({ is_error: true, content: 'No existe la herramienta proponer_pasto.' });
    expect(eventos.some((e) => e.tipo === 'propuesta')).toBe(false);
    expect(await prisma.asistentePropuesta.count()).toBe(0);
  });

  it(`hasta ${MAX_PROPUESTAS} propuestas por respuesta`, async () => {
    const { agent, p81, p12, p82 } = await preparar();
    const pasto = (potreroId) => ['proponer_pasto', { lecturas: [{ potreroId, altura: 'MEDIO' }] }];
    const cliente = clienteFalso((params, n) => (n === 1 ? usar(pasto(p81.id), pasto(p12.id), pasto(p82.id), pasto(p81.id)) : texto('Ok.')));
    dependencias.crearCliente = () => cliente;
    const { eventos } = await preguntar(agent, { pregunta: 'Pasto medio en todo' });
    expect(eventos.filter((e) => e.tipo === 'propuesta')).toHaveLength(MAX_PROPUESTAS);
    const resultados = resultadosEn(cliente, 2);
    expect(resultados.at(-1)).toMatchObject({ is_error: true, content: expect.stringMatching(/Ya armaste 3 propuestas/) });
    // Quedan unidas a la consulta.
    const consulta = await prisma.asistenteConsulta.findFirst();
    expect(await prisma.asistentePropuesta.count({ where: { consultaId: consulta.id } })).toBe(MAX_PROPUESTAS);
  });

  it('confirmar cada acción registra con la ruta de siempre: venta, pesada, pasto y entre estancias', async () => {
    const { agent, vacas, terneros, p81, p12, o1 } = await preparar();
    const pedidos = [
      ['proponer_entrada_salida', { tipo: 'VENTA', loteId: vacas.id, cabezas: 10, pesoPromedioKg: 450, precioVentaUsd: 3.3, precioVentaPor: 'KG', guia: 'A1' }],
      ['proponer_evento', { tipo: 'PESADA', lotes: [{ loteId: terneros.id, pesoPromedioKg: 190 }] }],
      ['proponer_pasto', { lecturas: [{ potreroId: p81.id, altura: 'BAJO' }, { potreroId: p12.id, altura: 'ALTO' }] }],
    ];
    dependencias.crearCliente = () => clienteFalso((params, n) => (n === 1 ? usar(...pedidos) : texto('Ok.')));
    const { eventos } = await preguntar(agent, { pregunta: 'Varias cosas' });
    const ids = eventos.filter((e) => e.tipo === 'propuesta').map((e) => e.propuesta.id);
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      const { body } = await agent.post(`/api/asistente/propuestas/${id}/confirmar`).expect(200);
      expect(body.propuesta.estado).toBe('CONFIRMADA');
    }
    const venta = await prisma.movimiento.findFirst({ where: { tipo: { clave: 'VENTA' } } });
    expect(venta).toMatchObject({ cabezas: 10, guia: 'A1', precioVentaPor: 'KG' });
    expect(await prisma.eventoRegistro.count()).toBe(1);
    expect(await prisma.lecturaPasto.count()).toBe(2);
    const auditorias = await prisma.auditoria.findMany({ where: { accion: { in: ['MOVIMIENTO_REGISTRADO', 'EVENTO_REGISTRADO', 'PASTO_REGISTRADO'] } } });
    expect(auditorias).toHaveLength(3);
    expect(auditorias.every((a) => a.detalle.origen === 'asistente')).toBe(true);

    // Entre estancias.
    dependencias.crearCliente = () =>
      clienteFalso((params, n) => (n === 1 ? usar(['proponer_entre_campos', { loteId: terneros.id, cabezas: 20, destinoPotreroId: o1.id }]) : texto('Ok.')));
    const r = await preguntar(agent, { pregunta: 'Llevá 20 terneros a O1' });
    const entre = r.eventos.find((e) => e.tipo === 'propuesta').propuesta;
    const { body } = await agent.post(`/api/asistente/propuestas/${entre.id}/confirmar`).expect(200);
    expect(body.propuesta).toMatchObject({ estado: 'CONFIRMADA', resultado: { eventoId: expect.any(Number) } });
    const enO1 = await prisma.lote.findFirst({ where: { potreroId: o1.id } });
    expect(enO1.campoId).toBe((await prisma.potrero.findUnique({ where: { id: o1.id } })).campoId);
  });

  it('el error de una propuesta llega a Claude como error y no queda nada guardado', async () => {
    const { agent, terneros, p12 } = await preparar();
    const cliente = clienteFalso((params, n) =>
      n === 1 ? usar(['proponer_movimiento', { loteId: terneros.id, cabezas: 500, destinoPotreroId: p12.id, como: 'lote_nuevo' }]) : texto('En el 8.1 hay 100.'),
    );
    dependencias.crearCliente = () => cliente;
    const { eventos } = await preguntar(agent, { pregunta: 'Mové 500 terneros al 12' });
    expect(resultadosEn(cliente, 2)[0]).toMatchObject({ is_error: true, content: expect.stringMatching(/100/) });
    expect(eventos.some((e) => e.tipo === 'propuesta')).toBe(false);
    expect(await prisma.asistentePropuesta.count()).toBe(0);
  });

  it('una conversación con las instrucciones viejas (solo consulta) no se sigue', async () => {
    await preparar();
    const agent = await loggedAgent(ALICE);
    const usuario = await prisma.usuario.findFirst({ where: { usuario: 'alice' } });
    const vieja = await prisma.asistenteConversacion.create({
      data: { id: crypto.randomUUID(), usuarioId: usuario.id, mensajes: { sistema: 'Esta versión solo consulta.', mensajes: [] } },
    });
    const cliente = clienteFalso(() => texto('Hola.'));
    dependencias.crearCliente = () => cliente;
    const { eventos } = await preguntar(agent, { pregunta: 'Hola' });
    expect(eventos[0].id).not.toBe(vieja.id);
    expect(cliente.pedidos[0].system).toMatch(/Proponer NO registra/);
    const nueva = await prisma.asistenteConversacion.findUnique({ where: { id: eventos[0].id } });
    expect(nueva.mensajes.version).toBe(versionPara(true));
  });
});

describe('instrucciones y auditoría', () => {
  it('el catálogo dice qué causas tiene cada tipo y si la guía es obligatoria', async () => {
    const { ctx } = await preparar();
    const t = armarInstrucciones(ctx.catalogo, { puedeRegistrar: true });
    expect(t).toMatch(/- MUERTE: Muerte \(causa obligatoria: Cobra, Mordida, Parto\)/);
    expect(t).toMatch(/- VENTA: Venta o faena \(guía obligatoria\)/);
    expect(armarInstrucciones(ctx.catalogo)).not.toMatch(/proponer_movimiento/);
  });

  it('la marca "asistente" solo cuenta si viene de la misma máquina', () => {
    const req = (cabeceras, remoteAddress) => ({ get: (k) => cabeceras[k.toLowerCase()], socket: { remoteAddress } });
    const marca = { 'x-origen': 'asistente', 'x-asistente-propuesta': '12' };
    expect(desdeElAsistente(req(marca, '127.0.0.1'))).toEqual({ origen: 'asistente', propuestaId: 12 });
    expect(desdeElAsistente(req(marca, '::ffff:127.0.0.1'))).toEqual({ origen: 'asistente', propuestaId: 12 });
    expect(desdeElAsistente(req(marca, '10.0.0.5'))).toBeNull();
    expect(desdeElAsistente(req({}, '127.0.0.1'))).toBeNull();
  });
});
