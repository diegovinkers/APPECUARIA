// El asistente, fase 1 (docs/superpowers/specs/2026-11-27-asistente-design.md).
// Claude está simulado: estos tests no gastan nada.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import asistenteRoutes from '../src/asistente/asistente.routes.js';
import { aTexto, limpiar } from '../src/asistente/limpiar.js';
import { buscarCampo, buscarCategoria, herramienta, definiciones, leerCatalogo } from '../src/asistente/herramientas.js';
import { HORAS_DE_CONTEXTO, MAX_IDAS, MAX_PREGUNTAS, POR_PAGINA, dependencias, purgarAsistente } from '../src/asistente/asistente.service.js';
import { ALICE, BOB, loggedAgent, sessionCookie, useTestDatabase, usuarioCon } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const crearClienteOriginal = dependencias.crearCliente;
afterEach(() => {
  dependencias.crearCliente = crearClienteOriginal;
});

// La cookie "nombre=valor" de una persona, para llamar a las herramientas.
async function cookieDe({ usuario, password }) {
  const res = await request(app).post('/api/login').send({ usuario, password }).expect(200);
  return sessionCookie(res).split(';')[0];
}

// EJ: potreros 8.1 (100 terneros), 8.2/3 (80 vacas) y 12 (vacío).
// OT (otra estancia): potrero O1 con 50 novillos. Bob solo ve OT.
async function preparar() {
  const base = await prepararCampo();
  const { potrero: p81, lote: l81 } = await base.potrero('8.1', { hectareas: 50, usoNombre: 'Campo natural', lotes: [['8.1 · Terneros', 'Terneros', 100, 180]] });
  const { potrero: p82 } = await base.potrero('8.2/3', { hectareas: 40, lotes: [['8.2 · Vacas', 'Vacas', 80, 450]] });
  const { potrero: p12 } = await base.potrero('12', { hectareas: 30 });
  const otra = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra Estancia', orden: 1 } });
  const o1 = await prisma.potrero.create({ data: { campoId: otra.id, nombre: 'O1', hectareas: 25 } });
  await usuarioCon(BOB, { permisos: ['pecuaria:VER'], campoIds: [otra.id] });
  const ctxAlice = { app, cookie: await cookieDe(ALICE) };
  ctxAlice.catalogo = await leerCatalogo(ctxAlice);
  return { ...base, p81, p82, p12, otra, o1, lote81: l81['8.1 · Terneros'], ctxAlice };
}

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
            if (paso instanceof Error) throw paso;
            for (const b of paso.content) if (b.type === 'text') for (const cb of oyentes) cb(b.text);
            return {
              stop_reason: paso.stop_reason ?? (paso.content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn'),
              content: paso.content,
              usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 },
            };
          },
        };
      },
    },
  };
}

const texto = (t) => ({ content: [{ type: 'text', text: t }] });
const usar = (name, input, id = `toolu_${name}`) => ({ content: [{ type: 'tool_use', id, name, input }] });

// La respuesta NDJSON como lista de eventos.
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
  return { res, eventos, respuesta: eventos?.filter((e) => e.tipo === 'texto').map((e) => e.texto).join('') };
}

describe('limpiar: lo que se manda a Claude', () => {
  it('saca los datos de personas, los códigos de CIGAM y los vacíos, y redondea', () => {
    const datos = {
      potrero: '8.1',
      usuario: 'Alice Test',
      usuarioId: 3,
      creadoPor: { nombre: 'Alice Test' },
      anuladaPorId: 4,
      email: 'alice@ejemplo.test',
      idAreaManejoCigam: '77',
      nota: null,
      lotes: [],
      cabHa: 3.18333,
      lineas: [{ lote: 'A', cabezas: 10, usuario: 'Bob Test' }],
    };
    expect(limpiar(datos)).toEqual({ potrero: '8.1', cabHa: 3.18, lineas: [{ lote: 'A', cabezas: 10 }] });
  });

  it('aTexto recorta las listas largas y lo avisa', () => {
    const largo = { filas: Array.from({ length: 2000 }, (_, i) => ({ i, nombre: `fila ${i}` })) };
    const t = aTexto(largo, 2000);
    expect(t.length).toBeLessThan(2300);
    expect(t).toMatch(/recortado/);
    expect(aTexto({ a: 1 })).toBe('{"a":1}');
  });

  it('el buscador del servidor es la misma copia que el de la app', () => {
    const app = readFileSync(new URL('../../client/src/components/busqueda.js', import.meta.url), 'utf8');
    const servidor = readFileSync(new URL('../src/asistente/busqueda.js', import.meta.url), 'utf8');
    expect(servidor.endsWith(app)).toBe(true);
  });
});

describe('herramientas: las mismas rutas, con los permisos de la persona', () => {
  it('las definiciones para Claude salen de los esquemas', () => {
    const defs = definiciones();
    expect(defs.map((d) => d.name)).toContain('buscar_potreros');
    for (const d of defs) {
      expect(d.input_schema.type).toBe('object');
      expect(d.description.length).toBeGreaterThan(20);
    }
  });

  it('buscar_potreros encuentra por el nombre como lo dice la gente, y filtra', async () => {
    const { ctxAlice } = await preparar();
    const buscar = (e) => herramienta('buscar_potreros').ejecutar(ctxAlice, e);

    const r = await buscar({ texto: '8' });
    expect(r.potreros.map((p) => p.potrero)).toEqual(['EJ 8.1', 'EJ 8.2/3']);
    expect(r.potreros[0]).toMatchObject({ cabezas: 100, uso: 'Campo natural', link: expect.stringMatching(/^\/pecuaria\/potreros\/\d+$/) });
    expect(r.potreros[0].lotes[0]).toMatchObject({ categoria: 'Terneros', cabezas: 100, pesoPromedioKg: 180 });

    expect((await buscar({ texto: '8.3' })).potreros.map((p) => p.potrero)).toEqual(['EJ 8.2/3']);
    expect((await buscar({ categoria: 'vacas' })).suma).toMatchObject({ cabezas: 80, cabezasDeLaCategoria: 80 });
    expect((await buscar({ estancia: 'ej', conAnimales: false })).potreros.map((p) => p.potrero)).toEqual(['EJ 12']);
    expect((await buscar({ ordenarPor: 'cabezas', limite: 1 })).potreros[0].potrero).toBe('EJ 8.1');
    await expect(buscar({ estancia: 'Marte' })).rejects.toThrow(/No encontré "Marte"/);
  });

  it('ficha_potrero, ver_lote, resumen e historial contestan sin nombres de personas', async () => {
    const { ctxAlice, p81, lote81 } = await preparar();
    const resultados = await Promise.all([
      herramienta('ficha_potrero').ejecutar(ctxAlice, { potreroId: p81.id }),
      herramienta('ver_lote').ejecutar(ctxAlice, { loteId: lote81.id }),
      herramienta('resumen').ejecutar(ctxAlice, {}),
      herramienta('resumen').ejecutar(ctxAlice, { estancia: 'EJ' }),
      herramienta('historial').ejecutar(ctxAlice, { estancia: 'EJ' }),
      herramienta('procesos').ejecutar(ctxAlice, {}),
    ]);
    expect(resultados[0].potrero).toMatchObject({ potrero: 'EJ 8.1', cabezas: 100 });
    expect(resultados[3].estancia).toBe('EJ (Estancia Ejemplo)');
    for (const r of resultados) {
      expect(aTexto(r)).not.toMatch(/Alice|Bob|usuario/i);
    }
  });

  it('alcance: lo de otra estancia no existe para quien no la tiene', async () => {
    const { p81, o1 } = await preparar();
    const ctxBob = { app, cookie: await cookieDe(BOB) };
    ctxBob.catalogo = await leerCatalogo(ctxBob);
    expect(ctxBob.catalogo.campos.map((c) => c.sigla)).toEqual(['OT']);

    const r = await herramienta('buscar_potreros').ejecutar(ctxBob, {});
    expect(r.potreros.map((p) => p.potrero)).toEqual(['OT O1']);
    await expect(herramienta('buscar_potreros').ejecutar(ctxBob, { estancia: 'EJ' })).rejects.toThrow(/No encontré "EJ"/);
    await expect(herramienta('ficha_potrero').ejecutar(ctxBob, { potreroId: p81.id })).rejects.toThrow(/no encontrado/i);
    expect((await herramienta('ficha_potrero').ejecutar(ctxBob, { potreroId: o1.id })).potrero.potrero).toBe('OT O1');
  });

  it('sin sesión, las herramientas no leen nada', async () => {
    await preparar();
    await expect(herramienta('buscar_potreros').ejecutar({ app, cookie: '', catalogo: { campos: [], categorias: [] } }, {})).rejects.toThrow(/iniciar sesión/);
  });

  it('buscarCampo y buscarCategoria entienden sigla, nombre y alias', async () => {
    const { ctxAlice } = await preparar();
    expect(buscarCampo(ctxAlice.catalogo, 'ej')?.sigla).toBe('EJ');
    expect(buscarCampo(ctxAlice.catalogo, 'estancia ejemplo')?.sigla).toBe('EJ');
    expect(buscarCategoria(ctxAlice.catalogo, 'TERNEROS')?.nombre).toBe('Terneros');
  });
});

describe('POST /api/asistente', () => {
  it('pide sesión y pecuaria:VER', async () => {
    await request(app).post('/api/asistente').send({ pregunta: 'hola' }).expect(401);
    await usuarioCon(BOB, { permisos: [] });
    const bob = await loggedAgent(BOB);
    await bob.post('/api/asistente').send({ pregunta: 'hola' }).expect(403);
    await bob.get('/api/asistente/estado').expect(403);
  });

  it('sin clave de Anthropic: 503 con un mensaje claro', async () => {
    const { agent } = await preparar();
    dependencias.crearCliente = () => null;
    const { res } = await preguntar(agent, { pregunta: '¿Cuántos terneros hay?' });
    expect(res.status).toBe(503);
    expect(res.body).toMatch(/no está configurado/);
  });

  it('valida la pregunta', async () => {
    const { agent } = await preparar();
    dependencias.crearCliente = () => clienteFalso(() => texto('hola'));
    await agent.post('/api/asistente').send({ pregunta: '  ' }).expect(400);
    await agent.post('/api/asistente').send({ pregunta: 'x'.repeat(2001) }).expect(400);
  });

  it('pregunta → herramienta → respuesta, y la conversación sigue', async () => {
    const { agent, p81 } = await preparar();
    const cliente = clienteFalso((params, n) =>
      n === 1 ? usar('buscar_potreros', { texto: '8.1' }) : n === 2 ? texto('En [EJ 8.1](/pecuaria/potreros/1) hay **100 terneros**.') : texto('De nada.'),
    );
    dependencias.crearCliente = () => cliente;

    const { eventos, respuesta } = await preguntar(agent, { pregunta: '¿Qué hay en el 8.1?' });
    expect(eventos[0]).toMatchObject({ tipo: 'conversacion', id: expect.any(String) });
    expect(eventos).toContainEqual({ tipo: 'buscando', texto: 'Buscando el potrero 8.1…' });
    expect(respuesta).toBe('En [EJ 8.1](/pecuaria/potreros/1) hay **100 terneros**.');
    expect(eventos.at(-1)).toEqual({ tipo: 'fin' });

    // Lo que recibió Claude: instrucciones con el catálogo, la fecha y el
    // resultado de la herramienta (con el potrero y sin nombres de personas).
    const [primero, segundo] = cliente.pedidos;
    expect(primero.model).toBe('claude-haiku-5-5');
    expect(primero.system).toMatch(/EJ: Estancia Ejemplo/);
    expect(primero.messages[0].content).toMatch(/^\[Hoy es \d{2}\/\d{2}\/\d{4}/);
    expect(primero.tools.length).toBeGreaterThan(5);
    const resultado = segundo.messages[2].content[0];
    expect(resultado).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_buscar_potreros' });
    expect(resultado.content).toContain(`"id":${p81.id}`);
    expect(resultado.content).not.toMatch(/Alice/);

    const consulta = await prisma.asistenteConsulta.findFirst();
    expect(consulta).toMatchObject({
      pregunta: '¿Qué hay en el 8.1?',
      respuesta: expect.stringContaining('100 terneros'),
      herramientas: ['buscar_potreros'],
      idas: 2,
      tokensEntrada: 20,
      tokensCacheLeidos: 200,
      error: null,
    });

    // Segunda pregunta en la misma conversación: Claude recibe todo lo anterior.
    const id = eventos[0].id;
    const segunda = await preguntar(agent, { conversacionId: id, pregunta: 'Gracias' });
    expect(segunda.respuesta).toBe('De nada.');
    const tercero = cliente.pedidos[2];
    expect(tercero.system).toBe(primero.system);
    expect(tercero.messages).toHaveLength(5);
    expect(await prisma.asistenteConsulta.count({ where: { conversacionId: id } })).toBe(2);
  });

  it('la conversación de otra persona no existe', async () => {
    const { agent } = await preparar();
    dependencias.crearCliente = () => clienteFalso(() => texto('hola'));
    const { eventos } = await preguntar(agent, { pregunta: 'hola' });
    const CARLOS = { usuario: 'carlos', nombre: 'Carlos Test', password: 'password789' };
    await usuarioCon(CARLOS, { permisos: ['pecuaria:VER'], todas: true });
    const carlos = await loggedAgent(CARLOS);
    const { res } = await preguntar(carlos, { conversacionId: eventos[0].id, pregunta: 'hola' });
    expect(res.status).toBe(404);
  });

  it('una herramienta con datos malos o que falla: Claude recibe el error y sigue', async () => {
    const { agent } = await preparar();
    const cliente = clienteFalso((params, n) =>
      n === 1
        ? { content: [
            { type: 'tool_use', id: 't1', name: 'ficha_potrero', input: { potreroId: 'ocho' } },
            { type: 'tool_use', id: 't2', name: 'ficha_potrero', input: { potreroId: 999999 } },
            { type: 'tool_use', id: 't3', name: 'borrar_todo', input: {} },
          ] }
        : texto('No encontré ese potrero.'),
    );
    dependencias.crearCliente = () => cliente;
    const { respuesta } = await preguntar(agent, { pregunta: 'ficha del 999' });
    expect(respuesta).toBe('No encontré ese potrero.');
    const resultados = cliente.pedidos[1].messages[2].content;
    expect(resultados.map((r) => r.is_error)).toEqual([true, true, true]);
    expect(resultados[0].content).toMatch(/no son válidos/);
    expect(resultados[1].content).toMatch(/no encontrado/i);
    expect(resultados[2].content).toMatch(/No existe la herramienta borrar_todo/);
  });

  it(`como mucho ${MAX_IDAS} vueltas: en la última, Claude tiene que contestar`, async () => {
    const { agent } = await preparar();
    const cliente = clienteFalso((params) => (params.tool_choice?.type === 'none' ? texto('Listo.') : usar('resumen', {})));
    dependencias.crearCliente = () => cliente;
    const { respuesta, eventos } = await preguntar(agent, { pregunta: 'resumen' });
    expect(respuesta).toBe('Listo.');
    expect(eventos.at(-1)).toEqual({ tipo: 'fin' });
    expect(cliente.pedidos).toHaveLength(MAX_IDAS);
    expect(cliente.pedidos.at(-1).tool_choice).toEqual({ type: 'none' });
  });

  it('si Claude falla: un mensaje claro, la consulta queda con el error y la conversación no se guarda', async () => {
    const { agent } = await preparar();
    dependencias.crearCliente = () => clienteFalso(() => new Error('se cortó'));
    const { eventos } = await preguntar(agent, { pregunta: 'hola' });
    expect(eventos.at(-1)).toEqual({ tipo: 'error', mensaje: 'Algo salió mal al contestar. Probá de nuevo.' });
    expect(await prisma.asistenteConversacion.count()).toBe(0);
    expect(await prisma.asistenteConsulta.findFirst()).toMatchObject({ error: expect.stringMatching(/salió mal/), conversacionId: null });
  });

  it('un rechazo de Claude no deja la conversación a medias', async () => {
    const { agent } = await preparar();
    dependencias.crearCliente = () => clienteFalso(() => ({ content: [], stop_reason: 'refusal' }));
    const { respuesta, eventos } = await preguntar(agent, { pregunta: 'algo raro' });
    expect(respuesta).toBe('No puedo ayudar con eso.');
    expect(eventos.at(-1)).toEqual({ tipo: 'fin' });
    expect(await prisma.asistenteConversacion.count()).toBe(0);
  });

  it('GET /estado dice si está configurado y con qué modelo', async () => {
    const { agent } = await preparar();
    const { body } = await agent.get('/api/asistente/estado').expect(200);
    expect(body).toEqual({ configurado: expect.any(Boolean), modelo: 'claude-haiku-5-5' });
  });

  it('las rutas declaran su permiso', () => {
    const rutas = asistenteRoutes.stack.filter((capa) => capa.route);
    expect(rutas.length).toBe(3);
    expect(rutas.every((capa) => capa.route.stack.some((l) => l.handle.permiso === 'pecuaria:VER'))).toBe(true);
  });
});

describe('un chat por persona', () => {
  it('sin conversacionId sigue su conversación; la de otra persona, no', async () => {
    const { agent } = await preparar();
    const cliente = clienteFalso((params) => texto(`Van ${params.messages.filter((m) => typeof m.content === 'string').length}.`));
    dependencias.crearCliente = () => cliente;
    const a = await preguntar(agent, { pregunta: 'uno' });
    const b = await preguntar(agent, { pregunta: 'dos' });
    expect(b.eventos[0].id).toBe(a.eventos[0].id);
    expect(b.respuesta).toBe('Van 2.');

    const CARLOS = { usuario: 'carlos', nombre: 'Carlos Test', password: 'password789' };
    await usuarioCon(CARLOS, { permisos: ['pecuaria:VER'], todas: true });
    const c = await preguntar(await loggedAgent(CARLOS), { pregunta: 'tres' });
    expect(c.eventos[0].id).not.toBe(a.eventos[0].id);
    expect(c.respuesta).toBe('Van 1.');
  });

  it(`después de ${HORAS_DE_CONTEXTO} horas sin preguntar, o con ${MAX_PREGUNTAS} preguntas, Claude arranca de cero`, async () => {
    const { agent } = await preparar();
    dependencias.crearCliente = () => clienteFalso(() => texto('ok'));
    const a = await preguntar(agent, { pregunta: 'uno' });
    const viejo = new Date(Date.now() - (HORAS_DE_CONTEXTO + 1) * 60 * 60 * 1000);
    await prisma.asistenteConversacion.update({ where: { id: a.eventos[0].id }, data: { actualizadaEn: viejo } });
    const b = await preguntar(agent, { pregunta: 'dos' });
    expect(b.eventos[0].id).not.toBe(a.eventos[0].id);

    const llena = await prisma.asistenteConversacion.findUnique({ where: { id: b.eventos[0].id } });
    const muchas = Array.from({ length: MAX_PREGUNTAS }, (_, i) => [
      { role: 'user', content: `p${i}` },
      { role: 'assistant', content: [{ type: 'text', text: 'r' }] },
    ]).flat();
    await prisma.asistenteConversacion.update({ where: { id: llena.id }, data: { mensajes: { ...llena.mensajes, mensajes: muchas } } });
    const c = await preguntar(agent, { pregunta: 'tres' });
    expect(c.res.status).toBe(200);
    expect(c.eventos[0].id).not.toBe(b.eventos[0].id);
  });
});

describe('GET /api/asistente/historial', () => {
  it('las consultas de la persona, de la más vieja a la más nueva, de a páginas', async () => {
    const { agent } = await preparar();
    const alice = await prisma.usuario.findFirst({ where: { usuario: ALICE.usuario } });
    const bob = await prisma.usuario.findFirst({ where: { usuario: BOB.usuario } });
    const total = POR_PAGINA + 5;
    for (let i = 1; i <= total; i++) {
      await prisma.asistenteConsulta.create({ data: { usuarioId: alice.id, modelo: 'm', pregunta: `p${i}`, respuesta: `r${i}` } });
    }
    await prisma.asistenteConsulta.create({ data: { usuarioId: alice.id, modelo: 'm', pregunta: null, respuesta: null } });
    await prisma.asistenteConsulta.create({ data: { usuarioId: bob.id, modelo: 'm', pregunta: 'de bob', respuesta: 'x' } });
    await prisma.asistenteConsulta.create({ data: { usuarioId: alice.id, modelo: 'm', pregunta: 'falló', error: 'Algo salió mal.' } });

    const { body } = await agent.get('/api/asistente/historial').expect(200);
    expect(body.hayMas).toBe(true);
    expect(body.consultas).toHaveLength(POR_PAGINA);
    expect(body.consultas.at(-1)).toMatchObject({ pregunta: 'falló', error: 'Algo salió mal.' });
    expect(body.consultas.map((c) => c.pregunta)).not.toContain('de bob');

    const antes = body.consultas[0].id;
    const { body: resto } = await agent.get(`/api/asistente/historial?antes=${antes}`).expect(200);
    expect(resto.hayMas).toBe(false);
    expect(resto.consultas.map((c) => c.pregunta)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    await agent.get('/api/asistente/historial?antes=abc').expect(400);
  });
});

describe('a los 90 días', () => {
  it('se borran las conversaciones y el texto de las consultas; los números quedan', async () => {
    const alice = await usuarioCon(ALICE, { permisos: ['pecuaria:VER'] });
    const viejo = new Date('2026-01-01T12:00:00Z');
    const nuevo = new Date('2026-05-01T12:00:00Z');
    const id1 = '11111111-1111-4111-8111-111111111111';
    const id2 = '22222222-2222-4222-8222-222222222222';
    await prisma.asistenteConversacion.create({ data: { id: id1, usuarioId: alice.id, mensajes: {}, creadaEn: viejo, actualizadaEn: viejo } });
    await prisma.asistenteConversacion.create({ data: { id: id2, usuarioId: alice.id, mensajes: {}, creadaEn: nuevo, actualizadaEn: nuevo } });
    await prisma.asistenteConsulta.create({ data: { conversacionId: id1, usuarioId: alice.id, modelo: 'm', pregunta: 'vieja', respuesta: 'r', tokensSalida: 7, creadaEn: viejo } });
    await prisma.asistenteConsulta.create({ data: { conversacionId: id2, usuarioId: alice.id, modelo: 'm', pregunta: 'nueva', respuesta: 'r', creadaEn: nuevo } });

    expect(await purgarAsistente(new Date('2026-06-01T12:00:00Z'))).toEqual({ conversaciones: 1, textos: 1 });
    expect((await prisma.asistenteConversacion.findMany()).map((c) => c.id)).toEqual([id2]);
    const consultas = await prisma.asistenteConsulta.findMany({ orderBy: { id: 'asc' } });
    expect(consultas[0]).toMatchObject({ pregunta: null, respuesta: null, tokensSalida: 7, conversacionId: null });
    expect(consultas[1]).toMatchObject({ pregunta: 'nueva', conversacionId: id2 });
  });
});
