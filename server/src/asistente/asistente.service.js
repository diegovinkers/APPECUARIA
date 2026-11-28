// El asistente (docs/superpowers/specs/2026-11-27-asistente-design.md):
// una pregunta → Claude pide herramientas → nuestro servidor las corre con los
// permisos de la persona → Claude contesta. La respuesta va llegando de a poco
// (`emitir`), y la conversación se guarda para la pregunta siguiente.
// Fase 2 (docs/superpowers/plans/2026-11-27-asistente-fase2.md): las
// herramientas proponer_* arman una propuesta (vista previa, sin registrar);
// la persona la confirma o la cancela (confirmarPropuesta, cancelarPropuesta).
import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { aTexto } from './limpiar.js';
import { definiciones, herramienta, leerCatalogo, validarEntrada } from './herramientas.js';
import { ACCIONES, accion, proponer } from './acciones.js';
import { llamarApi } from './llamar.js';
import { armarInstrucciones, conFecha, versionPara } from './instrucciones.js';

// Haiku 5.5 para empezar (decisión de Diego, 27/11): el más barato. Se cambia
// con ASISTENTE_MODELO sin tocar el código (por ejemplo claude-sonnet-5-5).
export const MODELO_POR_DEFECTO = 'claude-haiku-5-5';
export const modelo = (env = process.env) => env.ASISTENTE_MODELO?.trim() || MODELO_POR_DEFECTO;

// Cuántas veces se le puede pedir algo a Claude para una pregunta. En la
// última no se le ofrecen herramientas: tiene que contestar con lo que tiene.
export const MAX_IDAS = 8;
// Una conversación larga cuesta más en cada pregunta: pasado esto, otra nueva.
export const MAX_PREGUNTAS = 30;
export const DIAS_GUARDADO = 90;
// Hasta cuántas propuestas por respuesta, y cuánto vale cada una sin confirmar.
export const MAX_PROPUESTAS = 3;
export const MINUTOS_PARA_CONFIRMAR = 60;

// El cliente de Anthropic, o null si no hay clave. Los tests lo reemplazan.
export const dependencias = {
  crearCliente(env = process.env) {
    const clave = env.ANTHROPIC_API_KEY?.trim();
    return clave ? new Anthropic({ apiKey: clave, timeout: 90_000, maxRetries: 2 }) : null;
  },
};

export const estaConfigurado = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

const hoyIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo' }).format(new Date());

// Un error de Claude, en palabras para la persona.
export function mensajeDeError(error) {
  if (error?.name === 'AbortError' || error instanceof Anthropic.APIUserAbortError) return 'Se cortó la pregunta.';
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return 'El asistente no está bien configurado (la clave de Anthropic no sirve). Avisale a quien administra la app.';
  }
  if (error instanceof Anthropic.RateLimitError) return 'Claude está recibiendo muchas preguntas. Probá de nuevo en un minuto.';
  if (error instanceof Anthropic.BadRequestError && /credit balance/i.test(error.message)) {
    return 'Se terminó el saldo de Anthropic. Avisale a quien administra la app.';
  }
  if (error instanceof Anthropic.InternalServerError || (error instanceof Anthropic.APIError && error.status >= 500)) {
    return 'Claude no está respondiendo ahora. Probá de nuevo en un rato.';
  }
  if (error instanceof Anthropic.APIConnectionError) return 'No se pudo hablar con Claude (conexión). Probá de nuevo.';
  return 'Algo salió mal al contestar. Probá de nuevo.';
}

async function cargarConversacion(conversacionId, usuarioId) {
  if (!conversacionId) return null;
  const c = await prisma.asistenteConversacion.findFirst({ where: { id: conversacionId, usuarioId } });
  if (!c) throw notFound('Esa conversación ya no existe. Empezá una nueva.');
  return c;
}

// Una conversación sirve si se armó con las mismas instrucciones y los mismos
// permisos (instrucciones.js, versionPara).
const sirve = (guardada, puedeRegistrar) => guardada.mensajes.version === versionPara(puedeRegistrar);

const preguntasDe = (guardada) => guardada.mensajes.mensajes.filter((m) => m.role === 'user' && typeof m.content === 'string').length;

// Un chat por persona (pedido de Diego, 27/11): en la pantalla se ve un solo
// historial. Por dentro, lo que Claude recuerda es la conversación de las
// últimas horas: después de HORAS_DE_CONTEXTO sin preguntar, o con
// MAX_PREGUNTAS, arranca otra (sin recortar la vieja: la API no deja editar
// el medio de una conversación con razonamiento guardado).
export const HORAS_DE_CONTEXTO = 12;

async function conversacionActual(usuarioId, puedeRegistrar) {
  const desde = new Date(Date.now() - HORAS_DE_CONTEXTO * 60 * 60 * 1000);
  const guardada = await prisma.asistenteConversacion.findFirst({
    where: { usuarioId, actualizadaEn: { gte: desde } },
    orderBy: { actualizadaEn: 'desc' },
  });
  return guardada && sirve(guardada, puedeRegistrar) && preguntasDe(guardada) < MAX_PREGUNTAS ? guardada : null;
}

// --- Propuestas (fase 2) ---

const vencida = (p, ahora = new Date()) => p.estado === 'PENDIENTE' && ahora - p.creadaEn > MINUTOS_PARA_CONFIRMAR * 60 * 1000;

// Las pendientes que pasaron la hora quedan VENCIDA.
async function vencerViejas(where) {
  const limite = new Date(Date.now() - MINUTOS_PARA_CONFIRMAR * 60 * 1000);
  await prisma.asistentePropuesta.updateMany({
    where: { ...where, estado: 'PENDIENTE', creadaEn: { lt: limite } },
    data: { estado: 'VENCIDA', decididaEn: new Date() },
  });
}

// Lo que ve la pantalla de una propuesta.
export function propuestaPublica(p) {
  return {
    id: p.id,
    herramienta: p.herramienta,
    tarjeta: p.tarjeta,
    estado: vencida(p) ? 'VENCIDA' : p.estado,
    error: p.error ?? null,
    resultado: p.resultado ?? null,
    creadaEn: p.creadaEn,
    venceEn: new Date(p.creadaEn.getTime() + MINUTOS_PARA_CONFIRMAR * 60 * 1000),
  };
}

const COMO_TERMINO = {
  CONFIRMADA: 'la confirmó y quedó registrada',
  CANCELADA: 'la canceló',
  VENCIDA: 'no la confirmó y venció',
  ERROR: 'la confirmó pero la app dio un error',
};

// Lo que Claude tiene que saber de las propuestas de esta conversación que
// terminaron desde la última pregunta: { texto, ids } o null.
async function novedadesDePropuestas(conversacionId) {
  await vencerViejas({ conversacionId });
  const terminadas = await prisma.asistentePropuesta.findMany({
    where: { conversacionId, avisada: false, estado: { in: ['CONFIRMADA', 'CANCELADA', 'VENCIDA', 'ERROR'] } },
    orderBy: { id: 'asc' },
  });
  if (terminadas.length === 0) return null;
  const partes = terminadas.map(
    (p) => `la propuesta #${p.id} (${p.tarjeta?.titulo ?? p.herramienta}): ${COMO_TERMINO[p.estado]}${p.estado === 'ERROR' && p.error ? ` ("${p.error}")` : ''}`,
  );
  return { texto: `Desde la última pregunta: ${partes.join('; ')}.`, ids: terminadas.map((p) => p.id) };
}

/**
 * Prepara la pregunta (todo lo que puede fallar antes de empezar a contestar).
 * Sin `conversacionId`, sigue la conversación actual de la persona.
 * @returns {Promise<{ conversacionId, sistema, mensajes, nueva }>}
 */
export async function preparar({ ctx, usuarioId, conversacionId, puedeRegistrar = false }) {
  let guardada = conversacionId ? await cargarConversacion(conversacionId, usuarioId) : await conversacionActual(usuarioId, puedeRegistrar);
  // Con otras instrucciones u otros permisos, arranca otra (en la pantalla se
  // sigue viendo un solo chat).
  if (guardada && !sirve(guardada, puedeRegistrar)) guardada = null;
  if (guardada) {
    if (preguntasDe(guardada) >= MAX_PREGUNTAS) throw new HttpError(400, 'Esta conversación ya es muy larga. Empezá una nueva.', 'CONVERSACION_LARGA');
    const { sistema, mensajes } = guardada.mensajes;
    const novedades = puedeRegistrar ? await novedadesDePropuestas(guardada.id) : null;
    return { conversacionId: guardada.id, sistema, mensajes, nueva: false, puedeRegistrar, novedades };
  }
  const catalogo = await leerCatalogo(ctx);
  return {
    conversacionId: randomUUID(),
    sistema: armarInstrucciones(catalogo, { puedeRegistrar }),
    mensajes: [],
    nueva: true,
    catalogo,
    puedeRegistrar,
    novedades: null,
  };
}

export const POR_PAGINA = 30;

// El historial de la persona: sus consultas, de la más vieja a la más nueva,
// de a POR_PAGINA (`antes`: el id de la más vieja que ya se ve). Las de más de
// 90 días ya no tienen texto y no se muestran.
export async function historial(usuarioId, { antes } = {}) {
  await vencerViejas({ usuarioId });
  const filas = await prisma.asistenteConsulta.findMany({
    where: { usuarioId, pregunta: { not: null }, ...(antes && { id: { lt: antes } }) },
    orderBy: { id: 'desc' },
    take: POR_PAGINA + 1,
    select: { id: true, pregunta: true, respuesta: true, error: true, creadaEn: true, propuestas: { orderBy: { id: 'asc' } } },
  });
  const consultas = filas
    .slice(0, POR_PAGINA)
    .reverse()
    .map(({ propuestas, ...c }) => ({ ...c, propuestas: propuestas.map(propuestaPublica) }));
  return { consultas, hayMas: filas.length > POR_PAGINA };
}

/**
 * Contesta una pregunta. `emitir(evento)` recibe, en orden:
 *   { tipo: 'buscando', texto }   cuando usa una herramienta
 *   { tipo: 'texto', texto }      pedazos de la respuesta
 *   { tipo: 'propuesta', propuesta }  una propuesta para confirmar (fase 2)
 * Devuelve { respuesta, herramientas, idas, uso, propuestas, error? } (no lanza
 * por errores de Claude: los devuelve en `error`, ya en palabras).
 * ctx: { app, cookie, ip, usuarioId }.
 */
export async function contestar({ cliente, ctx, preparada, pregunta, emitir, signal }) {
  const hoy = hoyIso();
  const mensajes = [...preparada.mensajes, { role: 'user', content: conFecha(pregunta, hoy, preparada.novedades?.texto) }];
  const tools = [...definiciones(), ...(preparada.puedeRegistrar ? definicionesAcciones() : [])];
  const uso = { entrada: 0, salida: 0, cacheLeidos: 0, cacheEscritos: 0 };
  const usadas = [];
  const propuestas = [];
  let respuesta = '';
  let idas = 0;
  let reintentosJson = 0;

  // El catálogo hace falta para las herramientas (lo trae preparar() si la
  // conversación es nueva; si no, se lee la primera vez que se usa).
  const ctxH = { ...ctx, catalogo: preparada.catalogo ?? null };
  const catalogo = async () => (ctxH.catalogo ??= await leerCatalogo(ctx));

  try {
    while (idas < MAX_IDAS) {
      idas += 1;
      const ultima = idas === MAX_IDAS;
      const stream = cliente.messages.stream(
        {
          model: modelo(),
          max_tokens: 16000,
          system: preparada.sistema,
          tools,
          ...(ultima && { tool_choice: { type: 'none' } }),
          messages: mensajes,
          output_config: { effort: 'low' },
          cache_control: { type: 'ephemeral' },
        },
        { signal },
      );
      let primerTexto = true;
      stream.on('text', (delta) => {
        // Entre una vuelta y otra, un renglón en blanco.
        if (primerTexto && respuesta) {
          respuesta += '\n\n';
          emitir({ tipo: 'texto', texto: '\n\n' });
        }
        primerTexto = false;
        respuesta += delta;
        emitir({ tipo: 'texto', texto: delta });
      });

      let mensaje;
      try {
        mensaje = await stream.finalMessage();
        reintentosJson = 0;
      } catch (error) {
        // Una entrada de herramienta que no se pudo leer, o la conexión que se
        // cortó en el medio: se repite la vuelta (2 veces como mucho).
        if (error instanceof Anthropic.APIError || signal?.aborted || reintentosJson++ >= 2) throw error;
        idas -= 1;
        continue;
      }

      uso.entrada += mensaje.usage?.input_tokens ?? 0;
      uso.salida += mensaje.usage?.output_tokens ?? 0;
      uso.cacheLeidos += mensaje.usage?.cache_read_input_tokens ?? 0;
      uso.cacheEscritos += mensaje.usage?.cache_creation_input_tokens ?? 0;

      if (mensaje.stop_reason === 'refusal') {
        const aviso = 'No puedo ayudar con eso.';
        respuesta += (respuesta ? '\n\n' : '') + aviso;
        emitir({ tipo: 'texto', texto: (respuesta === aviso ? '' : '\n\n') + aviso });
        // La conversación no se guarda con una respuesta rechazada a medias.
        return { respuesta, herramientas: usadas, idas, uso, mensajes: preparada.mensajes };
      }

      mensajes.push({ role: 'assistant', content: mensaje.content });
      const pedidos = mensaje.content.filter((b) => b.type === 'tool_use');
      if (pedidos.length === 0) break;
      if (mensaje.stop_reason === 'max_tokens') throw new Error('La respuesta quedó cortada.');

      const resultados = [];
      for (const pedido of pedidos) {
        const a = preparada.puedeRegistrar ? accion(pedido.name) : null;
        const h = a ?? herramienta(pedido.name);
        usadas.push(pedido.name);
        if (!h) {
          resultados.push({ type: 'tool_result', tool_use_id: pedido.id, is_error: true, content: `No existe la herramienta ${pedido.name}.` });
          continue;
        }
        const entrada = validarEntrada(h, pedido.input);
        if (!entrada.success) {
          resultados.push({
            type: 'tool_result',
            tool_use_id: pedido.id,
            is_error: true,
            content: `Los datos no son válidos: ${entrada.error.issues.map((i) => `${i.path.join('.') || 'entrada'}: ${i.message}`).join('; ')}`,
          });
          continue;
        }
        if (a && propuestas.length >= MAX_PROPUESTAS) {
          resultados.push({
            type: 'tool_result',
            tool_use_id: pedido.id,
            is_error: true,
            content: `Ya armaste ${MAX_PROPUESTAS} propuestas en esta respuesta: pedile a la persona que confirme esas y que te pida el resto después.`,
          });
          continue;
        }
        emitir({ tipo: 'buscando', texto: h.aviso(entrada.data) });
        try {
          ctxH.catalogo = await catalogo();
          if (a) {
            const p = await guardarPropuesta({ ctx: ctxH, accion: a, entrada: entrada.data, hoy });
            propuestas.push(p.id);
            emitir({ tipo: 'propuesta', propuesta: propuestaPublica(p) });
            resultados.push({ type: 'tool_result', tool_use_id: pedido.id, content: aTexto(paraClaude(p)) });
            continue;
          }
          const datos = await h.ejecutar(ctxH, entrada.data);
          resultados.push({ type: 'tool_result', tool_use_id: pedido.id, content: aTexto(datos) });
        } catch (error) {
          resultados.push({ type: 'tool_result', tool_use_id: pedido.id, is_error: true, content: error.message || 'No se pudo leer.' });
        }
      }
      mensajes.push({ role: 'user', content: resultados });
    }
  } catch (error) {
    if (!(error instanceof Anthropic.APIError) && !(error instanceof Anthropic.APIUserAbortError) && error?.name !== 'AbortError') {
      console.error('Asistente:', error);
    }
    return { respuesta, herramientas: usadas, idas, uso, propuestas, error: mensajeDeError(error), mensajes: preparada.mensajes };
  }

  // Si terminó en un pedido de herramientas sin respuesta (no debería: la
  // última vuelta no las ofrece), la conversación no se guarda así.
  const ultimo = mensajes.at(-1);
  const completa = ultimo.role === 'assistant';
  return { respuesta, herramientas: usadas, idas, uso, propuestas, mensajes: completa ? mensajes : preparada.mensajes };
}

// Las definiciones de las acciones para la API de Anthropic (como las de herramientas.js).
function definicionesAcciones() {
  return ACCIONES.map((a) => {
    const { $schema, ...esquema } = z.toJSONSchema(a.entrada);
    return { name: a.nombre, description: a.descripcion, input_schema: esquema, eager_input_streaming: true };
  });
}

// Arma la propuesta (vista previa, sin registrar) y la guarda PENDIENTE. La
// conversación y la consulta se le ponen al guardar la pregunta (guardar()):
// en una conversación nueva, todavía no existen.
async function guardarPropuesta({ ctx, accion: a, entrada, hoy }) {
  const { ruta, cuerpo, tarjeta } = await proponer(ctx, a, entrada, { hoy });
  try {
    return await prisma.asistentePropuesta.create({ data: { usuarioId: ctx.usuarioId, herramienta: a.nombre, ruta, cuerpo, tarjeta } });
  } catch (error) {
    // A Claude no le llega el detalle de la base.
    console.error('Asistente: no se pudo guardar la propuesta:', error.message);
    throw new Error('No se pudo guardar la propuesta (error de la app). Probá de nuevo.');
  }
}

// Lo que se le devuelve a Claude: que NO se registró, y lo que ve la persona.
const paraClaude = (p) => ({
  propuesta: p.id,
  estado: 'Lista para que la persona la confirme. Todavía NO se registró nada.',
  titulo: p.tarjeta.titulo,
  renglones: p.tarjeta.renglones,
  avisos: p.tarjeta.avisos,
});

const NO_SE_PUEDE = {
  CONFIRMANDO: 'Esta propuesta se está registrando.',
  CONFIRMADA: 'Esta propuesta ya se confirmó.',
  CANCELADA: 'Esta propuesta se canceló. Pedila de nuevo si la querés.',
  VENCIDA: 'Esta propuesta venció (pasó más de una hora). Pedila de nuevo.',
  ERROR: 'Esta propuesta dio un error. Pedila de nuevo.',
};

async function propuestaDe(usuarioId, id) {
  const p = await prisma.asistentePropuesta.findFirst({ where: { id, usuarioId } });
  if (!p) throw notFound('Esa propuesta no existe.');
  return p;
}

// Por qué no se puede confirmar ni cancelar (ya no está PENDIENTE).
async function noSePuede(usuarioId, id) {
  const p = await propuestaDe(usuarioId, id);
  const estado = vencida(p) ? 'VENCIDA' : p.estado;
  if (estado === 'VENCIDA') await vencerViejas({ id });
  return new HttpError(409, NO_SE_PUEDE[estado] ?? 'Esta propuesta ya no se puede usar.', `PROPUESTA_${estado}`);
}

// Los ids de lo que se registró (para el enlace y para Claude).
function resumenResultado(datos) {
  if (!datos || typeof datos !== 'object') return null;
  const r = {
    movimientoId: datos.movimiento?.id,
    eventoId: datos.evento?.id,
    grupoId: datos.grupoId,
    movimientoIds: Array.isArray(datos.movimientos) ? datos.movimientos.map((m) => m.id).filter(Boolean) : undefined,
  };
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined && v !== null));
}

/**
 * La persona tocó Confirmar: se registra con la ruta de siempre (la misma de
 * las pantallas), con su cookie y la marca X-Origen: asistente. Una sola vez:
 * la propuesta pasa de PENDIENTE a CONFIRMANDO antes de llamar.
 * ctx: { app, cookie, ip }. Devuelve la propuesta (CONFIRMADA o ERROR).
 */
export async function confirmarPropuesta({ ctx, usuarioId, id }) {
  const p = await propuestaDe(usuarioId, id);
  if (vencida(p)) throw await noSePuede(usuarioId, id);
  const { count } = await prisma.asistentePropuesta.updateMany({ where: { id, usuarioId, estado: 'PENDIENTE' }, data: { estado: 'CONFIRMANDO' } });
  if (count === 0) throw await noSePuede(usuarioId, id);

  let estado;
  let datos;
  try {
    ({ estado, datos } = await llamarApi(ctx, {
      ruta: p.ruta,
      metodo: 'POST',
      cuerpo: p.cuerpo,
      cabeceras: { 'x-origen': 'asistente', 'x-asistente-propuesta': String(p.id) },
    }));
  } catch (error) {
    // No se sabe si llegó a registrarse (por ejemplo, se cortó la conexión).
    console.error('Asistente: no se pudo confirmar la propuesta', p.id, error.message);
    return propuestaPublica(
      await prisma.asistentePropuesta.update({
        where: { id },
        data: { estado: 'ERROR', error: 'No se pudo saber si se registró: revisá el Historial antes de volver a pedirlo.', decididaEn: new Date() },
      }),
    );
  }
  const ok = estado < 400;
  return propuestaPublica(
    await prisma.asistentePropuesta.update({
      where: { id },
      data: ok
        ? { estado: 'CONFIRMADA', resultado: resumenResultado(datos), decididaEn: new Date() }
        : { estado: 'ERROR', error: String(datos?.errors?.[0] ?? `La app contestó ${estado}`).slice(0, 500), decididaEn: new Date() },
    }),
  );
}

export async function cancelarPropuesta({ usuarioId, id }) {
  const p = await propuestaDe(usuarioId, id);
  if (vencida(p)) throw await noSePuede(usuarioId, id);
  const { count } = await prisma.asistentePropuesta.updateMany({
    where: { id, usuarioId, estado: 'PENDIENTE' },
    data: { estado: 'CANCELADA', decididaEn: new Date() },
  });
  if (count === 0) throw await noSePuede(usuarioId, id);
  return propuestaPublica(await propuestaDe(usuarioId, id));
}

// Guarda la conversación y la fila de la consulta.
export async function guardar({ usuarioId, preparada, pregunta, resultado }) {
  const mensajes = { sistema: preparada.sistema, mensajes: resultado.mensajes, version: versionPara(preparada.puedeRegistrar) };
  const ahora = new Date();
  if (resultado.mensajes.length > 0) {
    await prisma.asistenteConversacion.upsert({
      where: { id: preparada.conversacionId },
      create: { id: preparada.conversacionId, usuarioId, mensajes, creadaEn: ahora, actualizadaEn: ahora },
      update: { mensajes, actualizadaEn: ahora },
    });
  }
  const existe = resultado.mensajes.length > 0 || !preparada.nueva;
  const consulta = await prisma.asistenteConsulta.create({
    data: {
      conversacionId: existe ? preparada.conversacionId : null,
      usuarioId,
      modelo: modelo(),
      pregunta,
      respuesta: resultado.respuesta || null,
      herramientas: resultado.herramientas,
      idas: resultado.idas,
      tokensEntrada: resultado.uso.entrada,
      tokensSalida: resultado.uso.salida,
      tokensCacheLeidos: resultado.uso.cacheLeidos,
      tokensCacheEscritos: resultado.uso.cacheEscritos,
      error: resultado.error?.slice(0, 255) ?? null,
    },
  });
  if (resultado.propuestas?.length) {
    await prisma.asistentePropuesta.updateMany({
      where: { id: { in: resultado.propuestas } },
      data: { consultaId: consulta.id, ...(existe && { conversacionId: preparada.conversacionId }) },
    });
  }
  // Claude ya se enteró de cómo terminaron (si la conversación se guardó con esa pregunta).
  if (preparada.novedades && resultado.mensajes !== preparada.mensajes) {
    await prisma.asistentePropuesta.updateMany({ where: { id: { in: preparada.novedades.ids } }, data: { avisada: true } });
  }
}

// A los 90 días: se borran las conversaciones y el texto de las consultas
// (quedan los números, para ver el costo). index.js lo corre cada hora.
export async function purgarAsistente(ahora = new Date()) {
  const limite = new Date(ahora.getTime() - DIAS_GUARDADO * 24 * 60 * 60 * 1000);
  const { count: conversaciones } = await prisma.asistenteConversacion.deleteMany({ where: { actualizadaEn: { lt: limite } } });
  await prisma.asistentePropuesta.deleteMany({ where: { creadaEn: { lt: limite } } });
  const { count: textos } = await prisma.asistenteConsulta.updateMany({
    where: { creadaEn: { lt: limite }, OR: [{ pregunta: { not: null } }, { respuesta: { not: null } }] },
    data: { pregunta: null, respuesta: null },
  });
  return { conversaciones, textos };
}
