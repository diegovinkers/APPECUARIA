// Lector del Excel de INAC: el archivo real (fixture del 21/11/2026) y series
// chicas armadas con precios-fixture.js para los casos raros.
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashArchivo, leerSerieInac, sumarDias } from '../src/pecuaria/precios.inac.js';
import { validarSemana } from '../src/pecuaria/precios.validacion.js';
import { SEMANAS_BASE, VALORES_BASE, crearSerie, hojasInac } from './precios-fixture.js';

const REAL = new URL('./fixtures/inac/serie-semanal-2026-11-21.xlsx', import.meta.url);
const LENTO = { timeout: 120_000 };

// Los precios de la semana del 15/11 al 21/11/2026, comparados con el PDF.
const SEMANA_21_11 = {
  NOVILLO_PIE: 3.412, NOVILLO_4TA: 6.135, NOVILLO_CAMPO_4TA: 6.099, NOVILLO_45D: 6.142, NOVILLO_CAMPO_45D: 6.088,
  VACA_PIE: 2.929, VACA_4TA: 5.698, VACA_45D: 5.661,
  VAQUILLONA_PIE: 3.298, VAQUILLONA_4TA: 5.986, VAQUILLONA_CAMPO_4TA: 5.956, VAQUILLONA_45D: 5.967, VAQUILLONA_CAMPO_45D: 5.944,
  CORDERO_GANCHO: 6.691, CORDERO_CAMPO: 6.691, CORDERO_CAMPO_30D: 6.573, OVEJA_GANCHO: 5.599,
};

const semana = (lectura, desde) => lectura.semanas.find((s) => s.desde === desde);

describe('leerSerieInac con el Excel real (semana del 15/11 al 21/11/2026)', () => {
  let archivo;
  let lectura;
  beforeAll(async () => {
    archivo = await readFile(REAL);
    lectura = await leerSerieInac(archivo);
  }, 120_000);

  it('lee las cinco hojas sin errores', () => {
    expect(lectura.errores).toEqual([]);
    expect(lectura.semanas.length).toBeGreaterThan(1390);
  });

  it('la última semana tiene los 17 precios del informe', () => {
    const ultima = lectura.semanas.at(-1);
    expect(ultima.desde).toBe('2026-11-15');
    expect(ultima.hasta).toBe('2026-11-21');
    expect(ultima.valores).toEqual(SEMANA_21_11);
  });

  it('reconoce las columnas por los títulos combinados, no por la fila corta', () => {
    expect(lectura.columnas.NOVILLO_CAMPO_4TA).toEqual({ hoja: 'NOVILLO', columna: 13 });
    expect(lectura.columnas.NOVILLO_45D).toEqual({ hoja: 'NOVILLO', columna: 17 });
    expect(lectura.columnas.VACA_45D).toEqual({ hoja: 'VACA', columna: 15 });
    expect(lectura.columnas.CORDERO_CAMPO).toEqual({ hoja: 'CORDERO', columna: 9 });
    expect(lectura.columnas.OVEJA_GANCHO).toEqual({ hoja: 'OVEJA', columna: 6 });
  });

  it('trae el histórico desde el 2000, con los precios viejos tal cual', () => {
    const primera = lectura.semanas[0];
    expect(primera.desde).toBe('2000-01-02');
    expect(primera.valores.NOVILLO_PIE).toBe(0.715);
    expect(semana(lectura, '2026-11-08').valores.NOVILLO_PIE).toBe(3.449);
  });

  it('la fecha "31/02/2021" se arregla con el fin de la semana menos 6 días', () => {
    const s = semana(lectura, '2021-01-31');
    expect(s.hasta).toBe('2021-02-06');
    expect(s.valores.NOVILLO_PIE).toBe(1.783);
    expect(lectura.avisos.some((a) => a.startsWith('NOVILLO fila 1111') && a.includes('31/02/2021'))).toBe(true);
  });

  it('ignora las columnas sin título de OVEJA: la oveja arranca en 2017', () => {
    const conOveja = lectura.semanas.filter((s) => s.valores.OVEJA_GANCHO != null);
    expect(conOveja[0].desde >= '2017-01-01').toBe(true);
    expect(conOveja.at(-1).valores.OVEJA_GANCHO).toBe(5.599);
  });

  it('la última semana pasa la validación contra la anterior', () => {
    const [anterior, ultima] = lectura.semanas.slice(-2);
    const r = validarSemana({ semana: ultima, anterior, hoy: '2026-11-25' });
    expect(r).toMatchObject({ estado: 'OK', errores: [], marcas: [] });
  });

  it('hash: el mismo archivo da la misma huella', () => {
    expect(hashArchivo(archivo)).toBe('d9f69d6a33bafadcc1a4616ffb0498fda9a295a10b29705847a85c9be508ba27');
  });

  it('roto a mano: un título cambiado deja sin ese precio y lo dice', LENTO, async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(archivo);
    // "EN CUARTA BALANZA" del novillo (fila 11, columnas J a L) pasa a otro nombre.
    for (const c of ['J', 'K', 'L']) wb.getWorksheet('NOVILLO').getCell(`${c}11`).value = 'CUARTA BZA.';
    // Sin estas hojas: dicen tener 16.384 columnas y exceljs se queda sin
    // memoria al volver a guardarlas. De paso, prueba que falten hojas.
    for (const hoja of ['VAQUILLONA', 'CORDERO', 'OVEJA']) wb.removeWorksheet(wb.getWorksheet(hoja).id);
    const roto = await leerSerieInac(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(roto.errores).toEqual([
      'No encontré la columna de Novillo en 4ta balanza en la hoja NOVILLO.',
      expect.stringMatching(/^Falta la hoja VAQUILLONA/),
      expect.stringMatching(/^Falta la hoja CORDERO/),
      'Falta la hoja OVEJA (Oveja en gancho).',
    ]);
    const ultima = roto.semanas.at(-1);
    expect(ultima.valores.NOVILLO_4TA).toBeUndefined();
    expect(ultima.valores.NOVILLO_PIE).toBe(3.412);
    expect(validarSemana({ semana: ultima, hoy: '2026-11-25' }).estado).toBe('ERROR');
  });
});

describe('leerSerieInac con series chicas', () => {
  it('lee una serie con la forma de INAC', async () => {
    const lectura = await leerSerieInac(await crearSerie(hojasInac()));
    expect(lectura.errores).toEqual([]);
    expect(lectura.avisos).toEqual([]);
    expect(lectura.semanas).toEqual(SEMANAS_BASE.map((s) => ({ ...s, valores: { ...VALORES_BASE } })));
  });

  it('una columna nueva al principio no cambia nada: se busca por título', async () => {
    const hojas = hojasInac();
    hojas.NOVILLO.cols.unshift({ t: ['VALORES NUEVOS', 'OTRA COSA', 'USD/kg', 'Nueva'] });
    const lectura = await leerSerieInac(await crearSerie(hojas));
    expect(lectura.errores).toEqual([]);
    expect(lectura.columnas.NOVILLO_PIE.columna).toBe(7);
    expect(lectura.semanas.at(-1).valores.NOVILLO_PIE).toBe(3.4);
  });

  it('falta una hoja: error y la semana queda sin esos precios', async () => {
    const hojas = hojasInac();
    delete hojas.VACA;
    const lectura = await leerSerieInac(await crearSerie(hojas));
    expect(lectura.errores).toEqual(['Falta la hoja VACA (Vaca en pie, Vaca en 4ta balanza, Vaca 45 días a levantar).']);
    const r = validarSemana({ semana: lectura.semanas.at(-1), hoy: '2026-11-25' });
    expect(r.estado).toBe('ERROR');
    expect(r.errores).toContain('Falta el precio de Vaca en 4ta balanza.');
  });

  it('dos columnas que podrían ser el mismo precio: error, no adivina', async () => {
    const hojas = hojasInac();
    hojas.VACA.cols.push({ t: ['VALORES CONTADO', 'EN PIE (otra)', 'USD/kg', ''] });
    const lectura = await leerSerieInac(await crearSerie(hojas));
    expect(lectura.errores).toEqual(['En la hoja VACA hay 2 columnas que podrían ser Vaca en pie.']);
    expect(lectura.semanas.at(-1).valores.VACA_PIE).toBeUndefined();
  });

  it('sin la fila "Sem_Inicio" no hay títulos', async () => {
    const hojas = hojasInac();
    const wbBuf = await crearSerie(hojas);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(wbBuf);
    const ws = wb.getWorksheet('OVEJA');
    ws.getCell('A11').value = 'Inicio';
    const lectura = await leerSerieInac(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(lectura.errores).toEqual(['No encontré los títulos de la hoja OVEJA (la fila que empieza con "Sem_Inicio").']);
  });

  it('filas raras: inicio en texto, sin fechas, precio que no es número, renglón vacío al final', async () => {
    const semanas = [
      { desdeTexto: '31/02/2021', hasta: '2021-02-06', valores: VALORES_BASE },
      { desde: '2021-02-07', hasta: '2021-02-13', valores: { ...VALORES_BASE, NOVILLO_PIE: 'n/d' } },
      { valores: VALORES_BASE },
      { desde: '2021-02-14', hasta: null, valores: VALORES_BASE },
    ];
    const hojas = hojasInac(semanas);
    hojas.NOVILLO.filasExtra = [[null, '      ']];
    const lectura = await leerSerieInac(await crearSerie(hojas));
    expect(lectura.errores).toEqual([]);
    expect(lectura.semanas.map((s) => [s.desde, s.hasta])).toEqual([
      ['2021-01-31', '2021-02-06'],
      ['2021-02-07', '2021-02-13'],
      ['2021-02-14', '2021-02-20'],
    ]);
    expect(lectura.semanas[1].valores.NOVILLO_PIE).toBeUndefined();
    expect(lectura.avisos).toEqual(expect.arrayContaining([
      expect.stringMatching(/^NOVILLO fila \d+: el inicio de la semana \("31\/02\/2021"\) no es una fecha/),
      expect.stringMatching(/^NOVILLO fila \d+: el precio de NOVILLO_PIE no es un número/),
      expect.stringMatching(/^NOVILLO fila \d+: tiene precios pero no tiene fechas/),
    ]));
  });

  it('un archivo que no es Excel', async () => {
    const lectura = await leerSerieInac(Buffer.from('<html>no encontrado</html>'));
    expect(lectura).toEqual({ semanas: [], columnas: {}, errores: ['El archivo no es un Excel que se pueda leer.'], avisos: [] });
  });

  it('sumarDias', () => {
    expect(sumarDias('2026-11-15', 6)).toBe('2026-11-21');
    expect(sumarDias('2021-02-06', -6)).toBe('2021-01-31');
    expect(sumarDias('2024-02-27', 3)).toBe('2024-03-01');
  });
});
