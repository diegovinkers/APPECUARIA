// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConPanel } from '../../test-utils.jsx';

vi.mock('../../context/EstanciaContext', () => ({
  useEstancia: () => ({ campoId: 1, campo: { id: 1, nombre: 'La Gateada' }, todas: false, grupo: 'estancias', campos: [] }),
}));
vi.mock('../../hooks/usePotreros', () => ({ default: () => ({ errors: [], potreros: [] }) }));
// La lista se prueba aparte: acá solo importa qué pestaña recibe.
vi.mock('../../components/MovimientosLista', () => ({ default: ({ ver }) => <p data-testid="lista">{ver}</p> }));
vi.mock('../../components/ProcesosLista', () => ({ default: () => <p data-testid="lista">procesos</p> }));

const { default: RegistroPage } = await import('./RegistroPage.jsx');
const { RedirigirA } = await import('./comun.jsx');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Donde() {
  const l = useLocation();
  return <p data-testid="donde">{`${l.pathname}${l.search}`}</p>;
}

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

function montar(ruta) {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[ruta]}>
        <ConPanel>
          <Routes>
            <Route path="/pecuaria/registro" element={<RegistroPage />} />
            <Route path="/pecuaria/movimientos" element={<RedirigirA ruta="/pecuaria/registro" />} />
          </Routes>
          <Donde />
        </ConPanel>
      </MemoryRouter>,
    ),
  );
}
const pestania = (texto) => [...contenedor.querySelectorAll('nav[aria-label="Pestañas del registro"] a')].find((a) => a.textContent === texto);
const lista = () => contenedor.querySelector('[data-testid="lista"]').textContent;
const donde = () => contenedor.querySelector('[data-testid="donde"]').textContent;

describe('Registro: pestañas Movimientos y Eventos (20/11)', () => {
  it('sin ?ver arranca en Movimientos; con ?ver=eventos, en Eventos', () => {
    montar('/pecuaria/registro');
    expect(pestania('Movimientos').getAttribute('aria-current')).toBe('page');
    expect(pestania('Eventos').getAttribute('aria-current')).toBeNull();
    expect(lista()).toBe('movimientos');
    act(() => root.unmount());
    root = createRoot(contenedor);
    montar('/pecuaria/registro?ver=eventos');
    expect(pestania('Eventos').getAttribute('aria-current')).toBe('page');
    expect(lista()).toBe('eventos');
  });

  it('cambiar de pestaña conserva el período y el potrero, pero no el tipo', () => {
    montar('/pecuaria/registro?periodo=7&mpotrero=3&mtipo=9');
    act(() => pestania('Eventos').dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
    expect(donde()).toBe('/pecuaria/registro?periodo=7&mpotrero=3&ver=eventos');
    expect(lista()).toBe('eventos');
    act(() => pestania('Movimientos').dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
    expect(donde()).toBe('/pecuaria/registro?periodo=7&mpotrero=3');
  });

  it('la dirección vieja /pecuaria/movimientos lleva a Registro con sus filtros', () => {
    montar('/pecuaria/movimientos?ver=eventos&periodo=mes');
    expect(donde()).toBe('/pecuaria/registro?ver=eventos&periodo=mes');
    expect(lista()).toBe('eventos');
  });

  it('con ?ver=procesos, la pestaña Procesos; al cambiar de pestaña conserva el período', () => {
    montar('/pecuaria/registro?ver=procesos&periodo=7');
    expect(pestania('Procesos').getAttribute('aria-current')).toBe('page');
    expect(lista()).toBe('procesos');
    act(() => pestania('Eventos').dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
    expect(donde()).toBe('/pecuaria/registro?ver=eventos&periodo=7');
    act(() => pestania('Procesos').dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
    expect(donde()).toBe('/pecuaria/registro?ver=procesos&periodo=7');
  });
});
