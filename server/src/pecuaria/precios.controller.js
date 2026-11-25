// Rutas de precios de mercado (docs/PRECIOS_INAC.md), bajo /api/pecuaria/precios.
import { createHash, timingSafeEqual } from 'node:crypto';
import { PRECIOS } from '../config.js';
import { badRequest, notFound, parseId, unauthorized } from '../errors.js';
import * as precios from './precios.service.js';
import { historialQuerySchema } from './precios.schema.js';

const huella = (texto) => createHash('sha256').update(texto).digest();

// POST /precios/actualizar con "Authorization: Bearer <PRECIOS_TOKEN>" (GitHub
// Actions). Sin ese encabezado sigue de largo a la ruta con sesión. Con un
// token que no es, 401. No sirve para nada más que disparar la importación.
export function conToken(req, res, next) {
  const auth = req.get('authorization');
  if (!auth) return next('route');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!PRECIOS.token || !token || !timingSafeEqual(huella(token), huella(PRECIOS.token))) {
    throw unauthorized('Token inválido');
  }
  next();
}
// Para el test que exige que cada ruta declare qué pide.
conToken.permiso = 'token PRECIOS_TOKEN';

export async function postActualizarProgramado(req, res) {
  res.json(await precios.actualizarPrecios(req, { disparadoPor: 'PROGRAMADO' }));
}

export async function postActualizar(req, res) {
  res.json(await precios.actualizarPrecios(req, { disparadoPor: 'BOTON' }));
}

export async function getUltimos(req, res) {
  const actualizando = await precios.actualizarAlAbrir(req);
  res.json({ ...(await precios.ultimos()), actualizando });
}

export async function getHistorial(req, res) {
  const filtros = historialQuerySchema.safeParse(req.query);
  if (!filtros.success) throw badRequest(filtros.error.issues[0].message);
  res.json(await precios.historial(filtros.data));
}

export async function getImportaciones(req, res) {
  res.json(await precios.importaciones());
}

const id = (req) => {
  const valor = parseId(req.params.id);
  if (!valor) throw notFound('No encontrado');
  return valor;
};

export async function postAprobar(req, res) {
  res.json(await precios.aprobar(req, id(req)));
}

export async function patchPrecio(req, res) {
  res.json(await precios.corregir(req, id(req), req.body));
}

export async function postPrecio(req, res) {
  res.status(201).json(await precios.cargarManual(req, req.body));
}
