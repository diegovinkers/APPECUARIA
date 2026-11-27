import { describe, expect, it } from 'vitest';
import { leerPlanilla, separarSubdivisiones } from '../src/pecuaria/planilla.parser.js';
import { ENCABEZADO, HOJA_EJ, crearPlanilla, fila } from './planilla-fixture.js';

const leer = async (hojas, opciones = {}) => leerPlanilla(await crearPlanilla(hojas), { campo: 'EJ', ...opciones });
const potrero = (lectura, nombre) => lectura.potreros.find((p) => p.nombre === nombre);

describe('separarSubdivisiones (potreros agrupados de la planilla)', () => {
  it.each([
    ['8.2/3/4/5', ['8.2', '8.3', '8.4', '8.5']],
    ['8.8/9', ['8.8', '8.9']],
    ['11.1/2/3', ['11.1', '11.2', '11.3']],
    ['2/3/3.1', ['2', '3', '3.1']],
    ['5/5.3/6', ['5', '5.3', '6']],
    ['9/9.1', ['9', '9.1']],
    ['P12/P13', ['P12', 'P13']],
    ['8 y 10', ['8', '10']],
    ['19 y 19.1', ['19', '19.1']],
  ])('"%s" → %j', (nombre, esperado) => {
    expect(separarSubdivisiones(nombre)).toEqual(esperado);
  });

  it('un potrero suelto no tiene subdivisiones', () => {
    for (const nombre of ['42.1', '44.2a', '91.1B', 'Frente A', 'P 15']) {
      expect(separarSubdivisiones(nombre)).toEqual([]);
    }
  });
});

describe('leerPlanilla', () => {
  it('elige la hoja más reciente por la fecha del nombre, sin la de corrales', async () => {
    const lectura = await leer({
      '3.11.2026': HOJA_EJ,
      'corral 20.11.2026': [['Corral', 'Cabezas']],
      '13.11.2026': HOJA_EJ,
    });
    expect(lectura.hoja).toBe('13.11.2026');
    expect(lectura.fechaDatos).toBe('2026-11-13');
    expect(lectura.hojas.map((h) => h.nombre)).toEqual(['3.11.2026', 'corral 20.11.2026', '13.11.2026']);
  });

  it('se puede pedir otra hoja; si no existe, avisa', async () => {
    const lectura = await leer({ '3.11.2026': HOJA_EJ, '13.11.2026': HOJA_EJ }, { hoja: '3.11.2026' });
    expect(lectura.hoja).toBe('3.11.2026');
    await expect(leer({ '13.11.2026': HOJA_EJ }, { hoja: '1.1.2026' })).rejects.toThrow(/No existe la hoja "1.1.2026"/);
  });

  it('lee solo el campo pedido, saltea los "Total" y cuenta las filas de otros campos', async () => {
    const lectura = await leer({ '13.11.2026': HOJA_EJ });
    expect(lectura.potreros.map((p) => p.nombre)).toEqual(['1.1', '2.2/3/4', 'P 7', 'P 8', 'Pivot 9', '3.5']);
    expect(lectura.otrosCampos).toEqual({ OT: 1 });
  });

  it('encuentra las columnas por nombre aunque cambie el orden', async () => {
    const orden = [5, 2, 0, 3, 1, 4, 6, 7, 8, 9, 10, 11];
    const reordenar = (f) => orden.map((i) => f[i]);
    const lectura = await leer({ '13.11.2026': HOJA_EJ.map(reordenar) });
    expect(potrero(lectura, '1.1')).toMatchObject({ hectareas: 50.5, usoTexto: 'Raygras' });
    expect(potrero(lectura, '1.1').lineas).toEqual([
      { categoriaTexto: 'Terneros', cabezas: 100, pesoPromedioKg: 200 },
    ]);
  });

  it('pasa los números con coma, separa los agrupados y marca las hectáreas de relleno', async () => {
    const lectura = await leer({ '13.11.2026': HOJA_EJ });
    expect(potrero(lectura, '2.2/3/4')).toMatchObject({
      hectareas: 120.25,
      subdivisiones: ['2.2', '2.3', '2.4'],
      hectareasAConfirmar: false,
    });
    expect(potrero(lectura, 'P 7')).toMatchObject({ hectareas: 1, hectareasAConfirmar: true });
    expect(lectura.advertencias).toContainEqual(expect.stringMatching(/2 potreros.*a confirmar.*P 7, P 8/));
  });

  it('las cabezas en 0 no generan líneas (aunque la categoría diga "Semillero")', async () => {
    const lectura = await leer({ '13.11.2026': HOJA_EJ });
    expect(potrero(lectura, '3.5').lineas).toEqual([]);
    expect(potrero(lectura, 'Pivot 9')).toMatchObject({ usoTexto: '', lineas: [] });
    expect(lectura.errores).toEqual([]);
  });

  it('avisa las cabezas sin peso promedio', async () => {
    const lectura = await leer({ '13.11.2026': HOJA_EJ });
    expect(potrero(lectura, 'P 8').lineas[0]).toEqual({ categoriaTexto: 'Vacas paridas', cabezas: 90, pesoPromedioKg: null });
    expect(lectura.advertencias).toContainEqual(expect.stringMatching(/sin peso promedio.*P 8 \(90\)/));
  });

  it('avisa cuando los kilos de la planilla no dan cabezas × promedio (la app usa el cálculo)', async () => {
    const lectura = await leer({ '13.11.2026': [ENCABEZADO, fila('EJ', 'Raygras', '4', 10, 'Vacas', 44, 380, 19000)] });
    expect(lectura.advertencias).toContainEqual(expect.stringMatching(/Potrero 4: la planilla dice 19000 kg.*16720 kg/));
  });

  it('un potrero que Excel guardó como fecha (7.1 = 7 de enero) vuelve a ser "7.1", con aviso', async () => {
    const lectura = await leer({
      '13.11.2026': [
        ENCABEZADO,
        fila('EJ', 'Raygras', new Date(Date.UTC(2026, 0, 7)), 40, 'Terneros', 100, 180),
        fila('EJ', 'Sorgo', new Date(Date.UTC(2026, 1, 9)), 40, 'Terneros', 110, 180),
        fila('EJ', 'Sorgo', new Date(Date.UTC(2026, 9, 12)), 10, null, 0, null),
      ],
    });
    expect(lectura.potreros.map((p) => p.nombre)).toEqual(['7.1', '9.2', '12.10']);
    expect(potrero(lectura, '7.1').lineas).toEqual([{ categoriaTexto: 'Terneros', cabezas: 100, pesoPromedioKg: 180 }]);
    expect(lectura.advertencias).toContainEqual(expect.stringMatching(/los potreros 7\.1, 9\.2, 12\.10 como fechas/));
    expect(lectura.errores).toEqual([]);
  });

  it('recupera el cero que Excel le borra al potrero (72.10 leído como 72.1)', async () => {
    const lectura = await leer({
      '13.11.2026': [ENCABEZADO, fila('EJ', 'Raygras', '72.1/2', 86.65, null, 0, null), fila('EJ', 'Raygras', 72.1, 1.31, null, 0, null)],
    });
    expect(lectura.potreros.map((p) => p.nombre)).toEqual(['72.1/2', '72.10']);
    expect(lectura.advertencias).toContainEqual(expect.stringMatching(/72\.1.*72\.10/));
  });

  it('los potreros que Excel guarda como número quedan como texto', async () => {
    const lectura = await leer({ '13.11.2026': [ENCABEZADO, fila('EJ', 'Raygras', 42, 10, null, 0, null), fila('EJ', 'Raygras', '45,1', 10, null, 0, null)] });
    expect(lectura.potreros.map((p) => p.nombre)).toEqual(['42', '45.1']);
  });

  it('marca como error las cabezas sin categoría y las que no son un número entero', async () => {
    const lectura = await leer({
      '13.11.2026': [ENCABEZADO, fila('EJ', 'Raygras', '1', 10, null, 20, 200), fila('EJ', 'Raygras', '2', 10, 'Vacas', 'muchas', 450)],
    });
    expect(lectura.errores).toEqual([
      expect.stringMatching(/Fila 2 \(potrero 1\): hay 20 cabezas sin categoría/),
      expect.stringMatching(/Fila 3 \(potrero 2\): "muchas" no es una cantidad de cabezas/),
    ]);
  });

  it('un potrero repetido junta sus categorías; la misma categoría dos veces es un error', async () => {
    const lectura = await leer({
      '13.11.2026': [
        ENCABEZADO,
        fila('EJ', 'CN', 'Frente', 100, 'Vacas', 50, 450),
        fila('EJ', 'CN', 'Frente', 100, 'Terneros', 40, 200),
        fila('EJ', 'CN', 'Fondo', 80, 'Vacas', 10, 450),
        fila('EJ', 'CN', 'Fondo', 80, 'vacas', 5, 450),
      ],
    });
    expect(potrero(lectura, 'Frente').lineas.map((l) => l.categoriaTexto)).toEqual(['Vacas', 'Terneros']);
    expect(lectura.errores).toEqual([expect.stringMatching(/Fondo.*"vacas" aparece dos veces/)]);
  });

  it('sin las columnas obligatorias, dice cuáles faltan', async () => {
    await expect(leer({ '13.11.2026': [['Campo', 'Potrero', 'Has']] })).rejects.toThrow(/Faltan columnas.*Categoria.*N° cabezas.*Promedio/);
  });

  it('rechaza un archivo que no es Excel y una planilla sin hojas con fecha', async () => {
    await expect(leerPlanilla(Buffer.from('esto no es un excel'))).rejects.toThrow(/no es una planilla de Excel/);
    await expect(leer({ Resumen: HOJA_EJ })).rejects.toThrow(/No encontré una hoja con fecha/);
  });
});
