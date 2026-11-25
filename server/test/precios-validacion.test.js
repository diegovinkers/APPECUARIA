import { describe, expect, it } from 'vitest';
import {
  CLAVES, INDICADORES, MAPEO_CATEGORIAS, OBLIGATORIOS, RANGOS, indicador, indicadorDeCategoria, indicadorPorTextoInac,
} from '../src/pecuaria/precios.indicadores.js';
import { validarSemana, valoresConocidos, variacion } from '../src/pecuaria/precios.validacion.js';
import { VALORES_BASE } from './precios-fixture.js';

const HOY = '2026-11-25';
const semana = (valores = VALORES_BASE, desde = '2026-11-15', hasta = '2026-11-21') => ({ desde, hasta, valores });
const anterior = { valores: VALORES_BASE };

describe('precios.indicadores', () => {
  it('17 indicadores con claves únicas, y cada unidad tiene su rango', () => {
    expect(CLAVES).toHaveLength(17);
    expect(new Set(CLAVES).size).toBe(17);
    for (const i of INDICADORES) expect(RANGOS[i.unidad]).toHaveLength(2);
    expect(Object.keys(VALORES_BASE).sort()).toEqual([...CLAVES].sort());
  });

  it('obligatorios: novillo, vaca y vaquillona en 4ta balanza', () => {
    expect(OBLIGATORIOS).toEqual(['NOVILLO_4TA', 'VACA_4TA', 'VAQUILLONA_4TA']);
  });

  it('se reconocen por el texto del informe de INAC', () => {
    expect(indicadorPorTextoInac('Novillo en 4ta bza.').clave).toBe('NOVILLO_4TA');
    expect(indicadorPorTextoInac('  VAQUILLONA CAMPO 45 DIAS A LEVANTAR ').clave).toBe('VAQUILLONA_CAMPO_45D');
    expect(indicadorPorTextoInac('Cordero Campo 30 días a levantar').clave).toBe('CORDERO_CAMPO_30D');
    expect(indicadorPorTextoInac('Ternero')).toBeNull();
    expect(indicador('VACA_PIE')).toMatchObject({ nombre: 'Vaca en pie', grupo: 'Vaca', unidad: 'USD_KG_PIE' });
    expect(indicador('NADA')).toBeNull();
  });

  it('el mapeo con las categorías de la app arranca vacío', () => {
    expect(MAPEO_CATEGORIAS).toEqual({});
    expect(indicadorDeCategoria('Novillos 2-3')).toBeNull();
    expect(indicadorDeCategoria('Novillos 2-3', { 'Novillos 2-3': 'NOVILLO_PIE' })).toBe('NOVILLO_PIE');
  });
});

describe('variacion', () => {
  it('en %, con un decimal', () => {
    expect(variacion(3.412, 3.449)).toBe(-1.1);
    expect(variacion(6, 5)).toBe(20);
    expect(variacion(5, null)).toBeNull();
    expect(variacion(null, 5)).toBeNull();
    expect(variacion(5, 0)).toBeNull();
  });
});

describe('validarSemana', () => {
  it('una semana normal: OK', () => {
    expect(validarSemana({ semana: semana(), anterior, hoy: HOY })).toEqual({ estado: 'OK', errores: [], marcas: [], avisos: [] });
  });

  it('sin la semana anterior no se controla la variación', () => {
    expect(validarSemana({ semana: semana(), hoy: HOY }).estado).toBe('OK');
  });

  it('más de 15 % contra la semana anterior: queda en revisión', () => {
    const r = validarSemana({ semana: semana({ ...VALORES_BASE, VACA_4TA: 6.84, NOVILLO_PIE: 2.8 }), anterior, hoy: HOY });
    expect(r.estado).toBe('EN_REVISION');
    expect(r.marcas).toEqual([
      {
        indicador: 'NOVILLO_PIE', motivo: 'VARIACION', valor: 2.8, anterior: 3.4, variacion: -17.6,
        texto: 'Novillo en pie: bajó 17,6 % contra la semana anterior (de 3,400 a 2,800).',
      },
      {
        indicador: 'VACA_4TA', motivo: 'VARIACION', valor: 6.84, anterior: 5.7, variacion: 20,
        texto: 'Vaca en 4ta balanza: subió 20,0 % contra la semana anterior (de 5,700 a 6,840).',
      },
    ]);
  });

  it('justo 15 % no se marca', () => {
    const r = validarSemana({ semana: semana({ ...VALORES_BASE, VACA_PIE: 3.335 }), anterior, hoy: HOY });
    expect(variacion(3.335, 2.9)).toBe(15);
    expect(r.estado).toBe('OK');
  });

  it('fuera del rango de su unidad: queda en revisión', () => {
    const r = validarSemana({ semana: semana({ ...VALORES_BASE, NOVILLO_PIE: 0.7, OVEJA_GANCHO: 13 }), hoy: HOY });
    expect(r.estado).toBe('EN_REVISION');
    expect(r.marcas.map((m) => [m.indicador, m.motivo, m.rango])).toEqual([
      ['NOVILLO_PIE', 'RANGO', [1, 6]],
      ['OVEJA_GANCHO', 'RANGO', [2, 12]],
    ]);
    expect(r.marcas[0].texto).toBe('Novillo en pie: 0,700 USD/kg en pie, fuera de lo esperable (de 1 a 6).');
  });

  it('falta un obligatorio: ERROR; falta otro: solo un aviso', () => {
    const { NOVILLO_4TA, CORDERO_CAMPO, ...resto } = VALORES_BASE;
    const r = validarSemana({ semana: semana(resto), anterior, hoy: HOY });
    expect(r.estado).toBe('ERROR');
    expect(r.errores).toEqual(['Falta el precio de Novillo en 4ta balanza.']);
    expect(r.avisos).toEqual(['No vino el precio de Cordero campo.']);

    const { CORDERO_CAMPO: _, ...sinCordero } = VALORES_BASE;
    expect(validarSemana({ semana: semana(sinCordero), anterior, hoy: HOY }).estado).toBe('OK');
  });

  it('fechas: la semana dura 7 días, ya pasó y existe', () => {
    expect(validarSemana({ semana: semana(VALORES_BASE, '2026-11-15', '2026-11-22'), hoy: HOY }).errores)
      .toEqual(['La semana del 15/11/2026 al 22/11/2026 no dura 7 días.']);
    expect(validarSemana({ semana: semana(VALORES_BASE, '2026-11-22', '2026-11-28'), hoy: HOY }).errores)
      .toEqual(['La semana termina el 28/11/2026, que todavía no pasó.']);
    expect(validarSemana({ semana: semana(VALORES_BASE, '2021-02-31', '2021-03-06'), hoy: HOY }).errores)
      .toEqual(['La semana no tiene fechas válidas.']);
  });

  it('una clave desconocida se avisa y se descarta', () => {
    const r = validarSemana({ semana: semana({ ...VALORES_BASE, TERNERO_PIE: 4.1 }), hoy: HOY });
    expect(r.estado).toBe('OK');
    expect(r.avisos).toEqual(['Precio desconocido: TERNERO_PIE. No se guarda.']);
    expect(valoresConocidos({ TERNERO_PIE: 4.1, VACA_PIE: 2.9, NOVILLO_PIE: null })).toEqual({ VACA_PIE: 2.9 });
  });
});
