// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConPanel } from '../../test-utils.jsx';

// Procesos como página propia (23/11).
const estancia = vi.hoisted(() => ({ campoId: 1, todas: false }));
vi.mock('../../context/EstanciaContext', () => ({
  useEstancia: () => ({
    campoId: estancia.campoId,
    campo: estancia.campoId ? { id: 1, nombre: 'La Gateada' } : null,
    todas: estancia.todas,
    grupo: 'estancias',
    campos: [{ id: 1, nombre: 'La Gateada' }],
    errors: [],
  }),
}));
// La lista se prueba aparte (ProcesosLista.test.jsx): acá, qué recibe.
vi.mock('../../components/ProcesosLista', () => ({
  default: ({ campoId, todas }) => <p data-testid="lista">{todas ? 'todas' : `campo ${campoId}`}</p>,
}));

const { default: ProcesosPage } = await import('./ProcesosPage.jsx');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let contenedor;
let root;
beforeEach(() => {
  estancia.campoId = 1;
  estancia.todas = false;
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
});
afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
});

function montar() {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={['/pecuaria/procesos']}>
        <ConPanel>
          <Routes>
            <Route path="/pecuaria/procesos" element={<ProcesosPage />} />
          </Routes>
        </ConPanel>
      </MemoryRouter>,
    ),
  );
}
const lista = () => contenedor.querySelector('[data-testid="lista"]')?.textContent;

describe('la página Procesos', () => {
  it('título con la estancia y la lista de esa estancia', () => {
    montar();
    expect(contenedor.querySelector('h1').textContent).toBe('ProcesosLa Gateada');
    expect(lista()).toBe('campo 1');
  });

  it('con "Todas las estancias", la lista de todas', () => {
    estancia.campoId = null;
    estancia.todas = true;
    montar();
    expect(lista()).toBe('todas');
  });
});
