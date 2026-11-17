import { describe, expect, it } from 'vitest';
import { calcularPotrero } from '../src/pecuaria/calculos.js';

const KG_POR_UG = 380;

describe('calcularPotrero', () => {
  it('calcula cabezas, kilos y los valores por hectárea (ejemplo: 350 terneros de 250 kg en 144,5 ha)', () => {
    const r = calcularPotrero({ hectareas: 144.5, hectareasAConfirmar: false, lineas: [{ cabezas: 350, pesoPromedioKg: 250 }] }, KG_POR_UG);
    expect(r).toEqual({ cabezas: 350, kilos: 87500, kilosCompletos: true, cabHa: 2.42, kgPvHa: 605.54, ugHa: 1.59 });
  });

  it('suma varias categorías', () => {
    const r = calcularPotrero(
      { hectareas: 100, hectareasAConfirmar: false, lineas: [{ cabezas: 50, pesoPromedioKg: 450 }, { cabezas: 40, pesoPromedioKg: 200 }] },
      KG_POR_UG,
    );
    expect(r).toMatchObject({ cabezas: 90, kilos: 30500, cabHa: 0.9, kgPvHa: 305, ugHa: 0.8 });
  });

  it('una línea sin peso deja los kilos incompletos, pero se calcula con lo que hay', () => {
    const r = calcularPotrero(
      { hectareas: 100, hectareasAConfirmar: false, lineas: [{ cabezas: 50, pesoPromedioKg: 380 }, { cabezas: 30, pesoPromedioKg: null }] },
      KG_POR_UG,
    );
    expect(r).toMatchObject({ cabezas: 80, kilos: 19000, kilosCompletos: false, cabHa: 0.8, kgPvHa: 190, ugHa: 0.5 });
  });

  it('sin hectáreas, o con hectáreas "a confirmar", no hay valores por hectárea', () => {
    const lineas = [{ cabezas: 250, pesoPromedioKg: 450 }];
    for (const potrero of [
      { hectareas: null, hectareasAConfirmar: true, lineas },
      { hectareas: 1, hectareasAConfirmar: true, lineas },
    ]) {
      expect(calcularPotrero(potrero, KG_POR_UG)).toMatchObject({ cabezas: 250, kilos: 112500, cabHa: null, kgPvHa: null, ugHa: null });
    }
  });

  it('un potrero vacío da todo en cero', () => {
    expect(calcularPotrero({ hectareas: 50, hectareasAConfirmar: false, lineas: [] }, KG_POR_UG)).toEqual({
      cabezas: 0,
      kilos: 0,
      kilosCompletos: true,
      cabHa: 0,
      kgPvHa: 0,
      ugHa: 0,
    });
  });

  it('las UG siguen al parámetro', () => {
    const r = calcularPotrero({ hectareas: 10, hectareasAConfirmar: false, lineas: [{ cabezas: 10, pesoPromedioKg: 400 }] }, 400);
    expect(r.ugHa).toBe(1);
  });
});
