// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedlotAnalisis, { nombreCorral } from './FeedlotAnalisis.jsx';
import { textoCompu } from '../test-utils.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let contenedor;
let root;

const FX = { id: 9, sigla: 'FX', nombre: 'Feedlot Ejemplo' };
const fila = (extra) => ({
  corralId: 1,
  corral: 'Corral 1',
  campo: FX,
  loteId: 11,
  lote: 'Corral 1 · Novillos',
  categoriaId: 1,
  categoria: 'Novillos',
  cabezas: 100,
  fechaEntrada: '2026-10-01',
  diasEncierre: 40,
  pesoEntradaKg: 300,
  pesoEstimadoKg: 360,
  salidaProbable: '2027-01-29',
  diasParaSalida: 80,
  salidaCerca: false,
  metrosComedero: 40,
  mComederoPorCabeza: 0.4,
  valorUsd: 108000,
  valorCompleto: true,
  valorAprox: true,
  ...extra,
});
const ANALISIS = {
  hoy: '2026-11-10',
  fecha: '2026-11-12',
  gmdKg: 1.5,
  cicloDias: 120,
  filas: [
    fila(),
    fila({
      corralId: 2,
      corral: 'Corral 2',
      loteId: 21,
      cabezas: 50,
      diasEncierre: 113,
      pesoEntradaKg: null,
      pesoEstimadoKg: null,
      salidaProbable: '2026-11-15',
      diasParaSalida: 5,
      salidaCerca: true,
      mComederoPorCabeza: 0.5,
      valorUsd: 54000,
    }),
    fila({
      corralId: 3,
      corral: 'Corral 3',
      loteId: 31,
      cabezas: 10,
      categoria: 'Toros',
      fechaEntrada: null,
      diasEncierre: null,
      pesoEntradaKg: null,
      pesoEstimadoKg: null,
      salidaProbable: null,
      diasParaSalida: null,
      metrosComedero: null,
      mComederoPorCabeza: null,
      valorUsd: 50000,
      valorAprox: false,
    }),
  ],
  vacios: [{ corralId: 4, corral: 'Corral 4', campo: FX }],
  totales: { cabezas: 160, corrales: 3, diasPromedio: 64.3, valorUsd: 212000, valorCompleto: true, salenEn30: 1 },
};

beforeEach(() => {
  contenedor = document.createElement('div');
  root = createRoot(contenedor);
});
afterEach(() => act(() => root.unmount()));

const montar = (props = {}, analisis = ANALISIS) =>
  act(() =>
    root.render(
      <MemoryRouter>
        <FeedlotAnalisis analisis={analisis} {...props} />
      </MemoryRouter>,
    ),
  );
const filas = () => [...contenedor.querySelectorAll('[data-testid="fila-corral"]')];
const salida = (tr) => tr.querySelector('[data-testid="salida"]');

describe('la vista del feedlot', () => {
  it('arriba los totales; una fila por corral, con los cálculos', () => {
    montar();
    const texto = contenedor.textContent;
    expect(texto).toMatch(/160cabezas/);
    expect(texto).toMatch(/3corrales/);
    expect(texto).toMatch(/64días promedio/);
    expect(texto).toMatch(/212 milUSD de valor/);
    expect(texto).toMatch(/1salen en 30 días/);
    expect(filas()).toHaveLength(3);
    const [primera] = filas();
    // En la compu: corral, categoría, cabezas, días, entrada, peso de hoy, salida, m/cab y valor.
    expect(textoCompu(primera)).toBe('Corral 1Novillos10040300≈36029/01/2027en 80 d0,4 m≈108 mil');
    expect(primera.querySelector('a').getAttribute('href')).toBe('/pecuaria/potreros/1');
  });

  it('en el celular, lo de la compu va como segunda línea', () => {
    montar();
    const [primera] = filas();
    expect(primera.querySelector('td').textContent).toBe('Corral 1Novillos · 0,4 m/cab');
    expect(primera.textContent).toContain('de 300');
    expect(salida(primera).textContent).toContain('29/01/27');
  });

  it('si falta un dato, "—"; la salida en ámbar si ya pasó o falta menos de una semana', () => {
    montar();
    const [primera, segunda, tercera] = filas();
    expect(salida(primera).className).not.toMatch(/amber/);
    expect(salida(segunda).className).toMatch(/amber/);
    expect(salida(segunda).textContent).toContain('en 5 d');
    // Toros sin fecha ni peso: días, entrada, peso de hoy, salida y m/cab con "—"; el valor (por cabeza) sí.
    expect(textoCompu(tercera)).toBe('Corral 3Toros10—————50 mil');
    expect(contenedor.querySelector('[data-testid="corrales-vacios"]').textContent).toBe('Vacíos: Corral 4');
    expect(contenedor.textContent).toContain('1,5 kg por día');
    expect(contenedor.textContent).toContain('entrada + 120 días');
  });

  it('con todos los feedlots, la sigla adelante y una fila por feedlot (tocarla lo elige)', () => {
    const onElegir = vi.fn();
    montar({ todas: true, onElegir }, { ...ANALISIS, feedlots: [{ ...FX, cabezas: 160, corrales: 3, valorUsd: 212000 }] });
    expect(filas()[0].querySelector('a').textContent).toBe('FX Corral 1');
    expect(contenedor.querySelector('[data-testid="corrales-vacios"]').textContent).toBe('Vacíos: FX Corral 4');
    act(() => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.includes('Feedlot Ejemplo')).click());
    expect(onElegir).toHaveBeenCalledWith(9);
    expect(nombreCorral({ corral: '2', campo: FX }, false)).toBe('2');
  });

  it('sin animales lo dice', () => {
    montar({}, { ...ANALISIS, filas: [], totales: { ...ANALISIS.totales, cabezas: 0, corrales: 0, diasPromedio: null, valorUsd: 0 } });
    expect(contenedor.textContent).toContain('Todavía no hay animales en los corrales.');
  });
});
