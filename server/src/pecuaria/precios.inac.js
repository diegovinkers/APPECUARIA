// Lectura de los precios de hacienda de INAC (docs/PRECIOS_INAC.md).
// Todo lo de este archivo es puro: recibe el archivo ya bajado y devuelve lo
// leído. La descarga, el guardado y la importación van en el servicio.
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { normalizarTexto } from './normalizar.js';
import { HOJAS, INDICADORES } from './precios.indicadores.js';

// Hasta qué columna se buscan títulos. Algunas hojas dicen tener 16.384
// columnas (formato vacío); los datos de verdad terminan antes de la 25.
const MAX_COLUMNAS = 60;
// Hasta qué fila se buscan los títulos.
const MAX_FILA_TITULOS = 40;
const DIA_MS = 86_400_000;

// Dónde está cada cosa (docs/PRECIOS_INAC.md §1). El Excel se busca en la
// página por su título; la URL fija es el respaldo.
export const INAC = Object.freeze({
  PAGINA: 'https://www.inac.uy/innovaportal/v/5541/37/innova.bs/precios',
  EXCEL: 'https://www.inac.uy/innovaportal/file/10952/1/webinac---serie-semanal-precios-de-hacienda.xlsx',
  PDF: 'https://www.inac.uy/innovaportal/file/17274/1/precios-de-hacienda-bovina-y-ovina.pdf',
  TITULO_EXCEL: 'serie semanal precios de hacienda',
});

// Cómo se presenta la app al bajar los archivos. El contacto (opcional) sale
// de PRECIOS_CONTACTO: no va en el código.
export function userAgent(contacto) {
  return `SAPSA-app (uso interno${contacto ? `; contacto: ${contacto}` : ''})`;
}

const decodificar = (html) => html
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
  .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
  .replace(/&amp;/g, '&');

// El enlace del Excel semanal en la página de INAC: el <a href="….xlsx"> que
// tiene adentro el título "Serie semanal precios de hacienda" (no la mensual).
// null si no está.
export function buscarEnlaceSerie(html, base = INAC.PAGINA) {
  const enlaces = String(html ?? '').matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]+\.xlsx)"[^>]*>([\s\S]*?)<\/a>/gi);
  for (const [, href, adentro] of enlaces) {
    if (normalizarTexto(decodificar(adentro)).includes(INAC.TITULO_EXCEL)) {
      try {
        return new URL(href, base).toString();
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Para Claude, cuando el Excel bajó pero no se pudo leer: cada hoja con sus
// títulos (las filas de arriba) y las últimas semanas, en CSV. Sin las
// columnas de más (algunas hojas dicen tener 16.384).
export async function excelComoCsv(archivo, { semanas = 3, columnas = 24, filasTitulo = 14 } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(archivo);
  const celda = (v) => {
    const t = fechaIso(v) ?? textoCelda(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const partes = [];
  for (const ws of wb.worksheets) {
    const fila = (r) => {
      const row = ws.getRow(r);
      const valores = [];
      for (let c = 1; c <= columnas; c++) valores.push(celda(row.getCell(c).value).replace(/\s+/g, ' ').trim());
      while (valores.length && !valores.at(-1)) valores.pop();
      return valores.join(',');
    };
    let ultima = 0;
    for (let r = ws.rowCount; r >= 1 && !ultima; r--) if (fechaIso(ws.getRow(r).getCell(1).value) || fechaIso(ws.getRow(r).getCell(2).value)) ultima = r;
    const filas = [];
    for (let r = 1; r <= Math.min(filasTitulo, ws.rowCount); r++) filas.push(fila(r));
    for (let r = Math.max(filasTitulo + 1, ultima - semanas + 1); r <= ultima; r++) filas.push(fila(r));
    partes.push(`### Hoja ${ws.name}\n${filas.filter(Boolean).join('\n')}`);
  }
  return partes.join('\n\n');
}

export function hashArchivo(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function sumarDias(iso, dias) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

// exceljs devuelve las fechas de Excel como Date en UTC.
function fechaIso(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  if (valor && typeof valor === 'object' && valor.result instanceof Date) return fechaIso(valor.result);
  return null;
}

function textoCelda(valor) {
  if (valor == null) return '';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number') return String(valor);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (valor.richText) return valor.richText.map((r) => r.text).join('');
  if (valor.result !== undefined) return textoCelda(valor.result);
  return '';
}

// Un precio: número (o fórmula con resultado). Vacío = null. Texto que no es un
// número = NaN (el lector lo avisa).
function numero(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;
  if (typeof valor === 'object' && valor.result !== undefined) return numero(valor.result);
  if (typeof valor === 'string') {
    const t = valor.trim();
    if (!t) return null;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

const redondear = (n) => Math.round(n * 1000) / 1000;

// Busca los títulos: la fila corta empieza con "Sem_Inicio" y, arriba, las
// filas que empiezan con "Semana" (los títulos combinados).
function buscarTitulos(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, MAX_FILA_TITULOS); r++) {
    if (normalizarTexto(textoCelda(ws.getRow(r).getCell(1).value)) !== 'sem_inicio') continue;
    const filas = [];
    for (let k = r - 1; k >= 1 && normalizarTexto(textoCelda(ws.getRow(k).getCell(1).value)) === 'semana'; k--) {
      filas.unshift(k);
    }
    if (filas.length < 2) return null;
    return { filas, filaCorta: r };
  }
  return null;
}

function titulosDeColumna(ws, filas, c) {
  return filas.map((r) => normalizarTexto(textoCelda(ws.getRow(r).getCell(c).value)));
}

// Columna de cada indicador de la hoja, por los títulos: la primera fila tiene
// el bloque ("contado" / "corrientes"), la segunda empieza con la columna ("en
// pie", "a campo"...), y es la de USD/kg (ningún título con "%").
function columnasDeHoja(ws, indicadores, titulos) {
  const filas = [...titulos.filas, titulos.filaCorta];
  const ultima = Math.min(ws.columnCount || MAX_COLUMNAS, MAX_COLUMNAS);
  const columnas = [];
  for (let c = 3; c <= ultima; c++) columnas.push({ c, t: titulosDeColumna(ws, filas, c) });

  const encontradas = {};
  const errores = [];
  for (const ind of indicadores) {
    const { bloque, columna } = ind.excel;
    const candidatas = columnas.filter(({ t }) =>
      t[0].includes(bloque)
      && t[1].startsWith(columna)
      && !t.some((x) => x.includes('%'))
      && t.some((x) => x.includes('usd/kg')));
    if (candidatas.length === 1) encontradas[ind.clave] = candidatas[0].c;
    else if (candidatas.length === 0) errores.push(`No encontré la columna de ${ind.nombre} en la hoja ${ws.name}.`);
    else errores.push(`En la hoja ${ws.name} hay ${candidatas.length} columnas que podrían ser ${ind.nombre}.`);
  }
  return { encontradas, errores };
}

function leerHoja(ws, indicadores, semanas, avisos) {
  const titulos = buscarTitulos(ws);
  if (!titulos) return { errores: [`No encontré los títulos de la hoja ${ws.name} (la fila que empieza con "Sem_Inicio").`], columnas: {} };
  const { encontradas, errores } = columnasDeHoja(ws, indicadores, titulos);
  const claves = Object.keys(encontradas);
  if (!claves.length) return { errores, columnas: {} };

  for (let r = titulos.filaCorta + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const a = row.getCell(1).value;
    const b = row.getCell(2).value;
    let desde = fechaIso(a);
    let hasta = fechaIso(b);

    const valores = {};
    let hayValor = false;
    for (const clave of claves) {
      const n = numero(row.getCell(encontradas[clave]).value);
      if (Number.isNaN(n)) {
        avisos.push(`${ws.name} fila ${r}: el precio de ${clave} no es un número; lo salteo.`);
        continue;
      }
      if (n != null) {
        valores[clave] = redondear(n);
        hayValor = true;
      }
    }

    if (!desde && !hasta) {
      if (hayValor) avisos.push(`${ws.name} fila ${r}: tiene precios pero no tiene fechas; la salteo.`);
      continue;
    }
    if (!desde) {
      avisos.push(`${ws.name} fila ${r}: el inicio de la semana ("${textoCelda(a).trim()}") no es una fecha; uso el fin menos 6 días.`);
      desde = sumarDias(hasta, -6);
    }
    if (!hasta) hasta = sumarDias(desde, 6);
    if (!hayValor) continue;

    const semana = semanas.get(desde) ?? { desde, hasta, valores: {} };
    if (semana.hasta !== hasta) avisos.push(`${ws.name} fila ${r}: la semana del ${desde} termina el ${hasta} y en otra hoja el ${semana.hasta}.`);
    Object.assign(semana.valores, valores);
    semanas.set(desde, semana);
  }
  return { errores, columnas: Object.fromEntries(claves.map((k) => [k, { hoja: ws.name, columna: encontradas[k] }])) };
}

/**
 * Lee la serie semanal de INAC.
 * @param {Buffer|ArrayBuffer} archivo el .xlsx
 * @returns {{ semanas: {desde, hasta, valores}[], columnas, errores: string[], avisos: string[] }}
 *   semanas de la más vieja a la más nueva; valores en USD/kg con 3 decimales.
 *   errores: lo que falta o cambió (hojas, columnas). avisos: filas raras.
 */
export async function leerSerieInac(archivo) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(archivo);
  } catch {
    return { semanas: [], columnas: {}, errores: ['El archivo no es un Excel que se pueda leer.'], avisos: [] };
  }

  const semanas = new Map();
  const errores = [];
  const avisos = [];
  const columnas = {};
  for (const hoja of HOJAS) {
    const ws = wb.worksheets.find((w) => normalizarTexto(w.name) === normalizarTexto(hoja));
    const indicadores = INDICADORES.filter((i) => i.excel.hoja === hoja);
    if (!ws) {
      errores.push(`Falta la hoja ${hoja} (${indicadores.map((i) => i.nombre).join(', ')}).`);
      continue;
    }
    const leida = leerHoja(ws, indicadores, semanas, avisos);
    errores.push(...leida.errores);
    Object.assign(columnas, leida.columnas);
  }

  return {
    semanas: [...semanas.values()].sort((x, y) => x.desde.localeCompare(y.desde)),
    columnas,
    errores,
    avisos,
  };
}
