// Rutas del asistente (docs/superpowers/specs/2026-11-27-asistente-design.md).
//   GET  /api/asistente/estado     → { configurado, modelo }
//   GET  /api/asistente/historial  → { consultas, hayMas } (?antes=<id> para ver más atrás)
//   POST /api/asistente            → la respuesta, de a poco (NDJSON: un JSON por renglón)
// Un chat por persona (27/11): sin conversacionId, sigue el suyo.
// Fase 1: solo consulta, así que pide pecuaria:VER. Las herramientas, además,
// pasan por las rutas de siempre con la cookie de la persona (llamar.js).
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authRequired } from '../auth/auth.middleware.js';
import { requirePermission } from '../auth/permisos.js';
import { validateBody } from '../middlewares/validate.js';
import { HttpError, parseId } from '../errors.js';
import { contestar, dependencias, estaConfigurado, guardar, historial, modelo, preparar } from './asistente.service.js';

const router = Router();
const ver = requirePermission('pecuaria', 'VER');

export const preguntaSchema = z.object({
  conversacionId: z.uuid({ error: 'La conversación no es válida' }).optional(),
  pregunta: z
    .string({ error: 'Escribí una pregunta' })
    .trim()
    .min(1, 'Escribí una pregunta')
    .max(2000, 'La pregunta es muy larga (hasta 2000 letras)'),
});

// Cada pregunta cuesta: como mucho 40 cada 10 minutos por persona.
const limitePreguntas = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  keyGenerator: (req) => `usuario-${req.user.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ errors: ['Hiciste muchas preguntas seguidas. Esperá unos minutos.'], code: 'DEMASIADAS_PREGUNTAS' }),
});

router.get('/estado', authRequired, ver, (req, res) => {
  res.json({ configurado: estaConfigurado(), modelo: modelo() });
});

router.get('/historial', authRequired, ver, async (req, res) => {
  const antes = req.query.antes ? parseId(req.query.antes) : null;
  if (req.query.antes && !antes) throw new HttpError(400, 'El parámetro antes no es válido');
  res.json(await historial(req.user.id, { antes }));
});

router.post('/', authRequired, ver, limitePreguntas, validateBody(preguntaSchema), async (req, res) => {
  const cliente = dependencias.crearCliente();
  if (!cliente) throw new HttpError(503, 'El asistente no está configurado todavía.', 'SIN_CLAVE');

  const usuarioId = req.user.id;
  const ctx = { app: req.app, cookie: req.headers.cookie };
  const { pregunta } = req.body;
  // Lo que puede fallar con un error común (conversación vieja, catálogo),
  // antes de empezar a mandar la respuesta.
  const preparada = await preparar({ ctx, usuarioId, conversacionId: req.body.conversacionId });

  // Si la persona cierra la pantalla, se corta la pregunta a Claude.
  const corte = new AbortController();
  let terminado = false;
  res.on('close', () => {
    if (!terminado) corte.abort();
  });

  res.status(200);
  res.set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const emitir = (evento) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(evento)}\n`);
  };
  emitir({ tipo: 'conversacion', id: preparada.conversacionId });

  const resultado = await contestar({ cliente, ctx, preparada, pregunta, emitir, signal: corte.signal });
  terminado = true;
  try {
    await guardar({ usuarioId, preparada, pregunta, resultado });
  } catch (error) {
    console.error('Asistente: no se pudo guardar la consulta:', error.message);
  }
  emitir(resultado.error ? { tipo: 'error', mensaje: resultado.error } : { tipo: 'fin' });
  res.end();
});

export default router;
