// Lee la planilla de cargas del encargado (.xlsx) y la deja normalizada.
// No toca la base: devuelve lo leído, con advertencias (se puede importar
// igual) y errores (hay que corregir la planilla). Las trampas que resuelve
// están en docs/PECUARIA.md §2.
import ExcelJS from 'exceljs';
import { normalizarTexto } from './normalizar.js';

export class PlanillaError extends Error {}

// Columnas por nombre (el orden cambia entre hojas). clave → cómo reconocerla.
const COLUMNAS = {
  campo: { nombre: 'Campo', es: (t) => t === 'campo' },
  uso: { nombre: 'Uso de Suelo', es: (t) => t === 'uso de suelo', opcional: true },
  potrero: { nombre: 'Potrero', es: (t) => t === 'potrero' },
  has: { nombre: 'Has', es: (t) => ['has', 'ha', 'hectareas'].includes(t) },
  categoria: { nombre: 'Categoria', es: (t) => t === 'categoria' },
  cabezas: { nombre: 'N° cabezas', es: (t) => t.includes('cabezas') },
  promedio: { nombre: 'Promedio', es: (t) => t === 'promedio' },
  kilos: { nombre: 'Kilos lote', es: (t) => t === 'kilos lote', opcional: true },
};

// "13.11.2026" (o 13-11-2026, 13/11/2026) → "2026-11-13". null si no hay fecha válida.
function fechaDelNombre(nombre) {
  const m = /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(nombre);
  if (!m) return null;
  const [dia, mes, anio] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
  return fecha.toISOString().slice(0, 10);
}

// El valor que se ve en la celda: resultado de las fórmulas, texto enriquecido
// unido, y los errores de Excel (#DIV/0!) como vacío.
function valor(v) {
  if (v == null) return null;
  if (typeof v === 'object' && !(v instanceof Date)) {
    if ('error' in v) return null;
    if ('result' in v) return valor(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return v.text;
    return null;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    return s === '' || s.startsWith('#') ? null : s;
  }
  return v;
}

// Número de la planilla: acepta 82.83 o "82,83". null si está vacío, NaN si no es un número.
function numero(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  return Number(String(v).replace(',', '.'));
}

// El nombre del potrero como texto estable: sin espacios de más, sin espacios
// alrededor de "/", y "45,1" como "45.1".
function nombrePotrero(v) {
  if (typeof v === 'number') return String(v);
  return String(v)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/(\d),(\d)/g, '$1.$2');
}

// "8.2/3/4/5" → 8.2, 8.3, 8.4, 8.5 ; "2/3/3.1" → 2, 3, 3.1 ; "8 y 10" → 8, 10.
// Si el primero tiene punto, los siguientes sin punto heredan su prefijo.
// Un potrero suelto no tiene subdivisiones.
export function separarSubdivisiones(nombre) {
  const partes = String(nombre)
    .split(/\s*\/\s*|\s+y\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length < 2) return [];
  const [primera, ...resto] = partes;
  const punto = primera.lastIndexOf('.');
  const prefijo = /^\d/.test(primera) && punto >= 0 ? primera.slice(0, punto + 1) : '';
  const codigos = [primera, ...resto.map((p) => (prefijo && !/[.,]/.test(p) ? prefijo + p : p.replace(',', '.')))];
  return [...new Set(codigos)];
}

const lista = (n, singular, plural) => (n === 1 ? singular : plural);

// buffer: el .xlsx. hoja: cuál leer (por defecto, la de fecha más reciente).
// campo: la sigla a importar (v1: EG).
export async function leerPlanilla(buffer, { hoja, campo = 'EG' } = {}) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new PlanillaError('El archivo no es una planilla de Excel (.xlsx) válida');
  }

  const hojas = wb.worksheets.map((ws) => ({ nombre: ws.name, fecha: fechaDelNombre(ws.name) }));
  let elegida;
  if (hoja) {
    elegida = hojas.find((h) => h.nombre === hoja);
    if (!elegida) throw new PlanillaError(`No existe la hoja "${hoja}" en la planilla`);
  } else {
    const conFecha = hojas.filter((h) => h.fecha && !/corral/i.test(h.nombre));
    if (conFecha.length === 0) {
      throw new PlanillaError('No encontré una hoja con fecha en el nombre (por ejemplo "13.11.2026")');
    }
    elegida = conFecha.reduce((a, b) => (b.fecha > a.fecha ? b : a));
  }

  const ws = wb.getWorksheet(elegida.nombre);
  const sigla = campo.toUpperCase();
  const potreros = new Map();
  const otrosCampos = {};
  const advertencias = [];
  const errores = [];
  const numericos = new Set();
  let columnas = null;
  let faltantes = null;

  ws.eachRow({ includeEmpty: false }, (row, numFila) => {
    const celdas = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      celdas[col] = valor(cell.value);
    });

    // ¿Es un encabezado? (se repite antes de cada bloque de campo)
    const textos = celdas.map((c) => normalizarTexto(c));
    if (textos.includes('campo') && textos.includes('potrero')) {
      columnas = {};
      for (const [clave, def] of Object.entries(COLUMNAS)) {
        const col = textos.findIndex((t) => t && def.es(t));
        if (col >= 0) columnas[clave] = col;
      }
      const sinColumna = Object.entries(COLUMNAS).filter(([clave, def]) => !def.opcional && columnas[clave] == null);
      if (sinColumna.length) faltantes = sinColumna.map(([, def]) => def.nombre);
      return;
    }
    if (!columnas || faltantes) return;

    const campoFila = valor(celdas[columnas.campo]);
    const potreroCrudo = celdas[columnas.potrero];
    if (campoFila == null || potreroCrudo == null || normalizarTexto(potreroCrudo) === 'total') return;
    const siglaFila = String(campoFila).trim().toUpperCase();
    if (siglaFila !== sigla) {
      otrosCampos[siglaFila] = (otrosCampos[siglaFila] ?? 0) + 1;
      return;
    }

    const nombre = nombrePotrero(potreroCrudo);
    if (typeof potreroCrudo === 'number') numericos.add(nombre);
    const has = numero(celdas[columnas.has]);
    const hectareas = Number.isFinite(has) && has > 0 ? has : null;
    const usoTexto = columnas.uso == null ? '' : String(celdas[columnas.uso] ?? '').trim();

    let p = potreros.get(nombre);
    if (!p) {
      p = {
        fila: numFila,
        nombre,
        subdivisiones: separarSubdivisiones(nombre),
        hectareas,
        hectareasAConfirmar: hectareas == null || hectareas === 1,
        usoTexto,
        lineas: [],
      };
      potreros.set(nombre, p);
    } else if (p.hectareas !== hectareas) {
      advertencias.push(`Potrero ${nombre}: aparece dos veces con distintas hectáreas (${p.hectareas} y ${hectareas}); se toma la primera`);
    }

    const cabezasCrudas = celdas[columnas.cabezas];
    const cabezas = numero(cabezasCrudas) ?? 0;
    if (!Number.isInteger(cabezas) || cabezas < 0) {
      errores.push(`Fila ${numFila} (potrero ${nombre}): "${cabezasCrudas}" no es una cantidad de cabezas`);
      return;
    }
    if (cabezas === 0) return;

    const categoriaTexto = celdas[columnas.categoria] == null ? '' : String(celdas[columnas.categoria]).trim();
    if (!categoriaTexto) {
      errores.push(`Fila ${numFila} (potrero ${nombre}): hay ${cabezas} cabezas sin categoría`);
      return;
    }
    if (p.lineas.some((l) => normalizarTexto(l.categoriaTexto) === normalizarTexto(categoriaTexto))) {
      errores.push(`Potrero ${nombre}: la categoría "${categoriaTexto}" aparece dos veces`);
      return;
    }

    const prom = numero(celdas[columnas.promedio]);
    const pesoPromedioKg = Number.isFinite(prom) && prom > 0 ? prom : null;
    p.lineas.push({ categoriaTexto, cabezas, pesoPromedioKg });

    const kilos = columnas.kilos == null ? null : numero(celdas[columnas.kilos]);
    if (pesoPromedioKg && Number.isFinite(kilos) && kilos > 0 && Math.abs(kilos - cabezas * pesoPromedioKg) > 1) {
      advertencias.push(
        `Potrero ${nombre}: la planilla dice ${kilos} kg, pero cabezas × promedio da ${Math.round(cabezas * pesoPromedioKg)} kg (la app usa el cálculo)`,
      );
    }
  });

  if (faltantes) {
    throw new PlanillaError(`Faltan columnas en la hoja "${elegida.nombre}": ${faltantes.join(', ')}`);
  }
  if (!columnas) {
    throw new PlanillaError(`La hoja "${elegida.nombre}" no tiene un encabezado con las columnas Campo y Potrero`);
  }

  // Excel guarda "72.10" como el número 72.1. Si ese código ya es parte de un
  // potrero agrupado ("72.1/2"), en realidad era el 72.10.
  const subdivisiones = new Map();
  for (const p of potreros.values()) for (const s of p.subdivisiones) subdivisiones.set(s, p.nombre);
  const resultado = [];
  for (const p of potreros.values()) {
    if (numericos.has(p.nombre) && /^\d+\.\d$/.test(p.nombre) && subdivisiones.has(p.nombre)) {
      const corregido = `${p.nombre}0`;
      advertencias.push(
        `Se leyó el potrero "${p.nombre}", pero ese código ya es parte de "${subdivisiones.get(p.nombre)}": ` +
          `se tomó como "${corregido}" (Excel borra el cero final). Revisalo.`,
      );
      resultado.push({ ...p, nombre: corregido });
    } else {
      resultado.push(p);
    }
  }

  const aConfirmar = resultado.filter((p) => p.hectareasAConfirmar).map((p) => p.nombre);
  if (aConfirmar.length) {
    advertencias.unshift(
      `${aConfirmar.length} ${lista(aConfirmar.length, 'potrero tiene', 'potreros tienen')} hectáreas de relleno (1) o vacías ` +
        `y ${lista(aConfirmar.length, 'queda', 'quedan')} "a confirmar": ${aConfirmar.join(', ')}`,
    );
  }
  const sinPeso = resultado.flatMap((p) =>
    p.lineas.filter((l) => l.pesoPromedioKg == null).map((l) => ({ potrero: p.nombre, cabezas: l.cabezas })),
  );
  if (sinPeso.length) {
    advertencias.push(
      `${sinPeso.length} ${lista(sinPeso.length, 'potrero tiene', 'potreros tienen')} cabezas sin peso promedio ` +
        `(los kilos y las UG quedan incompletos): ${sinPeso.map((s) => `${s.potrero} (${s.cabezas})`).join(', ')}`,
    );
  }

  return {
    hojas,
    hoja: elegida.nombre,
    fechaDatos: elegida.fecha,
    campo: sigla,
    potreros: resultado,
    otrosCampos,
    advertencias,
    errores,
  };
}
