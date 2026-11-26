// @vitest-environment jsdom
// La ficha del potrero (24/11): sin las tarjetas que repetían la tabla de
// Potreros; los lotes de hoy compactos; la tabla de movimientos con la
// variación de cada dato; las correcciones en el menú "⋯".
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { textoCambio } from '../components/HistorialPotrero.jsx';

const api = vi.hoisted(() => ({
  getPotrero: vi.fn(),
  getHistorial: vi.fn(),
  cambiarUso: vi.fn(),
  editarPotrero: vi.fn(),
  getCategorias: vi.fn(),
  getUsosSuelo: vi.fn(),
  guardarStock: vi.fn(),
  registrarMovimiento: vi.fn(),
  renombrarLote: vi.fn(),
  anularPasto: vi.fn(),
}));
vi.mock('../api/pecuaria', () => api);
const permisos = vi.hoisted(() => ({ lista: ['pecuaria:VER', 'pecuaria:CREAR', 'pecuaria:EDITAR'] }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { esSuperadmin: false, permisos: permisos.lista } }) }));

const { default: PotreroPage } = await import('./PotreroPage.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const linea = { loteId: 7, lote: '8.1 · Terneros chicos', familiaId: 7, categoriaId: 3, categoria: 'Terneros chicos', cabezas: 272, pesoPromedioKg: 250 };
const potrero = {
  id: 1,
  nombre: '8.1',
  tipo: 'POTRERO',
  campo: { id: 1, sigla: 'EG', nombre: 'La Gateada' },
  hectareas: 85.47,
  hectareasAConfirmar: false,
  areaUtilizable: null,
  subdivisiones: [],
  usoActual: { id: 1, nombre: 'Festuca nueva', grupo: 'VERDEO', desde: '2026-11-13' },
  stock: { fecha: '2026-11-20', origen: 'MOVIMIENTO', cabezas: 272, cabHa: 3.18, kgPvHa: 795.6, kilosCompletos: true, kilosEstimados: false, valorUsd: 279480, valorCompleto: true, lineas: [linea] },
};
const version = (id, fecha, titulo, detalle, carga, cambio, extra = {}) => ({
  id,
  fecha,
  origen: 'MOVIMIENTO',
  titulo,
  detalle,
  usuario: 'diego',
  lineas: [{ ...linea, cabezas: carga.cabezas }],
  cabezas: carga.cabezas,
  carga: { kilosEstimados: false, ...carga },
  cambio,
  ...extra,
});
const historial = {
  versiones: [
    version(3, '2026-11-20', 'Reversión', 'Terneros chicos de 44.1', { cabezas: 272, pesoPromedio: 250, kgPvHa: 796, cabHa: 3.18 }, { cabezas: 5, pesoPromedio: 0, kgPvHa: 14.6, cabHa: 0.06 }, { movimiento: 'Llegaron 5 Terneros chicos desde 44.1', nota: 'Reversión del movimiento del 19/11/2026' }),
    version(2, '2026-11-19', 'Salieron 5', 'Terneros chicos a 44.1', { cabezas: 267, pesoPromedio: 250, kgPvHa: 781, cabHa: 3.12 }, { cabezas: -5, pesoPromedio: 0, kgPvHa: -14.6, cabHa: -0.06 }),
    version(1, '2026-11-13', 'Planilla', 'cargas.xlsx (13.11)', { cabezas: 272, pesoPromedio: 250, kgPvHa: 796, cabHa: 3.18 }, null, { origen: 'PLANILLA' }),
  ],
  usos: [{ uso: { id: 1, nombre: 'Festuca nueva', grupo: 'VERDEO' }, desde: '2026-11-13', hasta: null }],
  eventos: [],
};

describe('textoCambio', () => {
  it('con signo, sin el cero y con los decimales pedidos', () => {
    expect(textoCambio(5)).toBe('+5');
    expect(textoCambio(-100)).toBe('−100');
    expect(textoCambio(0.06, 2)).toBe('+0,06');
    expect(textoCambio(-1250)).toBe('−1.250');
    expect(textoCambio(0)).toBeNull();
    expect(textoCambio(0.001, 2)).toBeNull();
    expect(textoCambio(null)).toBeNull();
  });
});

describe('la ficha del potrero', () => {
  let contenedor;
  let root;
  beforeEach(() => {
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    root = createRoot(contenedor);
    api.getPotrero.mockResolvedValue({ data: potrero });
    api.getHistorial.mockResolvedValue({ data: historial });
    permisos.lista = ['pecuaria:VER', 'pecuaria:CREAR', 'pecuaria:EDITAR'];
  });
  afterEach(() => {
    act(() => root.unmount());
    contenedor.remove();
  });
  const montar = async () => {
    act(() =>
      root.render(
        <MemoryRouter initialEntries={['/pecuaria/potreros/1']}>
          <Routes>
            <Route path="/pecuaria/potreros/:id" element={<PotreroPage />} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
  };
  const texto = () => contenedor.textContent;

  it('no repite las tarjetas de la tabla de Potreros ni los botones grandes', async () => {
    await montar();
    expect(texto()).not.toMatch(/kg PV\/ha/);
    expect(texto()).not.toMatch(/Stock al/);
    expect([...contenedor.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Editar stock');
    // Los lotes de hoy, en una línea, con el enlace a su historial.
    const lotes = contenedor.querySelector('[data-testid="lotes-hoy"]');
    expect(lotes.textContent).toMatch(/Hoy · 272 cab/);
    expect(lotes.querySelector('a[href="/pecuaria/lotes/7"]').textContent).toBe('8.1 · Terneros chicos');
    expect(contenedor.querySelector('[data-testid="valor-potrero"]').textContent).toMatch(/USD 279\.480/);
  });

  it('la tabla de movimientos: qué pasó, el valor después y cuánto cambió', async () => {
    await montar();
    const filas = contenedor.querySelectorAll('[data-testid="fila-historial"]');
    expect(filas).toHaveLength(3);
    expect(filas[0].textContent).toMatch(/Reversión/);
    expect(filas[0].textContent).toMatch(/Terneros chicos de 44\.1/);
    expect(filas[0].querySelector('[data-testid="cambio-cabezas"]').textContent).toBe('+5');
    expect(filas[0].querySelector('[data-testid="cambio-cabHa"]').textContent).toBe('+0,06');
    // El peso no cambió: no se muestra nada.
    expect(filas[0].querySelector('[data-testid="cambio-pesoPromedio"]')).toBeNull();
    expect(filas[1].querySelector('[data-testid="cambio-cabezas"]').textContent).toBe('−5');
    // La primera carga no tiene contra qué compararse.
    expect(filas[2].querySelector('[data-testid^="cambio-"]')).toBeNull();
  });

  it('el título lleva el color del cambio de cabezas: verde si entraron, tierra si salieron', async () => {
    await montar();
    const titulos = [...contenedor.querySelectorAll('[data-testid="titulo-historial"]')];
    expect(titulos[0].className).toMatch(/text-campo-700/);
    expect(titulos[1].textContent).toBe('Salieron 5');
    expect(titulos[1].className).toMatch(/text-tierra-600/);
    // Sin cambio de cabezas (la planilla), sin color.
    expect(titulos[2].className).not.toMatch(/text-(campo|tierra)-/);
  });

  it('tocar una fila la despliega con el texto completo, los lotes y la nota', async () => {
    await montar();
    expect(contenedor.querySelector('[data-testid="detalle-historial"]')).toBeNull();
    const fila = contenedor.querySelector('[data-testid="fila-historial"]');
    act(() => fila.click());
    const detalle = contenedor.querySelector('[data-testid="detalle-historial"]');
    expect(detalle.textContent).toMatch(/Llegaron 5 Terneros chicos desde 44\.1/);
    expect(detalle.textContent).toMatch(/Nota: Reversión del movimiento/);
    expect(detalle.textContent).toMatch(/8\.1 · Terneros chicos: 272/);
    act(() => fila.click());
    expect(contenedor.querySelector('[data-testid="detalle-historial"]')).toBeNull();
  });

  it('las correcciones están en el menú "⋯" y abren su formulario', async () => {
    api.getCategorias.mockResolvedValue({ data: [] });
    await montar();
    act(() => contenedor.querySelector('[aria-label="Más opciones"]').click());
    const opciones = [...contenedor.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent);
    expect(opciones).toEqual(['Editar stock', 'Cambiar uso de suelo', 'Corregir hectáreas']);
    act(() => contenedor.querySelector('[role="menuitem"]').click());
    await act(async () => {});
    expect(contenedor.querySelector('h2').textContent).toBe('Editar stock');
  });

  it('quien solo ve no tiene el menú', async () => {
    permisos.lista = ['pecuaria:VER'];
    await montar();
    expect(contenedor.querySelector('[aria-label="Más opciones"]')).toBeNull();
  });

  it('con más de 15 movimientos, "Ver más"', async () => {
    const muchas = Array.from({ length: 20 }, (_, i) =>
      version(100 + i, '2026-11-20', `Entraron ${i}`, '', { cabezas: 10, pesoPromedio: 250, kgPvHa: 30, cabHa: 0.1 }, null),
    );
    api.getHistorial.mockResolvedValue({ data: { ...historial, versiones: muchas } });
    await montar();
    expect(contenedor.querySelectorAll('[data-testid="fila-historial"]')).toHaveLength(15);
    const boton = [...contenedor.querySelectorAll('button')].find((b) => b.textContent.startsWith('Ver más'));
    expect(boton.textContent).toBe('Ver más (5 más)');
    act(() => boton.click());
    expect(contenedor.querySelectorAll('[data-testid="fila-historial"]')).toHaveLength(20);
  });
});

describe('el pasto en la ficha del potrero (26/11)', () => {
  let contenedor;
  let root;
  const hoyISO = new Date().toLocaleDateString('sv-SE');
  const conPasto = {
    ...potrero,
    llevaPasto: true,
    pasto: { altura: 'MEDIO', fecha: hoyISO, momento: 'ENTRADA' },
    descanso: { conGanado: true, dias: 5, masDe: false },
  };
  const lecturas = [
    { id: 3, fecha: '2026-11-22', altura: 'BAJO', momento: 'RECORRIDA', anulada: false, usuario: 'capataz', nota: 'después de la lluvia' },
    { id: 2, fecha: '2026-11-20', altura: 'MEDIO', momento: 'ENTRADA', anulada: false, usuario: 'capataz' },
    { id: 1, fecha: '2026-11-18', altura: 'ALTO', momento: 'RECORRIDA', anulada: true, usuario: 'capataz' },
  ];
  const conMovimiento = {
    ...historial,
    versiones: historial.versiones.map((v, i) => (i === 1 ? { ...v, pasto: { salida: 'BAJO', entrada: 'ALTO' } } : v)),
    pasto: lecturas,
  };
  beforeEach(() => {
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    root = createRoot(contenedor);
    api.getPotrero.mockResolvedValue({ data: conPasto });
    api.getHistorial.mockResolvedValue({ data: conMovimiento });
    api.anularPasto.mockReset().mockResolvedValue({ data: {} });
    permisos.lista = ['pecuaria:VER', 'pecuaria:CREAR', 'pecuaria:EDITAR', 'pecuaria:ANULAR'];
  });
  afterEach(() => {
    act(() => root.unmount());
    contenedor.remove();
    vi.restoreAllMocks();
  });
  function Donde() {
    const { pathname, search } = useLocation();
    return <p data-testid="donde">{pathname + search}</p>;
  }
  const montar = async () => {
    act(() =>
      root.render(
        <MemoryRouter initialEntries={['/pecuaria/potreros/1']}>
          <Routes>
            <Route path="/pecuaria/potreros/:id" element={<PotreroPage />} />
            <Route path="/pecuaria/pasto/nuevo" element={<Donde />} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
  };

  it('arriba, el último pasto y cuánto hace que tiene ganado', async () => {
    await montar();
    expect(contenedor.querySelector('[data-testid="pasto-potrero"]').textContent).toBe('PastoMediohoy (al entrar)·con ganado hace 5 días');
  });

  it('sin pasto anotado ni versiones, no muestra el renglón; un corral tampoco', async () => {
    api.getPotrero.mockResolvedValue({ data: { ...conPasto, pasto: null, descanso: null } });
    await montar();
    expect(contenedor.querySelector('[data-testid="pasto-potrero"]')).toBeNull();
    act(() => root.unmount());
    root = createRoot(contenedor);
    api.getPotrero.mockResolvedValue({ data: { ...conPasto, tipo: 'CORRAL', llevaPasto: false } });
    await montar();
    expect(contenedor.querySelector('[data-testid="pasto-potrero"]')).toBeNull();
    act(() => contenedor.querySelector('[aria-label="Más opciones"]').click());
    expect([...contenedor.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).not.toContain('Anotar pasto');
  });

  it('"Anotar pasto" en el menú lleva a la recorrida con este potrero', async () => {
    await montar();
    act(() => contenedor.querySelector('[aria-label="Más opciones"]').click());
    const opciones = [...contenedor.querySelectorAll('[role="menuitem"]')];
    expect(opciones[0].textContent).toBe('Anotar pasto');
    act(() => opciones[0].click());
    expect(contenedor.querySelector('[data-testid="donde"]').textContent).toBe('/pecuaria/pasto/nuevo?potrero=1');
  });

  it('el movimiento desplegado dice el pasto al salir y al entrar', async () => {
    await montar();
    act(() => contenedor.querySelectorAll('[data-testid="fila-historial"]')[1].click());
    expect(contenedor.querySelector('[data-testid="pasto-historial"]').textContent).toBe('Pasto al salir: Bajo · al entrar: Alto');
  });

  it('la sección Pasto: las lecturas (las anuladas aparte) y Anular solo en las de una recorrida', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await montar();
    const seccion = contenedor.querySelector('[data-testid="pasto-lecturas"]');
    expect(seccion.closest('details').querySelector('summary').textContent).toBe('Pasto (2)');
    const items = [...seccion.querySelectorAll('li')];
    expect(items.map((li) => li.textContent)).toEqual([
      '22/11/2026Bajoen una recorrida · capataz · después de la lluviaAnular',
      '20/11/2026Medioal entrar · capataz',
      '18/11/2026Altoen una recorrida · capataz(anulada)',
    ]);
    await act(async () => items[0].querySelector('button').click());
    expect(api.anularPasto).toHaveBeenCalledWith(3);
  });

  it('sin el permiso de anular, no hay "Anular"', async () => {
    permisos.lista = ['pecuaria:VER', 'pecuaria:CREAR'];
    await montar();
    expect(contenedor.querySelector('[data-testid="pasto-lecturas"] button')).toBeNull();
  });
});
