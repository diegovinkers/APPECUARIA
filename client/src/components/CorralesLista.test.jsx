// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import CorralesLista, { ordenarCorrales, textoGmd, totalesCorrales } from './CorralesLista.jsx';
import { ConPanel, textoCompu } from '../test-utils.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// El texto como se ve en el celular: sin lo que solo aparece en la compu.
const textoCelular = (el) => {
  const copia = el.cloneNode(true);
  for (const e of copia.querySelectorAll('.hidden')) e.remove();
  return copia.textContent;
};

const datos = (extra = {}) => ({
  cabezas: 80,
  diasEncierre: 30,
  fechaEntrada: '2026-10-26',
  etapa: 'ENGORDE',
  pesoEntradaKg: 300,
  pesoHoyKg: 345,
  pesoHoyAprox: true,
  gmdKg: 1.5,
  gmdReal: false,
  kgGanadosCab: 45,
  kgGanadosTotal: 3600,
  // Lejos, para que siempre sea de otro año (lleva el año).
  salidaProbable: '2040-02-23',
  diasParaSalida: 90,
  atrasado: false,
  salidaCerca: false,
  cmPorCabeza: 25,
  cmObjetivo: 30,
  apretado: true,
  valorUsd: 90_000,
  valorCompleto: true,
  valorAprox: true,
  datosIncompletos: false,
  ...extra,
});
const corral = (id, nombre, feedlot, metros = 20) => ({
  id,
  nombre,
  orden: id,
  tipo: 'CORRAL',
  hectareas: null,
  metrosComedero: metros,
  stock: {
    cabezas: feedlot?.cabezas ?? 0,
    lotes: feedlot ? [{ loteId: id, lote: `L${id}`, categoriaId: 7, categoria: 'Novillos 1-2', cabezas: feedlot.cabezas }] : [],
  },
  feedlot,
});

describe('cálculos de la tabla', () => {
  const lista = [
    corral(1, 'C1', datos({ diasEncierre: 30, cmPorCabeza: 25 })),
    corral(2, 'C2', datos({ cabezas: 20, diasEncierre: 130, cmPorCabeza: 45, pesoHoyKg: 445, gmdKg: 1.75, atrasado: true, diasParaSalida: -10 })),
    corral(3, 'C3', null, null),
  ];
  it('ordena por días de mayor a menor y por cm de menor a mayor; sin el dato, al final', () => {
    expect(ordenarCorrales(lista, { col: 'dias', dir: 'desc' }).map((p) => p.nombre)).toEqual(['C2', 'C1', 'C3']);
    expect(ordenarCorrales(lista, { col: 'cm', dir: 'asc' }).map((p) => p.nombre)).toEqual(['C1', 'C2', 'C3']);
    expect(ordenarCorrales(lista, { col: 'corral', dir: 'asc' }).map((p) => p.nombre)).toEqual(['C1', 'C2', 'C3']);
  });
  it('los totales se ponderan por cabezas; el cm, metros ÷ cabezas', () => {
    const t = totalesCorrales(lista);
    expect(t.cabezas).toBe(100);
    // (80 × 30 + 20 × 130) ÷ 100 = 50.
    expect(t.dias).toBe(50);
    expect(t.pesoHoy).toBe(365);
    // 40 m de los dos corrales con animales ÷ 100 cabezas = 40 cm.
    expect(t.cm).toBe(40);
    expect(t.atrasados).toBe(1);
    expect(t.valor).toBe(180_000);
  });
  it('la ganancia diaria: con "≈" si es la esperada', () => {
    expect(textoGmd(datos())).toBe('≈1,5 kg/d');
    expect(textoGmd(datos({ gmdKg: 1.75, gmdReal: true }))).toBe('1,75 kg/d');
    expect(textoGmd(null)).toBe('—');
  });
});

describe('la tabla de corrales', () => {
  let contenedor;
  let root;
  beforeEach(() => {
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    root = createRoot(contenedor);
  });
  afterEach(() => {
    act(() => root.unmount());
    contenedor.remove();
  });
  const montar = (potreros, ruta = '/pecuaria/potreros') =>
    act(() =>
      root.render(
        <MemoryRouter initialEntries={[ruta]}>
          <Routes>
            <Route
              path="/pecuaria/potreros"
              element={
                <ConPanel>
                  <CorralesLista potreros={potreros} />
                </ConPanel>
              }
            />
          </Routes>
        </MemoryRouter>,
      ),
    );
  const filas = () => [...contenedor.querySelectorAll('[data-testid="fila-corral"]')];
  const nombres = () => filas().map((tr) => tr.querySelector('td a').textContent);
  const titulos = () => [...contenedor.querySelectorAll('thead th')];

  const tres = () => [
    corral(1, 'C1', datos()),
    corral(2, 'C2', datos({ cabezas: 20, etapa: 'PARA_SALIR', diasEncierre: 130, atrasado: true, diasParaSalida: -10, cmPorCabeza: 45, apretado: false })),
    corral(3, 'C3', null, null),
  ];

  it('sin hectáreas ni carga: en el celular Corral, Cab., Días, Peso hoy y cm/cab', () => {
    montar(tres());
    const celular = titulos()
      .filter((th) => !th.className.includes('hidden'))
      .map((th) => textoCelular(th).replace(/[↕▲▼]/g, ''));
    expect(celular).toEqual(['Corral', 'Cab.', 'Días', 'Peso hoy', 'cm/cab']);
    expect(contenedor.textContent).not.toMatch(/cab\/ha|kg\/ha/);
  });

  it('en el celular, debajo: categoría y etapa; lo que falta para salir; la ganancia diaria', () => {
    montar(tres());
    const celdas = [...filas()[0].querySelectorAll('td')].filter((td) => !td.className.includes('hidden'));
    expect(celdas.map(textoCelular)).toEqual(['C1Novillos 1-2Engorde', '80', '30en 90 d', '≈345≈1,5 kg/d', '25']);
    // 25 cm contra un objetivo de 30: apretado, en ámbar, con la barra a 5/6.
    const barra = filas()[0].querySelector('[data-testid="barra-comedero"] span');
    expect(barra.className).toMatch(/amber/);
    expect(barra.style.width).toMatch(/^83\.3/);
    // Atrasado: en ámbar fuerte.
    const dias = [...filas()[1].querySelectorAll('td')][3];
    expect(textoCelular(dias)).toBe('130atrasado 10 d');
    expect(dias.querySelector('span').className).toMatch(/amber-900/);
  });

  it('en la compu: entrada, GMD, kg ganados, salida y valor; el vacío con "—"', () => {
    montar(tres());
    expect(textoCompu(filas()[0])).toBe('C1Engorde80 Novillos 1-28030300≈345≈1,5≈4523/02/40 en 90 d25≈90 mil');
    expect(textoCompu(filas()[2])).toBe('C3vacío—————————');
    expect(textoCompu(contenedor.querySelector('[data-testid="total-corrales"]'))).toMatch(/^Total · 3corrales100/);
  });

  it('filtros en la dirección: etapa, atrasados, comedero apretado y datos incompletos', () => {
    montar(tres(), '/pecuaria/potreros?etapa=PARA_SALIR');
    expect(nombres()).toEqual(['C2']);
    act(() => root.unmount());
    root = createRoot(contenedor);
    montar(tres(), '/pecuaria/potreros?salida=atrasados');
    expect(nombres()).toEqual(['C2']);
    act(() => root.unmount());
    root = createRoot(contenedor);
    montar(tres(), '/pecuaria/potreros?apretado=1');
    expect(nombres()).toEqual(['C1']);
    act(() => root.unmount());
    root = createRoot(contenedor);
    montar([...tres(), corral(4, 'C4', datos({ datosIncompletos: true }))], '/pecuaria/potreros?incompletos=1');
    expect(nombres()).toEqual(['C4']);
  });

  it('tocar un título ordena (cm/cab: los más apretados primero)', () => {
    montar(tres());
    const boton = [...contenedor.querySelectorAll('thead button')].find((b) => b.textContent.startsWith('cm/cab'));
    act(() => boton.click());
    expect(nombres()).toEqual(['C1', 'C2', 'C3']);
    act(() => boton.click());
    expect(nombres()).toEqual(['C2', 'C1', 'C3']);
  });
});
