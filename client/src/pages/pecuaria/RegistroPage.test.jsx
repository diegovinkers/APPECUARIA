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
            <Route path="/pecuaria/historial" element={<RegistroPage />} />
            <Route path="/pecuaria/movimientos" element={<RedirigirA ruta="/pecuaria/historial" />} />
            <Route path="/pecuaria/registro" element={<RedirigirA ruta="/pecuaria/historial" />} />
            <Route path="/pecuaria/procesos" element={<p data-testid="lista">página procesos</p>} />
          </Routes>
          <Donde />
        </ConPanel>
      </MemoryRouter>,
    ),
  );
}
const pestania = (texto) => [...contenedor.querySelectorAll('nav[aria-label="Pestañas del historial"] a')].find((a) => a.textContent === texto);
const lista = () => contenedor.querySelector('[data-testid="lista"]').textContent;
const donde = () => contenedor.querySelector('[data-testid="donde"]').textContent;

describe('Historial (antes Registro): pestañas Movimientos y Eventos (20/11)', () => {
  it('sin ?ver arranca en Movimientos; con ?ver=eventos, en Eventos', () => {
    montar('/pecuaria/historial');
    expect(pestania('Movimientos').getAttribute('aria-current')).toBe('page');
    expect(pestania('Eventos').getAttribute('aria-current')).toBeNull();
    expect(lista()).toBe('movimientos');
    act(() => root.unmount());
    root = createRoot(contenedor);
    montar('/pecuaria/historial?ver=eventos');
    expect(pestania('Eventos').getAttribute('aria-current')).toBe('page');
    expect(lista()).toBe('eventos');
  });

  it('cambiar de pestaña conserva el período y el potrero, pero no el tipo', () => {
    montar('/pecuaria/historial?periodo=7&mpotrero=3&mtipo=9');
    act(() => pestania('Eventos').dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
    expect(donde()).toBe('/pecuaria/historial?periodo=7&mpotrero=3&ver=eventos');
    expect(lista()).toBe('eventos');
    act(() => pestania('Movimientos').dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
    expect(donde()).toBe('/pecuaria/historial?periodo=7&mpotrero=3');
  });

  it('la dirección vieja /pecuaria/movimientos lleva a Historial con sus filtros', () => {
    montar('/pecuaria/movimientos?ver=eventos&periodo=mes');
    expect(donde()).toBe('/pecuaria/historial?ver=eventos&periodo=mes');
    expect(lista()).toBe('eventos');
  });

  it('"Registro" se llama "Historial": la dirección vieja lleva a la nueva, con sus filtros (25/11)', () => {
    montar('/pecuaria/registro?ver=eventos&periodo=7');
    expect(donde()).toBe('/pecuaria/historial?ver=eventos&periodo=7');
    expect(lista()).toBe('eventos');
  });

  it('Procesos ya no es una pestaña: ?ver=procesos lleva a /pecuaria/procesos con sus filtros (23/11)', () => {
    montar('/pecuaria/historial?ver=procesos&pestado=CERRADO');
    expect(donde()).toBe('/pecuaria/procesos?pestado=CERRADO');
    expect(lista()).toBe('página procesos');
  });

  it('las pestañas son dos y la barra no cambia al pasar a Eventos: anotar va en el "+" (24/11)', () => {
    montar('/pecuaria/historial');
    expect([...contenedor.querySelectorAll('nav[aria-label="Pestañas del historial"] a')].map((a) => a.textContent)).toEqual(['Movimientos', 'Eventos']);
    const barra = () => contenedor.querySelector('[data-testid="barra-registro"]');
    const hijos = () => [...barra().children].map((c) => c.tagName);
    const antes = hijos();
    act(() => pestania('Eventos').dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
    expect(hijos()).toEqual(antes);
    expect(barra().querySelectorAll('button')).toHaveLength(0);
    expect(contenedor.textContent).not.toMatch(/Anotar/);
  });

  it('las pestañas y los filtros van abajo, después de la tabla, y se esconden acostado (24/11)', () => {
    montar('/pecuaria/historial?ver=eventos');
    const barra = contenedor.querySelector('[data-testid="barra-registro"]');
    expect(barra.querySelector('nav[aria-label="Pestañas del historial"]')).not.toBeNull();
    expect(barra.className).toMatch(/acostado:hidden/);
    // La barra es lo último de la pantalla.
    expect(barra.nextElementSibling).toBeNull();
  });
});
