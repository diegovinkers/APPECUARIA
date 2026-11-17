// Arma en memoria una planilla de cargas FICTICIA, con las mismas trampas que
// la real (docs/PECUARIA.md §2): una hoja por fecha, columnas en distinto
// orden, números con coma, potreros agrupados, hectáreas de relleno, filas
// "Total", otros campos y una hoja de corrales.
import ExcelJS from 'exceljs';

export const ENCABEZADO = ['Campo', 'Uso de Suelo', 'Potrero', 'Has', 'Categoria', 'N° cabezas', 'Cab./ha', 'Promedio', 'Kilos lote', 'Kg PV/ha', 'UG/ha', 'Fecha'];

// hojas: { nombre: filas[] } (cada fila es un array de celdas).
export async function crearPlanilla(hojas) {
  // Ojo: el .xlsx es un ZIP con la hora en que se armó. El mismo contenido
  // armado en otro momento es otro archivo (otra huella).
  const wb = new ExcelJS.Workbook();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = wb.addWorksheet(nombre);
    for (const fila of filas) ws.addRow(fila);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Una fila con las columnas del ENCABEZADO. Las calculadas van con basura a
// propósito: la app no las usa.
export const fila = (campo, uso, potrero, has, categoria, cabezas, promedio, kilos = undefined) => [
  campo,
  uso,
  potrero,
  has,
  categoria,
  cabezas,
  '9,9',
  promedio,
  kilos ?? (cabezas && promedio ? cabezas * promedio : 0),
  0,
  '#DIV/0!',
  null,
];

// La hoja "normal" de un campo ficticio EJ, más un bloque de otro campo (OT).
export const HOJA_EJ = [
  ENCABEZADO,
  fila('EJ', 'Raygras', '1.1', 50.5, 'Terneros', 100, 200),
  fila('EJ', 'FESTUCA NUEVA', '2.2/3/4', '120,25', 'Ternero chicos', 80, 180),
  fila('EJ', 'CN', 'P 7', 1, 'Vacas', 150, 450),
  fila('EJ', 'CN', 'P 8', 1, 'Vacas paridas', 90, null),
  fila('EJ', '', 'Pivot 9', 40, null, 0, null),
  fila('EJ', 'SEMILLERO', '3.5', 12, 'Semillero', 0, null),
  [null, null, 'Total', 999, null, 999, null, null, 1, null, null, null],
  ENCABEZADO,
  fila('OT', 'Raygras', '1', 10, 'Novillos', 30, 220),
  [null, null, 'Total', 10, null, 30, null, null, 6600, null, null, null],
];
