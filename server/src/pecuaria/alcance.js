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

const NO_ENCONTRADO = 'No encontrado';

export const veTodas = (user) => Boolean(user?.esSuperadmin || user?.todasLasEstancias);

export const puedeCampo = (user, campoId) => veTodas(user) || user.campoIds.includes(campoId);

// El filtro para listar campos: undefined (todas) o { id: { in: [...] } }.
export const filtroCampos = (user) => (veTodas(user) ? undefined : { id: { in: user.campoIds } });

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
