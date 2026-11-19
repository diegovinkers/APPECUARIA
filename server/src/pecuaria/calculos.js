// Cálculos de carga de un potrero. Nunca se guardan: se calculan cada vez,
// así no quedan totales viejos como en la planilla.
//   Kilos     = cabezas × peso promedio. Un lote sin peso usa el peso
//               promedio de su categoría (kilos "estimados"); si tampoco hay,
//               no suma.
//   Valor     = kilos × precio (por kilo) o cabezas × precio (por cabeza),
//               con el precio de la categoría.
//   Cab./ha   = cabezas / hectáreas
//   Kg PV/ha  = kilos / hectáreas
//   UG/ha     = Kg PV/ha / kg por UG (parámetro, hoy 380)
// Las hectáreas de la carga son el área utilizable, si está cargada (lo que
// usa de verdad el uso de suelo), o si no las del potrero. Sin hectáreas, o
// con hectáreas "a confirmar" y sin área utilizable, no hay valores por hectárea.

const r2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v == null ? null : Number(v));

// Las hectáreas sobre las que se calcula la carga de un potrero (o null).
export function hectareasDeCarga({ hectareas, hectareasAConfirmar, areaUtilizable }) {
  const area = num(areaUtilizable);
  if (area > 0) return area;
  const ha = num(hectareas);
  return !hectareasAConfirmar && ha > 0 ? ha : null;
}

// El área utilizable no puede ser mayor que las hectáreas (si se conocen).
// Devuelve el mensaje de error, o null si está bien.
export function problemaArea({ hectareas, hectareasAConfirmar, areaUtilizable }) {
  const area = num(areaUtilizable);
  const ha = num(hectareas);
  if (area == null || hectareasAConfirmar || ha == null || area <= ha) return null;
  return `El área utilizable (${area} ha) no puede ser mayor que las hectáreas (${ha})`;
}

// parametros: el número de kg por UG, o { kgPorUg, categorias } con
// categorias = Map(categoriaId → { pesoPromedioKg, precioUsd, precioPor })
// (ver stock.service.js: parametrosCarga). Cada línea: { categoriaId,
// cabezas, pesoPromedioKg }.
export function calcularPotrero({ hectareas, hectareasAConfirmar, areaUtilizable = null, lineas }, parametros) {
  const { kgPorUg, categorias = null } = typeof parametros === 'number' ? { kgPorUg: parametros } : parametros;
  let cabezas = 0;
  let kilos = 0;
  let kilosCompletos = true;
  let kilosEstimados = false;
  let valor = 0;
  let valorCompleto = true;
  for (const l of lineas) {
    if (!l.cabezas) continue;
    cabezas += l.cabezas;
    const cat = categorias?.get(l.categoriaId);
    const peso = l.pesoPromedioKg || cat?.pesoPromedioKg || null;
    if (peso) kilos += l.cabezas * peso;
    else kilosCompletos = false;
    if (peso && !l.pesoPromedioKg) kilosEstimados = true;
    if (!cat?.precioUsd) valorCompleto = false;
    else if (cat.precioPor === 'CABEZA') valor += l.cabezas * cat.precioUsd;
    else if (peso) valor += l.cabezas * peso * cat.precioUsd;
    else valorCompleto = false;
  }
  const ha = hectareasDeCarga({ hectareas, hectareasAConfirmar, areaUtilizable });
  return {
    cabezas,
    kilos: r2(kilos),
    kilosCompletos,
    kilosEstimados,
    // Sin los datos de las categorías no se sabe el valor.
    valorUsd: categorias ? r2(valor) : null,
    valorCompleto: categorias ? valorCompleto : false,
    cabHa: ha ? r2(cabezas / ha) : null,
    kgPvHa: ha ? r2(kilos / ha) : null,
    ugHa: ha ? r2(kilos / ha / kgPorUg) : null,
  };
}

export const kilosLinea = (l) => (l.pesoPromedioKg ? r2(l.cabezas * l.pesoPromedioKg) : null);
