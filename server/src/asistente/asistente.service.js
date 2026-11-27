// El asistente (docs/superpowers/specs/2026-11-27-asistente-design.md), fase 1:
// una pregunta → Claude pide herramientas → nuestro servidor las corre con los
// permisos de la persona → Claude contesta. La respuesta va llegando de a poco
// (`emitir`), y la conversación se guarda para la pregunta siguiente.
import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { aTexto } from './limpiar.js';
import { definiciones, herramienta, leerCatalogo, validarEntrada } from './herramientas.js';
import { armarInstrucciones, conFecha } from './instrucciones.js';

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

const preguntasDe = (guardada) => guardada.mensajes.mensajes.filter((m) => m.role === 'user' && typeof m.content === 'string').length;

// Un chat por persona (pedido de Diego, 27/11): en la pantalla se ve un solo
// historial. Por dentro, lo que Claude recuerda es la conversación de las
// últimas horas: después de HORAS_DE_CONTEXTO sin preguntar, o con
// MAX_PREGUNTAS, arranca otra (sin recortar la vieja: la API no deja editar
// el medio de una conversación con razonamiento guardado).
export const HORAS_DE_CONTEXTO = 12;

async function conversacionActual(usuarioId) {
  const desde = new Date(Date.now() - HORAS_DE_CONTEXTO * 60 * 60 * 1000);
  const guardada = await prisma.asistenteConversacion.findFirst({
    where: { usuarioId, actualizadaEn: { gte: desde } },
    orderBy: { actualizadaEn: 'desc' },
  });
  return guardada && preguntasDe(guardada) < MAX_PREGUNTAS ? guardada : null;
}

/**
 * Prepara la pregunta (todo lo que puede fallar antes de empezar a contestar).
 * Sin `conversacionId`, sigue la conversación actual de la persona.
 * @returns {Promise<{ conversacionId, sistema, mensajes, nueva }>}
 */
export async function preparar({ ctx, usuarioId, conversacionId }) {
  const guardada = conversacionId ? await cargarConversacion(conversacionId, usuarioId) : await conversacionActual(usuarioId);
  if (guardada) {
    if (preguntasDe(guardada) >= MAX_PREGUNTAS) throw new HttpError(400, 'Esta conversación ya es muy larga. Empezá una nueva.', 'CONVERSACION_LARGA');
    const { sistema, mensajes } = guardada.mensajes;
    return { conversacionId: guardada.id, sistema, mensajes, nueva: false };
  }
  const catalogo = await leerCatalogo(ctx);
  return { conversacionId: randomUUID(), sistema: armarInstrucciones(catalogo), mensajes: [], nueva: true, catalogo };
}

export const POR_PAGINA = 30;

// El historial de la persona: sus consultas, de la más vieja a la más nueva,
// de a POR_PAGINA (`antes`: el id de la más vieja que ya se ve). Las de más de
// 90 días ya no tienen texto y no se muestran.
export async function historial(usuarioId, { antes } = {}) {
  const filas = await prisma.asistenteConsulta.findMany({
    where: { usuarioId, pregunta: { not: null }, ...(antes && { id: { lt: antes } }) },
    orderBy: { id: 'desc' },
    take: POR_PAGINA + 1,
    select: { id: true, pregunta: true, respuesta: true, error: true, creadaEn: true },
  });
  return { consultas: filas.slice(0, POR_PAGINA).reverse(), hayMas: filas.length > POR_PAGINA };
}

/**
 * Contesta una pregunta. `emitir(evento)` recibe, en orden:
 *   { tipo: 'buscando', texto }   cuando usa una herramienta
 *   { tipo: 'texto', texto }      pedazos de la respuesta
 * Devuelve { respuesta, herramientas, idas, uso, error? } (no lanza por
 * errores de Claude: los devuelve en `error`, ya en palabras).
 */
export async function contestar({ cliente, ctx, preparada, pregunta, emitir, signal }) {
  const mensajes = [...preparada.mensajes, { role: 'user', content: conFecha(pregunta, hoyIso()) }];
  const tools = definiciones();
  const uso = { entrada: 0, salida: 0, cacheLeidos: 0, cacheEscritos: 0 };
  const usadas = [];
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
        const h = herramienta(pedido.name);
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
        emitir({ tipo: 'buscando', texto: h.aviso(entrada.data) });
        try {
          ctxH.catalogo = await catalogo();
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
    return { respuesta, herramientas: usadas, idas, uso, error: mensajeDeError(error), mensajes: preparada.mensajes };
  }

  // Si terminó en un pedido de herramientas sin respuesta (no debería: la
  // última vuelta no las ofrece), la conversación no se guarda así.
  const ultimo = mensajes.at(-1);
  const completa = ultimo.role === 'assistant';
  return { respuesta, herramientas: usadas, idas, uso, mensajes: completa ? mensajes : preparada.mensajes };
}

// Guarda la conversación y la fila de la consulta.
export async function guardar({ usuarioId, preparada, pregunta, resultado }) {
  const mensajes = { sistema: preparada.sistema, mensajes: resultado.mensajes };
  const ahora = new Date();
  if (resultado.mensajes.length > 0) {
    await prisma.asistenteConversacion.upsert({
      where: { id: preparada.conversacionId },
      create: { id: preparada.conversacionId, usuarioId, mensajes, creadaEn: ahora, actualizadaEn: ahora },
      update: { mensajes, actualizadaEn: ahora },
    });
  }
  const existe = resultado.mensajes.length > 0 || !preparada.nueva;
  await prisma.asistenteConsulta.create({
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
}

// A los 90 días: se borran las conversaciones y el texto de las consultas
// (quedan los números, para ver el costo). index.js lo corre cada hora.
export async function purgarAsistente(ahora = new Date()) {
  const limite = new Date(ahora.getTime() - DIAS_GUARDADO * 24 * 60 * 60 * 1000);
  const { count: conversaciones } = await prisma.asistenteConversacion.deleteMany({ where: { actualizadaEn: { lt: limite } } });
  const { count: textos } = await prisma.asistenteConsulta.updateMany({
    where: { creadaEn: { lt: limite }, OR: [{ pregunta: { not: null } }, { respuesta: { not: null } }] },
    data: { pregunta: null, respuesta: null },
  });
  return { conversaciones, textos };
}
