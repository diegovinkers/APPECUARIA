// @vitest-environment jsdom
// Feedlot por etapas, atrasados y precio de venta real (20/11).
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TablaResumen, columnasDe, valorColumna } from './ResumenCampo.jsx';
import FeedlotAnalisis, { textoDiferencia, textoSalida } from './FeedlotAnalisis.jsx';
import CamposPrecioVenta, { cuerpoVenta, faltaParaVenta } from './PrecioVenta.jsx';
import { textoPrecio, textoVenta } from './pecuaria.jsx';
import { textoCompu } from '../test-utils.jsx';

vi.mock('../api/pecuaria', () => ({}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
const { armarFilas } = await import('./MovimientosLista.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let contenedor;
let root;
beforeEach(() => {
  contenedor = document.createElement('div');
  root = createRoot(contenedor);
});
afterEach(() => act(() => root.unmount()));
const montar = (elemento) => act(() => root.render(<MemoryRouter>{elemento}</MemoryRouter>));

// Lo que se ve en el celular: sin lo que es solo de la compu ("hidden md:...").
function textoCelular(el) {
  const copia = el.cloneNode(true);
  for (const e of copia.querySelectorAll('.hidden')) e.remove();
  return copia.textContent;
}

// Como lo manda el servidor (feedlot.service.js: resumenPorEtapas).
const COLUMNAS = [
  { clave: 'ADAPTACION', nombre: 'Adaptación', detalle: '0 a 20 días', compu: true },
  { clave: 'ENGORDE', nombre: 'Engorde', detalle: '21 a 90 días', compu: true },
  { clave: 'HASTA_ENGORDE', nombre: 'Hasta 90 d', detalle: '0 a 90 días', celular: true, suma: ['ADAPTACION', 'ENGORDE'] },
  { clave: 'TERMINACION', nombre: 'Terminación', corto: 'Termin.', detalle: '91 a 120 días' },
  { clave: 'PARA_SALIR', nombre: 'Para salir', detalle: 'más de 120 días' },
  { clave: 'SIN_FECHA', nombre: 'Sin fecha', detalle: 'el lote no tiene fecha de entrada' },
];
const FEEDLOT = {
  tipo: 'FEEDLOT',
  fecha: '2026-11-12',
  kgPorUg: 380,
  columnas: COLUMNAS,
  filas: [
    { categoriaId: 3, categoria: 'Novillos', ADAPTACION: 20, ENGORDE: 80, TERMINACION: 0, PARA_SALIR: 0, SIN_FECHA: 0, total: 100, valorUsd: 98_700, valorCompleto: true },
    { categoriaId: 7, categoria: 'Terneros', ADAPTACION: 0, ENGORDE: 0, TERMINACION: 0, PARA_SALIR: 30, SIN_FECHA: 5, total: 35, valorUsd: 47_400, valorCompleto: true },
  ],
  totales: { ADAPTACION: 20, ENGORDE: 80, TERMINACION: 0, PARA_SALIR: 30, SIN_FECHA: 5, total: 135 },
  valor: { usd: 146_100, completo: true },
  porGrupo: [],
};
const titulos = (filtro) => [...contenedor.querySelectorAll('thead th')].map(filtro);

describe('la tabla de categorías del feedlot, por etapa', () => {
  it('en la compu: las cuatro etapas, Sin fecha, Valor USD y Total', () => {
    montar(<TablaResumen resumen={FEEDLOT} />);
    const compu = titulos((th) => th).filter((th) => !th.className.split(' ').includes('md:hidden')).map((th) => textoCompu(th));
    expect(compu).toEqual(['Categoría', 'Adaptación', 'Engorde', 'Terminación', 'Para salir', 'Sin fecha', 'Valor USD', 'Total']);
  });

  it('en el celular: Adaptación y Engorde van juntas en "Hasta 90 d"', () => {
    montar(<TablaResumen resumen={FEEDLOT} />);
    const celular = titulos((th) => th).filter((th) => !th.classList.contains('hidden')).map((th) => textoCelular(th));
    expect(celular).toEqual(['Categoría', 'Hasta 90 d', 'Termin.', 'Para salir', 'Sin fecha', 'Valor USD', 'Total']);
    const [novillos] = contenedor.querySelectorAll('tbody tr');
    // Novillos: 20 + 80 = 100 hasta los 90 días.
    expect(textoCelular(novillos)).toMatch(/^Novillos100——/);
  });

  it('las etapas no son un filtro de Potreros (sin link); la leyenda dice qué días cubre cada una; sin carga por grupo', () => {
    montar(<TablaResumen resumen={FEEDLOT} />);
    const links = [...contenedor.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toContain('/pecuaria/potreros?categoria=3');
    expect(links.some((h) => h.includes('grupo='))).toBe(false);
    expect(contenedor.querySelector('[data-testid="leyenda-etapas"]').textContent).toContain('Engorde, 21 a 90 días');
    expect(contenedor.textContent).not.toContain('Carga por grupo');
    expect(contenedor.textContent).not.toContain('CN: campo natural');
  });

  it('las columnas y la suma', () => {
    expect(columnasDe({ totales: { CN: 0, VERDEO: 0, CORRAL: 0, OTRO: 3 } }).map((c) => c.clave)).toEqual(['CN', 'VERDEO', 'OTRO']);
    expect(columnasDe(FEEDLOT)).toHaveLength(6);
    expect(valorColumna(FEEDLOT.totales, COLUMNAS[2])).toBe(100);
    expect(valorColumna(FEEDLOT.totales, COLUMNAS[4])).toBe(30);
  });
});

const FX = { id: 9, sigla: 'FX', nombre: 'Feedlot Ejemplo' };
const fila = (extra) => ({
  corralId: 1,
  corral: 'Corral 1',
  campo: FX,
  loteId: 11,
  categoriaId: 1,
  categoria: 'Novillos',
  cabezas: 100,
  fechaEntrada: '2026-07-01',
  diasEncierre: 132,
  pesoEntradaKg: 300,
  pesoEstimadoKg: 498,
  salidaProbable: '2026-10-29',
  diasParaSalida: -12,
  atrasado: true,
  salidaCerca: false,
  metrosComedero: 40,
  mComederoPorCabeza: 0.4,
  valorUsd: 100_000,
  valorCompleto: true,
  valorAprox: true,
  ...extra,
});
const ANALISIS = {
  hoy: '2026-11-10',
  fecha: '2026-11-12',
  gmdKg: 1.5,
  cicloDias: 120,
  filas: [fila(), fila({ corralId: 2, corral: 'Corral 2', loteId: 21, salidaProbable: '2026-11-12', diasParaSalida: 2, atrasado: false, salidaCerca: true })],
  vacios: [],
  totales: { cabezas: 200, corrales: 2, diasPromedio: 100, valorUsd: 200_000, valorCompleto: true, atrasados: 1, proximos: 1 },
  ventas: [
    {
      movimientoId: 50,
      fecha: '2026-11-09',
      corralId: 1,
      corral: 'Corral 1',
      campo: FX,
      categoria: 'Novillos',
      cabezas: 10,
      diasEncierre: 29,
      pesoRealKg: 360,
      pesoEstimadoKg: 343.5,
      diferenciaKg: 16.5,
      precioVentaUsd: 3.2,
      precioVentaPor: 'KG',
      valorVentaUsd: 11_520,
    },
    {
      movimientoId: 51,
      fecha: '2026-11-08',
      corralId: 4,
      corral: 'Corral 4',
      campo: FX,
      categoria: 'Vacas',
      cabezas: 1,
      diasEncierre: null,
      pesoRealKg: null,
      pesoEstimadoKg: null,
      diferenciaKg: null,
      precioVentaUsd: null,
      precioVentaPor: null,
      valorVentaUsd: null,
    },
  ],
};

describe('atrasados y próximos', () => {
  it('arriba, por separado: atrasados y los que salen en 30 días', () => {
    montar(<FeedlotAnalisis analisis={ANALISIS} />);
    expect(contenedor.textContent).toMatch(/1atrasado/);
    expect(contenedor.textContent).toMatch(/1salen en 30 días/);
  });

  it('un corral atrasado dice "atrasado N d" en ámbar fuerte; uno que sale en la semana, en ámbar suave', () => {
    montar(<FeedlotAnalisis analisis={ANALISIS} />);
    const [atrasado, cerca] = [...contenedor.querySelectorAll('[data-testid="salida"]')];
    expect(atrasado.textContent).toContain('atrasado 12 d');
    expect(atrasado.className).toMatch(/font-bold/);
    expect(atrasado.className).toMatch(/amber-900/);
    expect(cerca.textContent).toContain('en 2 d');
    expect(cerca.className).toMatch(/amber-800/);
    expect(cerca.className).not.toMatch(/amber-900/);
    expect(textoSalida({ atrasado: false, diasParaSalida: 0 })).toBe('hoy');
  });
});

describe('Últimas ventas', () => {
  it('fecha, corral, categoría, cabezas, peso real contra estimado, precio y valor; "—" si falta', () => {
    montar(<FeedlotAnalisis analisis={ANALISIS} />);
    const [venta, sinDatos] = [...contenedor.querySelectorAll('[data-testid="fila-venta"]')];
    expect(textoCompu(venta)).toBe('09/11/2026Corral 1Novillos10360≈343,5+16,5USD 3,2/kg12 mil');
    expect(textoCompu(sinDatos)).toBe('08/11/2026Corral 4Vacas1—————');
    // En el celular: el estimado y la diferencia debajo del peso; el precio debajo del valor.
    expect(textoCelular(venta)).toBe('09/11Corral 1Novillos10360≈343,5 (+16,5)12 milUSD 3,2/kg');
  });

  it('sin ventas lo dice', () => {
    montar(<FeedlotAnalisis analisis={{ ...ANALISIS, ventas: [] }} />);
    expect(contenedor.querySelector('[data-testid="ultimas-ventas"]').textContent).toContain('No hubo ventas');
    expect(textoDiferencia(-3)).toBe('−3');
    expect(textoDiferencia(0)).toBe('0');
  });
});

describe('precio de venta al registrar una salida', () => {
  it('lo que se manda: nada sin precio; con precio, el precio y si es por kilo o por cabeza', () => {
    expect(cuerpoVenta('', 'KG')).toEqual({});
    expect(cuerpoVenta('3,2', 'KG')).toEqual({ precioVentaUsd: 3.2, precioVentaPor: 'KG' });
    expect(cuerpoVenta('4800', 'CABEZA')).toEqual({ precioVentaUsd: 4800, precioVentaPor: 'CABEZA' });
  });

  it('avisa lo que falta: por kilo pide el peso de salida', () => {
    expect(faltaParaVenta({ precio: '', por: 'KG', peso: '' })).toBeNull();
    expect(faltaParaVenta({ precio: '3,2', por: 'KG', peso: '' })).toMatch(/peso de salida/);
    expect(faltaParaVenta({ precio: '3,2', por: 'KG', peso: '360' })).toBeNull();
    expect(faltaParaVenta({ precio: '4800', por: 'CABEZA', peso: '' })).toBeNull();
    expect(faltaParaVenta({ precio: '0', por: 'CABEZA', peso: '' })).toMatch(/mayor que cero/);
  });

  it('el campo: el precio en dólares, por kilo o por cabeza, y el valor de la venta', () => {
    const onPor = vi.fn();
    const onPrecio = vi.fn();
    montar(<CamposPrecioVenta precio="3,2" por="KG" peso="" valor={null} onPrecio={onPrecio} onPor={onPor} />);
    expect(contenedor.querySelector('[aria-label="Precio de venta en dólares"]').value).toBe('3,2');
    expect(contenedor.textContent).toContain('escribí el peso de salida');
    const [porKilo, porCabeza] = contenedor.querySelectorAll('[role="group"] button');
    expect(porKilo.getAttribute('aria-pressed')).toBe('true');
    act(() => porCabeza.click());
    expect(onPor).toHaveBeenCalledWith('CABEZA');
    montar(<CamposPrecioVenta precio="3,2" por="KG" peso="360" valor={11_520} onPrecio={onPrecio} onPor={onPor} />);
    expect(contenedor.querySelector('[data-testid="valor-venta"]').textContent).toBe('USD 11.520');
  });
});

describe('una venta con precio en la lista de Movimientos', () => {
  const venta = {
    id: 50,
    fecha: '2026-11-09',
    modo: 'SALIDA',
    tipo: { clave: 'VENTA', nombre: 'Venta o faena' },
    cabezas: 10,
    pesoPromedioKg: 360,
    precioVentaUsd: 3.2,
    precioVentaPor: 'KG',
    valorVentaUsd: 11_520,
    categoriaOrigen: 'Novillos',
    potreroOrigen: { id: 1, nombre: 'C1', campoId: 9 },
    loteOrigen: { id: 11, nombre: 'F' },
    potreroDestino: null,
    loteDestino: null,
    evento: null,
    guia: 'V-1',
  };

  it('el texto del valor', () => {
    expect(textoPrecio(4800, 'CABEZA')).toBe('USD 4.800/cab');
    expect(textoVenta(venta)).toBe('USD 11.520 · USD 3,2/kg');
    expect(textoVenta({ ...venta, precioVentaUsd: null })).toBeNull();
    expect(armarFilas([venta], 9)[0].venta).toBe('USD 11.520 · USD 3,2/kg');
    expect(armarFilas([{ ...venta, precioVentaUsd: null, valorVentaUsd: null }], 9)[0].venta).toBeNull();
  });
});
