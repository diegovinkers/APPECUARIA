// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import PanelFiltros, { DestinoBotonFiltros, DestinoFiltros, PanelFiltrosProvider } from './PanelFiltros.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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

const botonFiltros = () => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.startsWith('Filtros'));

describe('PanelFiltros', () => {
  it('con un lugar al lado del título, el botón "Filtros" va ahí y los filtros al panel', () => {
    act(() =>
      root.render(
        <PanelFiltrosProvider>
          <aside>
            <DestinoFiltros />
          </aside>
          <h1>
            Potreros <DestinoBotonFiltros />
          </h1>
          <section>
            <PanelFiltros activos={2} onLimpiar={() => {}}>
              <p>Filtro de prueba</p>
            </PanelFiltros>
          </section>
        </PanelFiltrosProvider>,
      ),
    );
    expect(contenedor.querySelector('h1').contains(botonFiltros())).toBe(true);
    expect(botonFiltros().textContent).toBe('Filtros2');
    expect(contenedor.querySelector('aside').textContent).toContain('Filtro de prueba');
    expect(contenedor.querySelector('section').textContent).toBe('');
  });

  it('sin ese lugar, el botón queda donde está la pantalla', () => {
    act(() =>
      root.render(
        <PanelFiltrosProvider>
          <section>
            <PanelFiltros>
              <p>Filtro</p>
            </PanelFiltros>
          </section>
        </PanelFiltrosProvider>,
      ),
    );
    expect(contenedor.querySelector('section').contains(botonFiltros())).toBe(true);
  });
});
