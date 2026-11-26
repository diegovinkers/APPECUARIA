// Alcance por estancia (paso 3 del rediseño, DECISIONES §11).
//
// El rol dice QUÉ puede hacer un usuario; esto dice DÓNDE: en las estancias
// que tiene asignadas, o en todas si tiene todasLasEstancias (el superadmin
// pasa siempre). Lo que está fuera de su alcance contesta 404, como si no
// existiera: así no se entera de qué hay en las otras estancias.
//
// Los middlewares averiguan la estancia de lo que llega (un campo, un potrero,
// un lote, un movimiento, una importación, o los ids del cuerpo) y la comparan.
import { prisma } from '../db.js';
import { notFound, parseId } from '../errors.js';
import { campoDeEvento } from './movimientos.service.js';
import { campoDeGrupo, campoDeRegistro } from './eventos.service.js';
import { campoDeProceso } from './procesos.service.js';
import { campoDeToro } from './toros.service.js';
import { campoDeLectura } from './pasto.service.js';

const NO_ENCONTRADO = 'No encontrado';

export const veTodas = (user) => Boolean(user?.esSuperadmin || user?.todasLasEstancias);

export const puedeCampo = (user, campoId) => veTodas(user) || user.campoIds.includes(campoId);

// El filtro para listar campos: undefined (todas) o { id: { in: [...] } }.
export const filtroCampos = (user) => (veTodas(user) ? undefined : { id: { in: user.campoIds } });

// Los dos grupos del selector de arriba (feedlots, 19/11): "Todas las
// estancias" son las estancias y las granjas; "Todos los feedlots", los
// confinamientos. Su análisis es distinto: no se suman entre sí.
export const TIPOS_GRUPO = { estancias: ['ESTANCIA', 'GRANJA'], feedlots: ['CONFINAMIENTO'] };

// filtroCampos más el tipo de campo del grupo.
export const filtroGrupo = (user, grupo = 'estancias') => ({ ...filtroCampos(user), tipo: { in: TIPOS_GRUPO[grupo] } });

function exigir(user, campoId) {
  if (campoId == null || !puedeCampo(user, campoId)) throw notFound(NO_ENCONTRADO);
}

// Exige "todas las estancias": crear una estancia nueva (o importar una
// planilla de una estancia que todavía no existe) es de alcance general.
export function exigirTodas(user) {
  if (!veTodas(user)) throw notFound(NO_ENCONTRADO);
}

const campoDe = {
  campo: async (id) => (await prisma.campo.findUnique({ where: { id }, select: { id: true } }))?.id,
  potrero: async (id) => (await prisma.potrero.findUnique({ where: { id }, select: { campoId: true } }))?.campoId,
  lote: async (id) => (await prisma.lote.findUnique({ where: { id }, select: { campoId: true } }))?.campoId,
  movimiento: async (id) => (await prisma.movimiento.findUnique({ where: { id }, select: { campoId: true } }))?.campoId,
  proceso: (id) => campoDeProceso(id),
  toro: (id) => campoDeToro(id),
  lecturaPasto: async (id) => (await campoDeLectura(id)) ?? undefined,
};

// Una id que no es un número o no existe sigue de largo: el controlador ya
// contesta con su propio 400 o 404 (los tests de antes lo esperan así).
// Si existe y es de otra estancia, 404.
async function controlar(user, tipo, valor) {
  const id = parseId(valor);
  if (!id) return;
  const campoId = await campoDe[tipo](id);
  if (campoId === undefined) return;
  exigir(user, campoId);
}

// Por un parámetro de la ruta: alcance('campo', 'campoId'), alcance('potrero', 'id')...
export function alcance(tipo, parametro = 'id') {
  return async (req, res, next) => {
    if (!veTodas(req.user)) await controlar(req.user, tipo, req.params[parametro]);
    next();
  };
}

// Mover: el lote de origen, el potrero de destino y el lote de destino.
export async function alcanceMovimiento(req, res, next) {
  if (!veTodas(req.user)) {
    const b = req.body;
    await controlar(req.user, 'lote', b.loteOrigenId);
    await controlar(req.user, 'potrero', b.destinoPotreroId);
    await controlar(req.user, 'lote', b.loteDestinoId);
    // Destete: el lote de las madres.
    await controlar(req.user, 'lote', b.loteMadresId);
  }
  next();
}

// Mover entre campos: solo el lote de origen. El destino puede ser cualquier
// estancia (lo registra quien manda los animales; DECISIONES §11).
export async function alcanceEntreCampos(req, res, next) {
  if (!veTodas(req.user)) await controlar(req.user, 'lote', req.body.loteOrigenId);
  next();
}

// Los destinos posibles: desde un campo de origen que sea del usuario.
export async function alcanceOrigenQuery(req, res, next) {
  if (!veTodas(req.user)) await controlar(req.user, 'campo', req.query.origen);
  next();
}

// Movimiento múltiple: todos los lotes y potreros de todos los pasos.
export async function alcanceMultiple(req, res, next) {
  if (!veTodas(req.user)) {
    for (const paso of req.body.pasos ?? []) {
      await controlar(req.user, 'lote', paso.loteOrigenId);
      await controlar(req.user, 'potrero', paso.destinoPotreroId);
      await controlar(req.user, 'lote', paso.loteDestinoId);
    }
  }
  next();
}

// Revertir un evento: el de la estancia de origen.
export async function alcanceEvento(req, res, next) {
  if (!veTodas(req.user)) {
    const campoId = await campoDeEvento(req.params.id);
    if (campoId != null && !puedeCampo(req.user, campoId)) throw notFound(NO_ENCONTRADO);
  }
  next();
}

// Eventos (pesada, vacuna...): la estancia, los potreros y los lotes elegidos.
export async function alcanceRegistroEvento(req, res, next) {
  if (!veTodas(req.user)) {
    const b = req.body;
    await controlar(req.user, 'campo', b.campoId);
    for (const id of b.potreroIds ?? []) await controlar(req.user, 'potrero', id);
    for (const linea of b.lineas ?? []) await controlar(req.user, 'lote', linea.loteId);
  }
  next();
}

// Empezar un proceso: la estancia y los lotes (del servicio o, si está en curso, los de enCurso).
export async function alcanceProceso(req, res, next) {
  if (!veTodas(req.user)) {
    const b = req.body;
    await controlar(req.user, 'campo', b.campoId);
    for (const linea of b.lineas ?? []) await controlar(req.user, 'lote', linea.loteId);
    for (const l of b.enCurso?.lotes ?? []) await controlar(req.user, 'lote', l.loteId);
  }
  next();
}

// Anular un evento (o una carga entera): el de su estancia.
export async function alcanceAnularEvento(req, res, next) {
  if (!veTodas(req.user)) {
    const campoId = req.params.grupoId ? await campoDeGrupo(req.params.grupoId) : await campoDeRegistro(req.params.id);
    if (campoId != null && !puedeCampo(req.user, campoId)) throw notFound(NO_ENCONTRADO);
  }
  next();
}

// Entradas y salidas: el lote, el potrero, el lote de las madres y los lotes
// de cada línea. El "otro campo" (de dónde vienen o adónde van) es solo una
// referencia: no se toca, así que no se controla.
export async function alcanceEntradaSalida(req, res, next) {
  if (!veTodas(req.user)) {
    const b = req.body;
    await controlar(req.user, 'lote', b.loteId);
    await controlar(req.user, 'potrero', b.potreroId);
    await controlar(req.user, 'lote', b.loteMadresId);
    for (const linea of b.lineas ?? []) await controlar(req.user, 'lote', linea.loteId);
  }
  next();
}

// Importar: la estancia va por sigla (?campo=EG al subir; en la importación
// guardada, dentro de sus datos). Si todavía no existe, la importación la
// crearía: eso pide "todas las estancias".
async function exigirSigla(user, sigla) {
  if (veTodas(user)) return;
  const campo = await prisma.campo.findUnique({ where: { sigla }, select: { id: true } });
  if (!campo) throw notFound(NO_ENCONTRADO);
  exigir(user, campo.id);
}

export async function alcanceSubirPlanilla(req, res, next) {
  await exigirSigla(req.user, String(req.query.campo || 'EG').slice(0, 10));
  next();
}

export async function alcanceImportacion(req, res, next) {
  if (!veTodas(req.user)) {
    const id = parseId(req.params.id);
    const imp = id && (await prisma.importacion.findUnique({ where: { id }, select: { datos: true } }));
    if (imp) await exigirSigla(req.user, imp.datos?.campo?.sigla ?? '');
  }
  next();
}

// Middleware: solo quien ve todas las estancias (crear una estancia nueva).
export function soloTodas(req, res, next) {
  exigirTodas(req.user);
  next();
}

// Pasto: una recorrida, cada potrero.
export async function alcanceRecorridaPasto(req, res, next) {
  if (!veTodas(req.user)) {
    for (const l of req.body.lecturas ?? []) await controlar(req.user, 'potrero', l.potreroId);
  }
  next();
}
