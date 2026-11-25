// Series chicas con la forma del Excel de INAC (docs/PRECIOS_INAC.md), para
// probar casos raros sin el archivo entero. Se arma la descripción con
// hojasInac(), el test la cambia (saca una hoja, cambia un título...) y
// crearSerie() la convierte en un .xlsx.
import ExcelJS from 'exceljs';

const CONTADO = 'VALORES CONTADO - PUESTO EN FRIGORIFICO';
const CORRIENTES = 'VALORES CORRIENTES - 45 DÍAS';
const CORRIENTES30 = 'VALORES CORRIENTES- 30 DÍAS';

const col = (bloque, columna, unidad, corta, clave) => ({ t: [bloque, columna, unidad, corta], clave });

// Bovinos: tres filas de títulos combinados + la corta. La corta de "A CAMPO"
// dice "ALevantar" a propósito: así viene en el Excel real.
const novillo = (p) => [
  col(CONTADO, 'EN PIE', 'USD/kg', 'Pie-Contado-Puesto-USD/kg', `${p}_PIE`),
  col(CONTADO, 'EN PRE-DRESSING', 'USD/Kg (a)', 'Predressing-Contado-Puesto-USD/kg'),
  col(CONTADO, 'EN CUARTA BALANZA', 'USD/Kg (b)', 'Cuarta-Contado-Puesto-USD/kg', `${p}_4TA`),
  col(CONTADO, 'EN CUARTA BALANZA', '% participación\n(b)', 'Cuarta-Contado-Puesto-%Particiación'),
  col(CONTADO, ' A CAMPO ', 'USD/kg  en                  cuarta balanza', 'Cuarta-corriente45-ALevantar-USD/kg', `${p}_CAMPO_4TA`),
  col(CONTADO, ' A CAMPO ', '% rendimiento ', 'Cuarta-corriente45-ALevantar-USD/kg'),
  col(CORRIENTES, 'PUESTO EN FRIGORIFICO', 'USD/kg en cuarta balanza ', 'Cuarta-ValCorrientes45-Puesto-USD/kg'),
  col(CORRIENTES, 'A LEVANTAR', 'USD/kg en cuarta balanza', '', `${p}_45D`),
  col(CORRIENTES, 'A LEVANTAR', '% participación (d)', ''),
  col(CORRIENTES, 'CAMPO A LEVANTAR', 'USD/kg  en                  cuarta balanza', 'Cuarta-corriente45-ALevantar-USD/kg', `${p}_CAMPO_45D`),
];

const vaca = () => [
  col(CONTADO, 'EN PIE', 'USD/kg', 'Pie-Contado-Puesto-USD/kg', 'VACA_PIE'),
  col(CONTADO, 'EN CUARTA BALANZA', 'USD/Kg (b)', 'Cuarta-Contado-Puesto-USD/kg', 'VACA_4TA'),
  col(CONTADO, 'EN CUARTA BALANZA', '% rendimiento \n(b)', 'Cuarta-Contado-Puesto-%Rendimiento'),
  col(CORRIENTES, 'PUESTO EN FRIGORIFICO', 'USD/kg en cuarta balanza ', 'Cuarta-ValCorrientes45-Puesto-USD/kg'),
  col(CORRIENTES, 'A LEVANTAR', 'USD/kg en cuarta balanza', 'Cuarta-corriente45-ALevantar-USD/kg', 'VACA_45D'),
];

// Ovinos: dos filas de títulos + la corta (la unidad va en la segunda o en la corta).
const cordero = () => [
  { t: [CONTADO, 'EN GANCHO\nUSD/kg', 'En Gancho-Contado-Puesto-USD/kg'], clave: 'CORDERO_GANCHO' },
  { t: [CONTADO, '% participación\n(a)', 'En Gancho-Contado-Puesto-Participación'] },
  { t: [CONTADO, 'A CAMPO ', 'USD/kg  en                  Gancho'], clave: 'CORDERO_CAMPO' },
  { t: [CONTADO, 'A CAMPO ', '% rendimiento '] },
  { t: [CORRIENTES30, 'CAMPO A LEVANTAR', 'USD/kg  en                  Gancho'], clave: 'CORDERO_CAMPO_30D' },
  { t: ['', 'CAMPO A LEVANTAR', '% Participación (b)'] },
];

const oveja = () => [
  { t: [CONTADO, 'EN GANCHO\nUSD/kg', 'En Gancho-Contado-Puesto-USD/kg'], clave: 'OVEJA_GANCHO' },
  { t: [CONTADO, '% participación\n(a)', 'En Gancho-Contado-Puesto-Participación'] },
];

// Precios de una semana "normal" (USD/kg).
export const VALORES_BASE = Object.freeze({
  NOVILLO_PIE: 3.4, NOVILLO_4TA: 6.1, NOVILLO_CAMPO_4TA: 6.09, NOVILLO_45D: 6.14, NOVILLO_CAMPO_45D: 6.08,
  VACA_PIE: 2.9, VACA_4TA: 5.7, VACA_45D: 5.66,
  VAQUILLONA_PIE: 3.3, VAQUILLONA_4TA: 5.98, VAQUILLONA_CAMPO_4TA: 5.95, VAQUILLONA_45D: 5.96, VAQUILLONA_CAMPO_45D: 5.94,
  CORDERO_GANCHO: 6.69, CORDERO_CAMPO: 6.69, CORDERO_CAMPO_30D: 6.57, OVEJA_GANCHO: 5.6,
});

export const SEMANAS_BASE = Object.freeze([
  { desde: '2026-11-08', hasta: '2026-11-14', valores: VALORES_BASE },
  { desde: '2026-11-15', hasta: '2026-11-21', valores: VALORES_BASE },
]);

export function hojasInac(semanas = SEMANAS_BASE) {
  return {
    NOVILLO: { cols: novillo('NOVILLO'), semanas },
    VACA: { cols: vaca(), semanas },
    VAQUILLONA: { cols: novillo('VAQUILLONA'), semanas },
    CORDERO: { cols: cordero(), semanas },
    OVEJA: { cols: oveja(), semanas },
  };
}

const fecha = (iso) => new Date(`${iso}T00:00:00Z`);

/**
 * @param {object} hojas lo que da hojasInac(), quizás cambiado.
 *   Cada hoja: { cols, semanas, filasExtra?: any[][] } (filasExtra va al final, tal cual).
 */
export async function crearSerie(hojas) {
  const wb = new ExcelJS.Workbook();
  for (const [nombre, hoja] of Object.entries(hojas)) {
    const ws = wb.addWorksheet(nombre);
    ws.getCell('B1').value = 'SERIE';
    ws.getCell('B2').value = `EVOLUCION SEMANAL DEL PRECIO (${nombre})`;
    const nTitulos = hoja.cols[0].t.length; // 4 en bovinos, 3 en ovinos
    const primera = 9; // el lector busca los títulos, no depende de la fila
    const fijas = ['Semana', 'Semana', 'Año', 'Mes', 'Sem'];
    const cortas = ['Sem_Inicio', 'Sem_Fin', 'Año', 'Mes', 'Sem'];
    for (let i = 0; i < nTitulos; i++) {
      const fila = ws.getRow(primera + i);
      const esCorta = i === nTitulos - 1;
      fijas.forEach((t, c) => { fila.getCell(c + 1).value = esCorta ? cortas[c] : t; });
      hoja.cols.forEach((cd, c) => { fila.getCell(c + 6).value = cd.t[i]; });
    }
    let r = primera + nTitulos;
    for (const s of hoja.semanas) {
      const fila = ws.getRow(r++);
      fila.getCell(1).value = s.desdeTexto ?? (s.desde ? fecha(s.desde) : null);
      fila.getCell(2).value = s.hasta ? fecha(s.hasta) : null;
      hoja.cols.forEach((cd, c) => {
        const v = cd.clave ? s.valores?.[cd.clave] : 55.5;
        if (v != null) fila.getCell(c + 6).value = v;
      });
    }
    for (const extra of hoja.filasExtra ?? []) {
      const fila = ws.getRow(r++);
      extra.forEach((v, c) => { if (v != null) fila.getCell(c + 1).value = v; });
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
