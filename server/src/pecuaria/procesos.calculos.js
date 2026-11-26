// Las cuentas de los procesos (diseño docs/superpowers/specs/2026-11-20-procesos-design.md).
// Todo puro, para probarlo sin base: campaña, meses de parición esperados,
// etapa actual, próximas fechas, el embudo, la categoría sugerida y el plan
// de la decisión después del diagnóstico. Las fechas van en ISO (AAAA-MM-DD).
//
// Un "ancla" es el evento de una etapa (evento_registro con etapa):
//   { etapa, loteId, fecha, cabezas, datos, anulado }
// Los datos de cada etapa (procesos.datos.js):
//   INICIO        { modalidad, toros?, reparto?, inicial?, embriones?, noAptas? } cabezas = servidas
//                 (en una transferencia: embriones { usados, detalle? } y las no aptas, que van al toro)
//   INSEMINACION  { }                                    cabezas = inseminadas ese día (IATF)
//   FIN_INSEMINACION { destino: REPASO | SALEN }         cabezas = las que quedaban
//   DIAGNOSTICO   { metodo, prenadas: { [mes | 'sin']: n }, vacias, inicial? }
//   REVISION      { aPrenadas, aVacias }                 (corrige el diagnóstico)
//   ABORTO        cabezas = abortos
//   PARICION      { madres, terneros, muertos, madresMuertas } (antes del 24/11: machos y hembras en vez de terneros)
//   FIN_PARICION  { falladas }
//   DESTETE       { destetados, pesoPromedioKg? }
import { normalizarTexto } from './normalizar.js';
import { porTandas } from './procesos.modalidad.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Mismo día, N meses después; si ese mes no tiene el día (31/08 + 6 meses),
// el último día del mes (28 o 29/02).
export function sumarMeses(iso, meses) {
  const [a, m, d] = iso.split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const nombreMes = (mes) => MESES[Number(mes.slice(5, 7)) - 1];

// La campaña va de julio a junio: el 20/11/2026 es de la "2026-27".
export function campaniaDe(iso) {
  const anio = Number(iso.slice(0, 4));
  const desde = Number(iso.slice(5, 7)) >= 7 ? anio : anio - 1;
  return `${desde}-${String((desde + 1) % 100).padStart(2, '0')}`;
}

// Los meses ("2027-10") en que se espera la parición de un servicio.
export function mesesEsperados({ inicio, fin }, gestacionDias) {
  const desde = sumarDias(inicio, gestacionDias).slice(0, 7);
  const hasta = sumarDias(fin ?? inicio, gestacionDias).slice(0, 7);
  const meses = [];
  let [a, m] = desde.split('-').map(Number);
  for (let i = 0; i < 24; i++) {
    const mes = `${a}-${String(m).padStart(2, '0')}`;
    meses.push(mes);
    if (mes >= hasta) break;
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return meses;
}

// ['2027-10', '2027-11', '2027-12'] → "oct–dic".
export function textoMeses(meses) {
  if (!meses.length) return '';
  const primero = nombreMes(meses[0]);
  return meses.length === 1 ? primero : `${primero}–${nombreMes(meses.at(-1))}`;
}

const vigentes = (anclas) => anclas.filter((a) => !a.anulado);
const de = (anclas, etapa) => anclas.filter((a) => a.etapa === etapa);
const num = (v) => (v == null || v === '' ? 0 : Number(v));
// Las preñadas de un diagnóstico: por mes ({ '2027-10': 18, sin: 4 }) o, en
// una ecografía anotada suelta desde Eventos, un número.
const sumaPrenadas = (datos) => {
  const p = datos?.prenadas;
  return p != null && typeof p === 'object' ? Object.values(p).reduce((s, n) => s + num(n), 0) : num(p);
};

export const TEXTO_ETAPA = {
  SERVICIO: 'En servicio',
  ESPERA_DIAGNOSTICO: 'Esperando el diagnóstico',
  PRENEZ: 'Diagnosticado',
  PARICION: 'Pariendo',
  CRIA: 'Con cría al pie',
  TERMINADO: 'Terminado',
};

// La IATF y la transferencia de embriones (porTandas): sin fin del servicio.
const IATF = { has: porTandas };

// Los lotes servidos que todavía no se ecografiaron, cuando el diagnóstico ya
// empezó (reglas del campo, 25/11: la ecografía va por partes). En un entore,
// los VIENTRES con su fin del servicio hecho (o con una parte ya ecografiada);
// en una IATF no hay fin del servicio: todos los VIENTRES.
function pendientesDeEcografia(a, lotes) {
  if (!a.some((x) => x.etapa === 'DIAGNOSTICO')) return [];
  const iatf = de(a, 'INICIO').some((x) => IATF.has(x.datos?.modalidad));
  const servidos = new Set([...de(a, 'FIN_SERVICIO'), ...de(a, 'DIAGNOSTICO')].map((x) => x.loteId));
  return lotes.filter((l) => l.rol === 'VIENTRES' && l.activo && (iatf || servidos.has(l.loteId)));
}

// El diagnóstico a medias: { lotes, cabezas, texto } o null. Las cabezas, si
// los lotes las traen.
export function diagnosticoAMedias(anclas, lotes = []) {
  const a = vigentes(anclas);
  if (a.some((x) => x.etapa === 'PARICION' || x.etapa === 'DESTETE')) return null;
  const faltan = pendientesDeEcografia(a, lotes);
  if (!faltan.length) return null;
  const conCabezas = faltan.every((l) => l.cabezas != null);
  const cabezas = conCabezas ? faltan.reduce((s, l) => s + num(l.cabezas), 0) : null;
  const cuantas = conCabezas ? cabezas.toLocaleString('es-UY') : `${faltan.length} ${faltan.length === 1 ? 'lote' : 'lotes'}`;
  return { lotes: faltan.length, cabezas, texto: `Diagnóstico a medias: faltan ${cuantas}` };
}

// La etapa en que está el proceso, según sus anclas vigentes y sus lotes
// ({ loteId, rol, activo }). Mientras queden servidas sin ecografiar, sigue
// esperando el diagnóstico (diagnosticoAMedias dice cuántas faltan).
export function etapaActual(anclas, lotes = []) {
  const a = vigentes(anclas);
  const hay = (etapa) => a.some((x) => x.etapa === etapa);
  if (hay('PARICION') || hay('DESTETE')) {
    const conFin = new Set(de(a, 'FIN_PARICION').map((x) => x.loteId));
    const quedanPrenadas = lotes.some((l) => (l.rol === 'PRENADAS' || l.rol === 'VIENTRES') && l.activo && !conFin.has(l.loteId));
    if (quedanPrenadas) return 'PARICION';
    const destetadas = new Set(de(a, 'DESTETE').map((x) => x.loteId));
    const crias = lotes.filter((l) => l.rol === 'CRIAS');
    if (hay('DESTETE') && crias.every((l) => destetadas.has(l.loteId) || !l.activo)) return 'TERMINADO';
    return 'CRIA';
  }
  if (hay('DIAGNOSTICO')) return pendientesDeEcografia(a, lotes).length ? 'ESPERA_DIAGNOSTICO' : 'PRENEZ';
  if (hay('FIN_SERVICIO')) return 'ESPERA_DIAGNOSTICO';
  return 'SERVICIO';
}

// Los anclas que ponen animales en servicio: el inicio, cada tanda, cada día
// de IATF y las sin inseminar que pasan al repaso con toro.
const deServicio = (a) => [
  ...de(a, 'INICIO'),
  ...de(a, 'TANDA'),
  ...de(a, 'INSEMINACION'),
  ...de(a, 'FIN_INSEMINACION').filter((x) => x.datos?.destino === 'REPASO'),
];

// Las fechas del servicio: el primer inicio y el último fin (sin fin, el
// último día que entraron animales).
export function fechasServicio(anclas) {
  const a = vigentes(anclas);
  const inicios = deServicio(a).map((x) => x.fecha).sort();
  const fines = de(a, 'FIN_SERVICIO').map((x) => x.fecha).sort();
  return { inicio: inicios[0] ?? null, fin: fines.at(-1) ?? inicios.at(-1) ?? null };
}

const porcentaje = (n, base) => (n == null || !base ? null : Math.round((n / base) * 100));

// Los números del proceso, de los anclas vigentes y de los movimientos de
// sus lotes ({ tipo, cabezas, rol, revertido }: las muertes de las crías).
export function embudo(anclas, movimientos = []) {
  const a = vigentes(anclas);
  const suma = (lista, f) => lista.reduce((s, x) => s + f(x), 0);
  const servidas = suma(deServicio(a), (x) => num(x.cabezas));

  const diags = de(a, 'DIAGNOSTICO');
  const revs = de(a, 'REVISION');
  const ajuste = suma(revs, (x) => num(x.datos?.aPrenadas) - num(x.datos?.aVacias));
  const prenadas = diags.length ? suma(diags, (x) => sumaPrenadas(x.datos)) + ajuste : null;
  const vacias = diags.length ? suma(diags, (x) => num(x.datos?.vacias)) - ajuste : null;
  const diagnosticadas = diags.length ? prenadas + vacias : null;

  const partos = de(a, 'PARICION');
  const paridas = partos.length ? suma(partos, (x) => num(x.datos?.madres)) : null;
  const ternerosVivos = partos.length ? suma(partos, (x) => num(x.datos?.terneros) + num(x.datos?.machos) + num(x.datos?.hembras)) : null;
  const nacidosMuertos = suma(partos, (x) => num(x.datos?.muertos));
  const madresMuertas = suma(partos, (x) => num(x.datos?.madresMuertas));

  const destetes = de(a, 'DESTETE');
  const destetados = destetes.length ? suma(destetes, (x) => num(x.datos?.destetados ?? x.cabezas)) : null;
  const pesados = destetes.filter((x) => x.datos?.pesoPromedioKg != null);
  const kgDestetados = pesados.length ? Math.round(suma(pesados, (x) => num(x.datos.destetados ?? x.cabezas) * Number(x.datos.pesoPromedioKg))) : null;

  const raya = (n) => (n == null ? '—' : n.toLocaleString('es-UY'));
  return {
    servidas,
    diagnosticadas,
    prenadas,
    vacias,
    // La transferencia de embriones (26/11): los embriones usados y las no aptas
    // (null si el proceso no tiene transferencias).
    embriones: deServicio(a).some((x) => x.datos?.embriones) ? suma(deServicio(a), (x) => num(x.datos?.embriones?.usados)) : null,
    noAptas: suma(deServicio(a), (x) => num(x.datos?.noAptas)),
    abortos: suma(de(a, 'ABORTO'), (x) => num(x.cabezas)),
    paridas,
    ternerosVivos,
    nacidosMuertos,
    madresMuertas,
    falladas: suma(de(a, 'FIN_PARICION'), (x) => num(x.datos?.falladas)),
    muertesCrias: suma(
      movimientos.filter((m) => m.tipo === 'MUERTE' && m.rol === 'CRIAS' && !m.revertido),
      (m) => m.cabezas,
    ),
    // Fase 8: las bajas de vacas cargadas desde el proceso (las de las crías
    // ya cuentan en muertesCrias, por su movimiento).
    muertesMadres: suma(
      de(a, 'BAJA').filter((x) => x.datos?.quien !== 'CRIA'),
      (x) => num(x.cabezas),
    ),
    destetados,
    kgDestetados,
    porcentajes: { prenez: porcentaje(prenadas, servidas), paricion: porcentaje(ternerosVivos, servidas), destete: porcentaje(destetados, servidas) },
    corto: [servidas, prenadas, paridas, destetados].map(raya).join(' → '),
  };
}

// La categoría que se sugiere en cada paso, buscando por nombre en el
// catálogo; si no la encuentra, la misma (las crías: la de terneros o terneras).
//   paso: PRENADA · PARIDA · DESTETE_MADRE · VACIA · CRIA_MACHO · CRIA_HEMBRA
export function sugerirCategoria(paso, categoria, categorias) {
  const buscar = (...nombres) => {
    for (const nombre of nombres) {
      const c = categorias.find((x) => normalizarTexto(x.nombre) === normalizarTexto(nombre));
      if (c) return c;
    }
    return null;
  };
  const nombre = normalizarTexto(categoria?.nombre);
  const base = nombre.replace(/ prenadas$/, '');
  const esVaquillona = nombre.startsWith('vaquillona');
  const wagyu = nombre.includes('wagyu');
  let sugerida = null;
  switch (paso) {
    case 'PRENADA':
      sugerida = nombre.endsWith('prenadas') ? null : buscar(`${nombre} preñadas`);
      break;
    case 'PARIDA':
      sugerida = esVaquillona ? buscar('Vaquillonas paridas') : buscar('Vacas paridas');
      break;
    case 'DESTETE_MADRE':
      sugerida = wagyu ? buscar('Vacas de cría Wagyu', 'Vacas de cría') : buscar('Vacas de cría');
      break;
    case 'VACIA':
      sugerida = esVaquillona ? buscar(`${base} invernar`) : buscar(wagyu ? 'Vacas invernar Wagyu' : 'Vacas invernar');
      break;
    case 'CRIA_MACHO':
      sugerida = buscar('Terneros chicos', 'Terneros');
      break;
    case 'CRIA_HEMBRA':
      sugerida = buscar('Terneras chicas', 'Terneras');
      break;
    default:
      break;
  }
  return sugerida ?? categoria;
}

// --- Reglas del campo (25/11, docs/superpowers/prompts/2026-11-25-procesos-reglas-del-campo.md) ---

// R1. Al separar un grupo en dos, una de las partes cambia de potrero: en el
// campo nadie las podría distinguir. Los estados son los roles del proceso
// (VIENTRES, SIN_SERVIR, PRENADAS, VACIAS, PARIDAS, CRIAS, LIBRES), y las
// vacías con destino distinto cuentan como estados distintos (VACIAS:REENTORE).
// Excepción: las paridas con su cría y las preñadas conviven hasta el destete.
const CONVIVEN = new Set(['PARIDAS', 'CRIAS', 'PRENADAS']);
export const conviven = (a, b) => a === b || (CONVIVEN.has(a) && CONVIVEN.has(b));

const NOMBRE_ESTADO = {
  VIENTRES: 'servidas',
  SIN_SERVIR: 'sin inseminar',
  PRENADAS: 'preñadas',
  VACIAS: 'vacías',
  'VACIAS:REENTORE': 'vacías para el entore',
  'VACIAS:INVERNADA': 'vacías para engorde',
  PARIDAS: 'paridas',
  CRIAS: 'terneros',
  LIBRES: 'las que salen del proceso',
};
export const nombreEstado = (estado) => NOMBRE_ESTADO[estado] ?? estado.toLowerCase();

// Las partes ({ estado, potreroId, nombre? }) que quedan juntas sin poder: la
// primera pareja { a, b, texto } o null.
export function partesJuntas(partes) {
  for (let i = 0; i < partes.length; i++) {
    for (let j = i + 1; j < partes.length; j++) {
      const a = partes[i];
      const b = partes[j];
      if (a.potreroId == null || a.potreroId !== b.potreroId || conviven(a.estado, b.estado)) continue;
      const na = a.nombre ?? nombreEstado(a.estado);
      const nb = b.nombre ?? nombreEstado(b.estado);
      return { a, b, texto: `${mayusculaInicial(na)} y ${nb} no pueden quedar en el mismo potrero: en el campo no se distinguen. Elegí otro potrero para unas de las dos` };
    }
  }
  return null;
}
const mayusculaInicial = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// R5. Nunca dos entores seguidos: las vacías de un entore van a engorde.
export const NO_REENTORE = 'Las vacías de un entore van a engorde: no se vuelven a servir';

// El estado de un bloque del plan de la decisión, para R1.
const estadoDeBloque = (b) => (b.clase === 'SIN' ? 'VIENTRES' : b.clase === 'PRENADAS' ? 'PRENADAS' : b.destino === 'REENTORE' || b.destino === 'INVERNADA' ? `VACIAS:${b.destino}` : 'VACIAS');

// El plan de la decisión del diagnóstico (diseño §8), sin tocar la base.
//   lote: { id, cabezas, categoriaId, potreroId }
//   modalidad: la del proceso (TOROS | IATF | IA). En un entore (TOROS) las
//     vacías no se vuelven a servir (R5).
//   separar: reglas del campo (R1 y R4): las vacías tienen destino (entore o
//     engorde) y ningún estado queda en el mismo potrero que otro (preñadas,
//     vacías, sin ecografiar). Sin separar, como antes (lo viejo).
//   juntas: con separar, deja los estados en el mismo potrero (excepción de
//     R1: las paridas con su cría al pie, hasta el destete).
//   grupos: [{ clave, cabezas, destino, categoriaId?, clase? }], con destino:
//     { potreroId } · { venta: { guia?, precioVentaUsd?, precioVentaPor?, pesoPromedioKg? } } ·
//     { invernada: true, potreroId? } · { reentore: true, potreroId? } ·
//     { salen: true, potreroId? } · { despues: true }
//   (reentore: para volver a servir; salen: se mueven y dejan el proceso).
//   clase: PRENADAS (por defecto) o VACIAS (la clave 'vacias').
// Devuelve { pasos, queda, bloques } o { error }. Los grupos que van al mismo
// potrero, con la misma categoría, la misma clase y el mismo destino se juntan
// en un lote; preñadas y vacías nunca. El lote original se queda con un
// bloque: el más grande de los que no cambian ni de potrero ni de categoría;
// si no hay, el más grande de los que se quedan en el potrero (cambia de
// categoría al final); si todos se van, el más grande (se lleva el lote
// entero). Los demás son partes de la familia. Las ventas van primero. Las
// cabezas sin diagnosticar se quedan como estaban (clase SIN).
//   pasos: { tipo: 'VENTA', grupos, cabezas, venta } ·
//          { tipo: 'PARTE' | 'MOVER_ENTERO', grupos, cabezas, potreroId, categoriaId } ·
//          { tipo: 'CATEGORIA', grupos, cabezas, categoriaId }
//   bloques: [{ grupos, cabezas, potreroId, categoriaId, clase, destino, queda }]
//     (destino: DESPUES · REENTORE · SALEN · INVERNADA · null)
export function planDecision({ lote, grupos, modalidad = null, separar = false, juntas = false }) {
  const total = grupos.reduce((s, g) => s + num(g.cabezas), 0);
  if (total > lote.cabezas) return { error: `El lote tiene ${lote.cabezas} cabezas: los grupos suman ${total}` };
  const entore = modalidad != null && !IATF.has(modalidad);
  const vaciasDe = (g) => num(g.cabezas) > 0 && (g.clase ?? (g.clave === 'vacias' ? 'VACIAS' : 'PRENADAS')) === 'VACIAS';
  if (entore && grupos.some((g) => vaciasDe(g) && g.destino?.reentore)) return { error: NO_REENTORE };
  if (separar) {
    for (const g of grupos.filter(vaciasDe)) {
      if (!g.destino?.reentore && !g.destino?.invernada) {
        return { error: entore ? 'Las vacías de un entore van a engorde: elegí el potrero' : 'Elegí qué pasa con las vacías: entore con toros o engorde' };
      }
    }
  }

  const ventas = [];
  const bloques = [];
  const agregar = (clave, cabezas, potreroId, categoriaId, clase, destino) => {
    const b = bloques.find((x) => x.potreroId === potreroId && x.categoriaId === categoriaId && x.clase === clase && x.destino === destino);
    if (b) {
      b.grupos.push(clave);
      b.cabezas += cabezas;
    } else {
      bloques.push({ grupos: [clave], cabezas, potreroId, categoriaId, clase, destino });
    }
  };
  for (const g of grupos) {
    const n = num(g.cabezas);
    if (n <= 0) continue;
    const d = g.destino ?? { despues: true };
    const clase = g.clase ?? (g.clave === 'vacias' ? 'VACIAS' : 'PRENADAS');
    const marca = d.reentore ? 'REENTORE' : d.salen ? 'SALEN' : d.invernada ? 'INVERNADA' : d.despues ? 'DESPUES' : null;
    if (d.venta) ventas.push({ tipo: 'VENTA', grupos: [g.clave], cabezas: n, venta: d.venta });
    else if (d.despues) agregar(g.clave, n, lote.potreroId, g.categoriaId ?? lote.categoriaId, clase, marca);
    else agregar(g.clave, n, d.potreroId ?? lote.potreroId, g.categoriaId ?? lote.categoriaId, clase, marca);
  }
  if (total < lote.cabezas) agregar('sinDiagnostico', lote.cabezas - total, lote.potreroId, lote.categoriaId, 'SIN', null);
  if (separar && !juntas) {
    const pareja = partesJuntas(bloques.map((b) => ({ estado: estadoDeBloque(b), potreroId: b.potreroId, ...(b.clase === 'SIN' ? { nombre: 'sin ecografiar' } : {}) })));
    if (pareja) return { error: pareja.texto };
  }

  const mayor = (lista) => lista.reduce((m, b) => (m == null || b.cabezas > m.cabezas ? b : m), null);
  const enPotrero = bloques.filter((b) => b.potreroId === lote.potreroId);
  const queda = mayor(enPotrero.filter((b) => b.categoriaId === lote.categoriaId)) ?? mayor(enPotrero) ?? mayor(bloques);

  const pasos = [...ventas];
  for (const b of bloques) {
    b.queda = b === queda;
    if (b !== queda) pasos.push({ tipo: 'PARTE', grupos: b.grupos, cabezas: b.cabezas, potreroId: b.potreroId, categoriaId: b.categoriaId });
  }
  if (queda && queda.potreroId !== lote.potreroId) {
    pasos.push({ tipo: 'MOVER_ENTERO', grupos: queda.grupos, cabezas: queda.cabezas, potreroId: queda.potreroId, categoriaId: queda.categoriaId });
  } else if (queda && queda.categoriaId !== lote.categoriaId) {
    pasos.push({ tipo: 'CATEGORIA', grupos: queda.grupos, cabezas: queda.cabezas, categoriaId: queda.categoriaId });
  }
  return { pasos, queda: queda?.grupos ?? [], bloques };
}

// R8. Con cría al pie: cuántas vacas y cuántos terneros hay en cada potrero.
//   lotes: los del proceso hoy, { rol, cabezas, potreroId, potrero }
// Devuelve [{ potreroId, potrero, vacas, paridas, prenadas, vacias, servidas,
// terneros, texto }], ordenado por potrero: "P12: 40 vacas (25 paridas · 15
// preñadas) · 24 terneros". Solo los potreros con vacas o terneros.
const MADRES = { PARIDAS: 'paridas', PRENADAS: 'prenadas', VACIAS: 'vacias', VIENTRES: 'servidas', SIN_SERVIR: 'servidas' };
const PALABRAS = { paridas: ['parida', 'paridas'], prenadas: ['preñada', 'preñadas'], vacias: ['vacía', 'vacías'], servidas: ['sin ecografiar', 'sin ecografiar'] };
const cuenta = (n, [uno, varios]) => `${n.toLocaleString('es-UY')} ${n === 1 ? uno : varios}`;

export function vacasYTernerosPorPotrero(lotes) {
  const porPotrero = new Map();
  for (const l of lotes) {
    const n = num(l.cabezas);
    if (n <= 0 || (!MADRES[l.rol] && l.rol !== 'CRIAS')) continue;
    if (!porPotrero.has(l.potreroId)) {
      porPotrero.set(l.potreroId, { potreroId: l.potreroId, potrero: l.potrero ?? null, vacas: 0, paridas: 0, prenadas: 0, vacias: 0, servidas: 0, terneros: 0 });
    }
    const p = porPotrero.get(l.potreroId);
    if (l.rol === 'CRIAS') p.terneros += n;
    else {
      p[MADRES[l.rol]] += n;
      p.vacas += n;
    }
  }
  return [...porPotrero.values()]
    .sort((a, b) => String(a.potrero ?? '').localeCompare(String(b.potrero ?? ''), 'es', { numeric: true }))
    .map((p) => {
      const partes = ['paridas', 'prenadas', 'vacias', 'servidas'].filter((k) => p[k] > 0).map((k) => cuenta(p[k], PALABRAS[k]));
      const vacas = partes.length > 1 ? `${cuenta(p.vacas, ['vaca', 'vacas'])} (${partes.join(' · ')})` : partes[0];
      const terneros = p.terneros ? cuenta(p.terneros, ['ternero', 'terneros']) : null;
      const cuerpo = [vacas, terneros].filter(Boolean).join(' · ');
      return { ...p, texto: p.potrero ? `${p.potrero}: ${cuerpo}` : cuerpo };
    });
}
