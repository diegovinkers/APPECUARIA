// Lo que no se ve del camino de un evento (EventoPage): qué lotes hay, el
// buscador, qué quedó elegido y el cuerpo que va a la API. Todo puro, para
// probarlo sin pantalla.
import { formularioDe, sexoCorresponde } from '../navegacion/eventos';
import { armarBusqueda, nivelBusqueda } from './busqueda';

const ordenNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

// Los lotes con animales de los potreros de una estancia (lo que trae usePotreros).
export function indexarLotes(potreros = []) {
  return potreros.flatMap((p) =>
    (p.stock?.lotes ?? [])
      .filter((l) => l.cabezas > 0)
      .map((l) => ({
        loteId: l.loteId,
        lote: l.lote,
        potreroId: p.id,
        potrero: p.nombre,
        categoriaId: l.categoriaId,
        categoria: l.categoria,
        sexo: l.sexo ?? null,
        cabezas: l.cabezas,
        pesoPromedioKg: l.pesoPromedioKg ?? null,
      })),
  );
}

// Los lotes a los que se le puede aplicar el tipo (por el sexo) y cuántos no.
export function lotesDelTipo(lotes, tipo) {
  const si = lotes.filter((l) => sexoCorresponde(tipo, l.sexo));
  return { lotes: si, omitidos: lotes.length - si.length };
}

// Qué se puede elegir según los niveles del tipo.
export function opcionesDe(tipo) {
  const n = tipo?.niveles ?? ['LOTE'];
  return {
    campo: n.includes('CAMPO'),
    potrero: n.includes('POTRERO'),
    categoria: n.includes('CATEGORIA'),
    lote: n.includes('LOTE') || n.includes('PARTE_LOTE'),
    parte: n.includes('PARTE_LOTE'),
  };
}

// El buscador: por potrero ("8.1"), lote o categoría ("terneros"). Devuelve
// los potreros (con sus lotes que coinciden, o todos si coincide el potrero)
// y las categorías que coinciden. Sin texto: todos los potreros. Si no hay
// nada preciso, lo que se parece ("81" → 8.1; busqueda.js).
export function buscar(lotes, texto) {
  const b = armarBusqueda(texto);
  const potreros = new Map();
  const categorias = new Map();
  // Cada lote con la pasada que lo encuentra (busqueda.js); quedan los de la mejor.
  const niveles = lotes.map((l) => nivelBusqueda([l.potrero, l.lote, l.categoria], b));
  const mejor = Math.max(0, ...niveles);
  lotes.forEach((l, i) => {
    if (b && (mejor === 0 || niveles[i] !== mejor)) return;
    if (!potreros.has(l.potreroId)) potreros.set(l.potreroId, { potreroId: l.potreroId, potrero: l.potrero, lotes: [] });
    potreros.get(l.potreroId).lotes.push(l);
    if (b && nivelBusqueda([l.categoria], b) === mejor) {
      if (!categorias.has(l.categoriaId)) categorias.set(l.categoriaId, { categoriaId: l.categoriaId, categoria: l.categoria, lotes: [] });
      categorias.get(l.categoriaId).lotes.push(l);
    }
  });
  return {
    potreros: [...potreros.values()].sort((a, b) => ordenNatural.compare(a.potrero, b.potrero)),
    categorias: [...categorias.values()].sort((a, b) => a.categoria.localeCompare(b.categoria)),
  };
}

export const SIN_ELEGIR = { nivel: 'LOTE', loteIds: [], potreroIds: [], categoriaId: null };

// Los lotes que quedaron elegidos (ya filtrados por el sexo del tipo).
export function lotesElegidos(sel, lotes) {
  if (sel.nivel === 'CAMPO') return lotes;
  if (sel.nivel === 'CATEGORIA') return lotes.filter((l) => l.categoriaId === sel.categoriaId);
  if (sel.nivel === 'POTRERO') return lotes.filter((l) => sel.potreroIds.includes(l.potreroId));
  return lotes.filter((l) => sel.loteIds.includes(l.loteId));
}

const alternar = (lista, x) => (lista.includes(x) ? lista.filter((y) => y !== x) : [...lista, x]);

// Cambia lo elegido. accion: { tipo: 'lote' | 'potrero' | 'campo' | 'categoria' | 'nada', id }.
//   lote: suma o saca un lote (si había un atajo, se pasa a lotes sueltos);
//   potrero: un potrero entero (si se pueden potreros enteros) o todos sus lotes;
//   campo / categoria: el atajo (tocarlo de nuevo lo saca).
// opciones: opcionesDe(tipo); lotes: los del tipo.
export function cambiarSeleccion(sel, accion, lotes, opciones) {
  const ids = (filtro) => lotes.filter(filtro).map((l) => l.loteId);
  const comoLotes = () => (sel.nivel === 'LOTE' ? sel.loteIds : lotesElegidos(sel, lotes).map((l) => l.loteId));
  switch (accion.tipo) {
    case 'campo':
      return sel.nivel === 'CAMPO' ? SIN_ELEGIR : { ...SIN_ELEGIR, nivel: 'CAMPO' };
    case 'categoria':
      return sel.nivel === 'CATEGORIA' && sel.categoriaId === accion.id ? SIN_ELEGIR : { ...SIN_ELEGIR, nivel: 'CATEGORIA', categoriaId: accion.id };
    case 'potrero': {
      const delPotrero = ids((l) => l.potreroId === accion.id);
      if (opciones.potrero && (sel.nivel === 'POTRERO' || (sel.nivel === 'LOTE' && !sel.loteIds.length) || sel.nivel === 'CAMPO' || sel.nivel === 'CATEGORIA')) {
        const potreroIds = sel.nivel === 'POTRERO' ? alternar(sel.potreroIds, accion.id) : [accion.id];
        return potreroIds.length ? { ...SIN_ELEGIR, nivel: 'POTRERO', potreroIds } : SIN_ELEGIR;
      }
      const actuales = comoLotes();
      const todos = delPotrero.every((id) => actuales.includes(id));
      return { ...SIN_ELEGIR, loteIds: todos ? actuales.filter((id) => !delPotrero.includes(id)) : [...new Set([...actuales, ...delPotrero])] };
    }
    case 'lote':
      return { ...SIN_ELEGIR, loteIds: alternar(comoLotes(), accion.id) };
    default:
      return SIN_ELEGIR;
  }
}

// ¿Está elegido este lote, o este potrero entero?
export const loteElegido = (sel, lotes, loteId) => lotesElegidos(sel, lotes).some((l) => l.loteId === loteId);
export const potreroElegido = (sel, lotes, potreroId) => {
  const del = lotes.filter((l) => l.potreroId === potreroId);
  return del.length > 0 && del.every((l) => loteElegido(sel, lotes, l.loteId));
};

// Lo elegido al abrir el camino desde la ficha de un potrero o de un lote.
export function seleccionInicial(contexto, lotes, opciones) {
  if (contexto?.lote && lotes.some((l) => l.loteId === contexto.lote) && opciones.lote) return { ...SIN_ELEGIR, loteIds: [contexto.lote] };
  if (contexto?.potrero && lotes.some((l) => l.potreroId === contexto.potrero)) {
    if (opciones.potrero) return { ...SIN_ELEGIR, nivel: 'POTRERO', potreroIds: [contexto.potrero] };
    if (opciones.lote) return { ...SIN_ELEGIR, loteIds: lotes.filter((l) => l.potreroId === contexto.potrero).map((l) => l.loteId) };
  }
  return SIN_ELEGIR;
}

// Lo que se sugiere en el paso 3 para un lote (como texto, para los inputs).
export function datosSugeridos(tipo, l) {
  switch (formularioDe(tipo)) {
    case 'pesada':
      return { pesoPromedioKg: l.pesoPromedioKg == null ? '' : String(l.pesoPromedioKg).replace('.', ','), pesadas: String(l.cabezas) };
    case 'recuento':
      return { contadas: String(l.cabezas), motivo: '' };
    case 'ecografia':
      return { prenadas: '', vacias: '' };
    case 'cabezas':
      return { cabezas: String(l.cabezas) };
    default:
      return {};
  }
}

const entero = (t) => (String(t ?? '').trim() === '' ? null : Number.parseInt(t, 10));

// ¿Hay diferencia en el recuento de este lote?
export const hayDiferencia = (l, d) => entero(d?.contadas) != null && entero(d.contadas) !== l.cabezas;

// Lo de cada lote que va a la API (los vacíos no van).
function lineaParaApi(formulario, l, d = {}) {
  const limpio = (v) => (String(v ?? '').trim() === '' ? undefined : String(v).trim());
  switch (formulario) {
    case 'pesada':
      return { pesoPromedioKg: limpio(d.pesoPromedioKg), pesadas: limpio(d.pesadas) };
    case 'recuento':
      return { contadas: limpio(d.contadas), motivo: hayDiferencia(l, d) ? limpio(d.motivo) : undefined };
    case 'ecografia':
      return { prenadas: limpio(d.prenadas), vacias: limpio(d.vacias) };
    case 'cabezas':
      return { cabezas: limpio(d.cabezas) };
    default:
      return {};
  }
}

const sinIndefinidos = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// El cuerpo para la vista previa y el registro.
//   comunes: { producto } o { racion, kgPorCabezaDia }; datosLote: { [loteId]: {...} }.
// En los atajos (estancia, potrero, categoría) solo van las líneas con algo
// propio (el peso, las cabezas contadas, o menos cabezas que el lote).
export function cuerpoEvento({ tipo, sel, campoId, lotes, datosLote = {}, comunes = {}, fecha, nota }) {
  const formulario = formularioDe(tipo);
  const elegidos = lotesElegidos(sel, lotes);
  const lineas = elegidos
    .map((l) => ({ loteId: l.loteId, ...sinIndefinidos(lineaParaApi(formulario, l, datosLote[l.loteId] ?? datosSugeridos(tipo, l))) }))
    .filter((linea) => {
      if (sel.nivel === 'LOTE') return true;
      if (formulario === 'cabezas') return linea.cabezas != null && Number(linea.cabezas) !== elegidos.find((l) => l.loteId === linea.loteId).cabezas;
      return Object.keys(linea).length > 1;
    });
  const datos = sinIndefinidos(
    Object.fromEntries(Object.entries(comunes).map(([k, v]) => [k, String(v ?? '').trim() === '' ? undefined : String(v).trim()])),
  );
  return {
    tipoId: tipo.id,
    fecha,
    ...(nota?.trim() && { nota: nota.trim() }),
    nivel: sel.nivel,
    ...((sel.nivel === 'CAMPO' || sel.nivel === 'CATEGORIA') && { campoId }),
    ...(sel.nivel === 'CATEGORIA' && { categoriaId: sel.categoriaId }),
    ...(sel.nivel === 'POTRERO' && { potreroIds: sel.potreroIds }),
    ...(Object.keys(datos).length > 0 && { datos }),
    ...(lineas.length > 0 && { lineas }),
  };
}

// Lo que se guarda en "usados hace poco" de lo elegido.
export function recientesDe(sel, lotes, campoId) {
  if (sel.nivel === 'POTRERO') return sel.potreroIds.map((id) => ({ tipo: 'potrero', id, campoId }));
  if (sel.nivel === 'LOTE') return lotesElegidos(sel, lotes).map((l) => ({ tipo: 'lote', id: l.loteId, campoId }));
  return [];
}
