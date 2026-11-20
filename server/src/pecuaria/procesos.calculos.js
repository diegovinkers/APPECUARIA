// Las cuentas de los procesos (diseño docs/superpowers/specs/2026-11-20-procesos-design.md).
// Todo puro, para probarlo sin base: campaña, meses de parición esperados,
// etapa actual, próximas fechas, el embudo, la categoría sugerida y el plan
// de la decisión después del diagnóstico. Las fechas van en ISO (AAAA-MM-DD).
//
// Un "ancla" es el evento de una etapa (evento_registro con etapa):
//   { etapa, loteId, fecha, cabezas, datos, anulado }
// Los datos de cada etapa (procesos.datos.js):
//   INICIO        { modalidad, toros?, inicial? }       cabezas = servidas
//   DIAGNOSTICO   { metodo, prenadas: { [mes | 'sin']: n }, vacias, inicial? }
//   REVISION      { aPrenadas, aVacias }                 (corrige el diagnóstico)
//   ABORTO        cabezas = abortos
//   PARICION      { madres, machos, hembras, muertos, madresMuertas }
//   FIN_PARICION  { falladas }
//   DESTETE       { destetados, pesoPromedioKg? }
import { normalizarTexto } from './normalizar.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
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

// La etapa en que está el proceso, según sus anclas vigentes y sus lotes
// ({ loteId, rol, activo }).
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
  if (hay('DIAGNOSTICO')) return 'PRENEZ';
  if (hay('FIN_SERVICIO')) return 'ESPERA_DIAGNOSTICO';
  return 'SERVICIO';
}

// Las fechas del servicio: el primer inicio y el último fin (sin fin, el inicio).
export function fechasServicio(anclas) {
  const a = vigentes(anclas);
  const inicios = de(a, 'INICIO').map((x) => x.fecha).sort();
  const fines = de(a, 'FIN_SERVICIO').map((x) => x.fecha).sort();
  const inicio = inicios[0] ?? null;
  return { inicio, fin: fines.at(-1) ?? inicio };
}

// Lo que sigue: { etapa, texto, desde, atrasada }.
//   parametros: { gestacionDias, diagnosticoDesdeDias, desteteEdadDias }.
export function proximas({ anclas, lotes = [], parametros, hoy }) {
  const etapa = etapaActual(anclas, lotes);
  const { inicio, fin } = fechasServicio(anclas);
  const g = parametros.gestacionDias;
  if (etapa === 'SERVICIO') return { etapa: 'FIN_SERVICIO', texto: inicio ? `en servicio desde ${ddmm(inicio)}` : 'en servicio', desde: null, atrasada: false };
  if (etapa === 'ESPERA_DIAGNOSTICO') {
    const desde = sumarDias(fin, parametros.diagnosticoDesdeDias);
    return { etapa: 'DIAGNOSTICO', texto: `diag. desde ${ddmm(desde)}`, desde, atrasada: hoy > sumarDias(fin, 120) };
  }
  if (etapa === 'PRENEZ' || etapa === 'PARICION') {
    const desde = inicio ? sumarDias(inicio, g) : null;
    const hasta = fin ? sumarDias(fin, g) : null;
    const atrasada = hasta != null && hoy > sumarDias(hasta, 30);
    if (etapa === 'PRENEZ') {
      return { etapa: 'PARICION', texto: inicio ? `parición ${textoMeses(mesesEsperados({ inicio, fin }, g))}` : 'parición', desde, atrasada };
    }
    return { etapa: 'PARICION', texto: hasta ? `parición hasta ${ddmm(hasta)}` : 'pariendo', desde, atrasada };
  }
  if (etapa === 'CRIA') {
    const partos = de(vigentes(anclas), 'PARICION').map((x) => x.fecha).sort();
    const desde = partos[0] ? sumarDias(partos[0], parametros.desteteEdadDias) : null;
    return { etapa: 'DESTETE', texto: desde ? `destete desde ${nombreMes(desde)}` : 'destete', desde, atrasada: desde != null && hoy > sumarDias(desde, 60) };
  }
  return { etapa: null, texto: 'terminado', desde: null, atrasada: false };
}

const porcentaje = (n, base) => (n == null || !base ? null : Math.round((n / base) * 100));

// Los números del proceso, de los anclas vigentes y de los movimientos de
// sus lotes ({ tipo, cabezas, rol, revertido }: las muertes de las crías).
export function embudo(anclas, movimientos = []) {
  const a = vigentes(anclas);
  const suma = (lista, f) => lista.reduce((s, x) => s + f(x), 0);
  const servidas = suma(de(a, 'INICIO'), (x) => num(x.cabezas));

  const diags = de(a, 'DIAGNOSTICO');
  const revs = de(a, 'REVISION');
  const ajuste = suma(revs, (x) => num(x.datos?.aPrenadas) - num(x.datos?.aVacias));
  const prenadas = diags.length ? suma(diags, (x) => sumaPrenadas(x.datos)) + ajuste : null;
  const vacias = diags.length ? suma(diags, (x) => num(x.datos?.vacias)) - ajuste : null;
  const diagnosticadas = diags.length ? prenadas + vacias : null;

  const partos = de(a, 'PARICION');
  const paridas = partos.length ? suma(partos, (x) => num(x.datos?.madres)) : null;
  const ternerosVivos = partos.length ? suma(partos, (x) => num(x.datos?.machos) + num(x.datos?.hembras)) : null;
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

// El plan de la decisión del diagnóstico (diseño §8), sin tocar la base.
//   lote: { id, cabezas, categoriaId, potreroId }
//   grupos: [{ clave, cabezas, destino, categoriaId? }], con destino:
//     { potreroId } · { venta: { precioVentaUsd?, precioVentaPor? } } ·
//     { invernada: true, potreroId? } · { reentore: true } · { despues: true }
// Devuelve { pasos, queda } o { error }. Los grupos que van al mismo potrero
// con la misma categoría se juntan en un lote. El lote original se queda con
// un bloque: el que no cambia nada; si no, el más grande de los que se quedan
// en el potrero (cambia de categoría al final); si todos se van, el más grande
// (se lleva el lote entero). Los demás son partes de la familia. Las ventas van
// primero. Las cabezas sin diagnosticar se quedan como estaban.
//   pasos: { tipo: 'VENTA', grupos, cabezas, venta } ·
//          { tipo: 'PARTE' | 'MOVER_ENTERO', grupos, cabezas, potreroId, categoriaId } ·
//          { tipo: 'CATEGORIA', grupos, cabezas, categoriaId }
export function planDecision({ lote, grupos }) {
  const total = grupos.reduce((s, g) => s + num(g.cabezas), 0);
  if (total > lote.cabezas) return { error: `El lote tiene ${lote.cabezas} cabezas: los grupos suman ${total}` };

  const ventas = [];
  const bloques = [];
  const agregar = (clave, cabezas, potreroId, categoriaId) => {
    const b = bloques.find((x) => x.potreroId === potreroId && x.categoriaId === categoriaId);
    if (b) {
      b.grupos.push(clave);
      b.cabezas += cabezas;
    } else {
      bloques.push({ grupos: [clave], cabezas, potreroId, categoriaId });
    }
  };
  for (const g of grupos) {
    const n = num(g.cabezas);
    if (n <= 0) continue;
    const d = g.destino ?? { despues: true };
    if (d.venta) ventas.push({ tipo: 'VENTA', grupos: [g.clave], cabezas: n, venta: d.venta });
    else if (d.despues || d.reentore) agregar(g.clave, n, lote.potreroId, g.categoriaId ?? lote.categoriaId);
    else agregar(g.clave, n, d.potreroId ?? lote.potreroId, g.categoriaId ?? lote.categoriaId);
  }
  if (total < lote.cabezas) agregar('sinDiagnostico', lote.cabezas - total, lote.potreroId, lote.categoriaId);

  const mayor = (lista) => lista.reduce((m, b) => (m == null || b.cabezas > m.cabezas ? b : m), null);
  const enPotrero = bloques.filter((b) => b.potreroId === lote.potreroId);
  const queda = enPotrero.find((b) => b.categoriaId === lote.categoriaId) ?? mayor(enPotrero) ?? mayor(bloques);

  const pasos = [...ventas];
  for (const b of bloques) {
    if (b !== queda) pasos.push({ tipo: 'PARTE', grupos: b.grupos, cabezas: b.cabezas, potreroId: b.potreroId, categoriaId: b.categoriaId });
  }
  if (queda && queda.potreroId !== lote.potreroId) {
    pasos.push({ tipo: 'MOVER_ENTERO', grupos: queda.grupos, cabezas: queda.cabezas, potreroId: queda.potreroId, categoriaId: queda.categoriaId });
  } else if (queda && queda.categoriaId !== lote.categoriaId) {
    pasos.push({ tipo: 'CATEGORIA', grupos: queda.grupos, cabezas: queda.cabezas, categoriaId: queda.categoriaId });
  }
  return { pasos, queda: queda?.grupos ?? [] };
}
