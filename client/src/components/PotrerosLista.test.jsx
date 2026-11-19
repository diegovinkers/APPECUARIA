// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import PotrerosLista, { ordenarPotreros } from './PotrerosLista.jsx';
import { ConPanel, textoCompu } from '../test-utils.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CN = { grupo: 'CN', nombre: 'Campo natural' };
const potrero = (id, nombre, cabezas, hectareas, extra = {}) => ({
  id,
  nombre,
  orden: id,
  usoActual: CN,
  hectareas,
  stock: {
    cabezas,
    cabHa: hectareas ? cabezas / hectareas : null,
    ugHa: null,
    kilosCompletos: true,
    lotes: cabezas ? [{ loteId: id, lote: `${nombre} · Vacas`, categoriaId: 9, categoria: 'Vacas', cabezas }] : [],
  },
  ...extra,
});

describe('ordenarPotreros', () => {
  const lista = [potrero(1, '1', 10, 5), potrero(2, '2', 50, 10), potrero(3, '3', 0, null, { hectareasAConfirmar: true })];
  it('por cabezas de mayor a menor; por ha, los que no tienen el dato al final', () => {
    expect(ordenarPotreros(lista, { col: 'cabezas', dir: 'desc' }).map((p) => p.nombre)).toEqual(['2', '1', '3']);
    expect(ordenarPotreros(lista, { col: 'hectareas', dir: 'asc' }).map((p) => p.nombre)).toEqual(['1', '2', '3']);
    expect(ordenarPotreros(lista, { col: 'hectareas', dir: 'desc' }).map((p) => p.nombre)).toEqual(['2', '1', '3']);
  });
  it('por potrero sigue el orden de la planilla', () => {
    expect(ordenarPotreros(lista, { col: 'potrero', dir: 'desc' }).map((p) => p.nombre)).toEqual(['3', '2', '1']);
  });
});

describe('la tabla de potreros', () => {
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

  function Donde() {
    const { search } = useLocation();
    return <p data-testid="donde">{search}</p>;
  }
  const montar = (potreros, ruta = '/pecuaria/potreros') =>
    act(() =>
      root.render(
        <MemoryRouter initialEntries={[ruta]}>
          <Routes>
            <Route
              path="/pecuaria/potreros"
              element={
                <ConPanel>
                  <PotrerosLista potreros={potreros} />
                  <Donde />
                </ConPanel>
              }
            />
          </Routes>
        </MemoryRouter>,
      ),
    );
  const primeraColumna = () => [...contenedor.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td a').textContent);
  const titulo = (t) => [...contenedor.querySelectorAll('thead button')].find((b) => b.textContent.startsWith(t));
  const donde = () => contenedor.querySelector('[data-testid="donde"]').textContent;

  it('una fila por potrero con cabezas de qué, y los totales abajo', () => {
    montar([potrero(1, '1', 10, 5), potrero(2, '2', 50, 10), potrero(3, '3', 0, 4)]);
    const filas = [...contenedor.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map(textoCompu));
    expect(filas[1]).toEqual(['2', 'Campo natural', '10', '50', '50 Vacas', '5', '—']);
    expect(filas[2][4]).toBe('vacío');
    expect(textoCompu(contenedor.querySelector('tfoot'))).toMatch(/Total.*3 potreros.*19.*60.*cabezas.*3,16/);
  });

  it('el título ordena y queda en la dirección', () => {
    montar([potrero(1, '1', 10, 5), potrero(2, '2', 50, 10), potrero(3, '3', 0, 4)]);
    act(() => titulo('Cabezas').click());
    expect(primeraColumna()).toEqual(['2', '1', '3']);
    expect(donde()).toBe('?orden=cabezas');
    act(() => titulo('Cabezas').click());
    expect(primeraColumna()).toEqual(['3', '1', '2']);
    expect(donde()).toBe('?orden=cabezas&dir=asc');
  });

  it('en el celular: debajo del nombre el uso con color y qué hay, sin repetir las cabezas; cab/ha debajo de Cabezas', () => {
    const dos = { ...potrero(4, '4', 65, 10), stock: { ...potrero(4, '4', 65, 10).stock, lotes: [
      { loteId: 41, lote: '4 · Vacas', categoriaId: 9, categoria: 'Vacas', cabezas: 40 },
      { loteId: 42, lote: '4 · Terneros', categoriaId: 8, categoria: 'Terneros', cabezas: 25 },
    ] } };
    const arroz = potrero(5, '5', 0, 30, { usoActual: { grupo: 'OTRO', nombre: 'Arroz' } });
    montar([potrero(2, '2', 50, 10), dos, arroz]);
    const lineas = [...contenedor.querySelectorAll('[data-testid="linea-celular"]')].map((l) => l.textContent);
    expect(lineas).toEqual(['Campo naturalVacas', 'Campo natural40 Vacas · 25 Terneros', 'Arroz']);
    // El uso va como etiqueta de color.
    expect(contenedor.querySelector('[data-testid="linea-celular"] span').className).toContain('bg-lime');
    const cabezas = contenedor.querySelectorAll('tbody tr')[0].querySelectorAll('td')[3];
    expect(cabezas.textContent).toBe('505 /ha');
    const escondidas = [...contenedor.querySelectorAll('thead th')].filter((th) => th.className.includes('hidden md:table-cell'));
    expect(escondidas.map((th) => th.textContent.replace(/[▲▼↕]/g, '').trim())).toEqual(['Uso', 'ha', 'Categorías', 'cab/ha']);
  });

  it('la barra de carga se llena según el potrero más cargado (los sin peso no tienen barra)', () => {
    const conUg = (id, ugHa, extra = {}) => {
      const p = potrero(id, String(id), 10, 5);
      return { ...p, stock: { ...p.stock, ugHa, ...extra } };
    };
    montar([conUg(1, 2), conUg(2, 4), conUg(3, 3, { kilosCompletos: false })]);
    const anchos = [...contenedor.querySelectorAll('[data-testid="barra-carga"] > span')].map((b) => b.style.width);
    expect(anchos).toEqual(['50%', '100%']);
  });

  it('los filtros van al panel izquierdo, con el botón "Filtros" y cuántos hay puestos', () => {
    montar([potrero(1, '1', 10, 5)], '/pecuaria/potreros?grupo=CN&categoria=9');
    const botonFiltros = [...contenedor.querySelectorAll('button')].find((b) => b.textContent.startsWith('Filtros'));
    expect(botonFiltros.textContent).toBe('Filtros2');
  });

  it('de a 50 por página; cambiar un filtro vuelve a la 1', () => {
    const muchos = Array.from({ length: 60 }, (_, i) => potrero(i + 1, String(i + 1), 1, 1));
    montar(muchos, '/pecuaria/potreros?pagina=2');
    expect(primeraColumna()).toHaveLength(10);
    expect(primeraColumna()[0]).toBe('51');
    act(() => [...contenedor.querySelectorAll('[role="group"] button')].find((b) => b.textContent === 'CN').click());
    expect(donde()).toBe('?grupo=CN');
    expect(primeraColumna()).toHaveLength(50);
  });
});
