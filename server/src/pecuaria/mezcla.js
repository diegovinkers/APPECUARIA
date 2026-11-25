// Avisos por mezcla (reglas del campo, R10, 25/11): cuando una carga de un
// proceso o un movimiento del "+" deja juntos en un potrero animales que no se
// deberían juntar, la vista previa avisa y deja seguir. No bloquea nada.
//
// Dos avisos:
//   1. El más importante: dos grupos del mismo proceso en distinto estado
//      (preñadas con vacías, sin ecografiar con ecografiadas, inseminadas con
//      sin inseminar), aunque sean de la misma categoría. Las paridas con su
//      cría y las preñadas conviven (procesos.calculos.js, `conviven`).
//   2. Por categoría, con los grupos de manejo de abajo.
//
// La tabla es una propuesta que Diego tiene que confirmar: está toda acá para
// cambiarla fácil. Las categorías van por nombre; al comparar se normaliza
// (sin tildes ni mayúsculas) y se saca "Wagyu" ("Vacas de cría Wagyu" =
// "Vacas de cría"). Una categoría que no está en la tabla no da aviso.
import { normalizarTexto } from './normalizar.js';
import { conviven, nombreEstado } from './procesos.calculos.js';
import { deducirSexo } from './sexo.js';

export const GRUPOS_DE_MANEJO = {
  CRIA: {
    nombre: 'cría al pie',
    categorias: ['Vacas paridas', 'Vaquillonas paridas', 'Terneros chicos', 'Terneras chicas', 'Terneros/as'],
  },
  VIENTRES: {
    nombre: 'vientres',
    categorias: ['Vacas', 'Vacas de cría', 'Vaquillonas 1-2', 'Vaquillonas +2', 'Vaquillonas 1-2 preñadas', 'Vaquillonas +2 preñadas'],
  },
  ENGORDE_HEMBRAS: {
    nombre: 'engorde de hembras',
    categorias: ['Vacas invernar', 'Vacas CUT', 'Vaquillonas 1-2 invernar', 'Vaquillonas +2 invernar'],
  },
  RECRIA: { nombre: 'recría', categorias: ['Vaquillonas'] },
  // Entre ellos, avisa si son de distinto sexo.
  DESTETADOS: { nombre: 'destetados', categorias: ['Terneros', 'Terneras'], porSexo: true },
  // Además de sus parejas, avisa con cualquier hembra.
  ENGORDE_MACHOS: { nombre: 'engorde de machos', prefijos: ['novillos'], conHembras: true },
  // No es un grupo de la tabla: está para avisar que la recría queda con toros.
  TOROS: { nombre: 'toros', prefijos: ['toros'] },
};

// Las parejas de grupos que avisan (da igual el orden).
export const SE_AVISA = [
  ['CRIA', 'ENGORDE_HEMBRAS'],
  ['CRIA', 'ENGORDE_MACHOS'],
  ['CRIA', 'RECRIA'],
  ['CRIA', 'DESTETADOS'],
  ['VIENTRES', 'ENGORDE_HEMBRAS'],
  ['VIENTRES', 'ENGORDE_MACHOS'],
  ['VIENTRES', 'RECRIA'],
  ['VIENTRES', 'DESTETADOS'],
  ['ENGORDE_HEMBRAS', 'ENGORDE_MACHOS'],
  ['ENGORDE_HEMBRAS', 'DESTETADOS'],
  ['RECRIA', 'ENGORDE_MACHOS'],
  ['RECRIA', 'TOROS'],
];

const sinWagyu = (nombre) => normalizarTexto(nombre).replace(/\bwagyu\b/g, ' ').replace(/\s+/g, ' ').trim();

const POR_NOMBRE = new Map();
for (const [clave, g] of Object.entries(GRUPOS_DE_MANEJO)) {
  for (const c of g.categorias ?? []) POR_NOMBRE.set(sinWagyu(c), clave);
}

// El grupo de manejo de una categoría (por su nombre), o null.
export function grupoDeManejo(categoria) {
  const nombre = sinWagyu(categoria);
  if (!nombre) return null;
  if (POR_NOMBRE.has(nombre)) return POR_NOMBRE.get(nombre);
  for (const [clave, g] of Object.entries(GRUPOS_DE_MANEJO)) {
    if ((g.prefijos ?? []).some((p) => nombre === p || nombre.startsWith(`${p} `))) return clave;
  }
  return null;
}

const avisan = (a, b) => SE_AVISA.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

// ¿Estas dos categorías dan aviso si quedan juntas?
function chocan(a, b) {
  if (a.grupo === b.grupo) return Boolean(GRUPOS_DE_MANEJO[a.grupo].porSexo && a.sexo && b.sexo && a.sexo !== b.sexo);
  if (avisan(a.grupo, b.grupo)) return true;
  const machos = GRUPOS_DE_MANEJO[a.grupo].conHembras ? b : GRUPOS_DE_MANEJO[b.grupo].conHembras ? a : null;
  return Boolean(machos && machos.sexo === 'HEMBRA');
}

// Los avisos de un potrero.
//   lotes: [{ nombre?, categoria (nombre), sexo?, rol?, proceso?: { id, nombre } }]
//     (rol: el del lote en ese proceso; sin proceso o LIBRES no cuenta para el
//     aviso de estados)
//   potrero: el nombre, para el texto ("En P12, ...")
// Devuelve una lista de textos, primero los de estados.
export function avisosDeMezcla(lotes, { potrero = null } = {}) {
  const en = potrero ? `En ${potrero} quedan juntas` : 'Quedan juntas';
  const avisos = [];

  // 1. Estados del mismo proceso.
  const porProceso = new Map();
  for (const l of lotes) {
    if (!l.proceso?.id || !l.rol || l.rol === 'LIBRES') continue;
    if (!porProceso.has(l.proceso.id)) porProceso.set(l.proceso.id, { nombre: l.proceso.nombre, roles: [] });
    const p = porProceso.get(l.proceso.id);
    if (!p.roles.includes(l.rol)) p.roles.push(l.rol);
  }
  for (const p of porProceso.values()) {
    for (let i = 0; i < p.roles.length; i++) {
      for (let j = i + 1; j < p.roles.length; j++) {
        if (conviven(p.roles[i], p.roles[j])) continue;
        const del = p.nombre ? ` de "${p.nombre}"` : ' del mismo proceso';
        avisos.push(`${en} ${nombreEstado(p.roles[i])} y ${nombreEstado(p.roles[j])}${del}: en el campo no se van a poder distinguir`);
      }
    }
  }

  // 2. Por categoría (una vez por pareja de categorías).
  const cats = [];
  for (const l of lotes) {
    const nombre = l.categoria?.nombre ?? l.categoria;
    const grupo = grupoDeManejo(nombre);
    if (!grupo || cats.some((c) => normalizarTexto(c.nombre) === normalizarTexto(nombre))) continue;
    cats.push({ nombre, grupo, sexo: l.sexo ?? deducirSexo(nombre) });
  }
  const enCat = potrero ? `En ${potrero} quedan juntos` : 'Quedan juntos';
  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      if (chocan(cats[i], cats[j])) avisos.push(`${enCat} ${cats[i].nombre} y ${cats[j].nombre}: no se suelen mezclar (${GRUPOS_DE_MANEJO[cats[i].grupo].nombre} con ${GRUPOS_DE_MANEJO[cats[j].grupo].nombre})`);
    }
  }
  return avisos;
}
