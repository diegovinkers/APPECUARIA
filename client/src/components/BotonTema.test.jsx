// @vitest-environment jsdom
// El botón claro / oscuro de la barra de arriba (celular, 24/11). Si nunca se
// eligió nada, sigue al celular (Automático); al tocarlo, queda fijo.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemaProvider } from '../context/TemaContext.jsx';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { nombre: 'Prueba', permisos: [] } }) }));
vi.mock('../context/EstanciaContext', () => ({ useEstancia: () => ({ campos: [] }) }));

const { BotonTema } = await import('./Marco.jsx');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// El celular en oscuro (o no).
const celular = (oscuro) => {
  window.matchMedia = () => ({ matches: oscuro, addEventListener: () => {}, removeEventListener: () => {} });
};

let contenedor;
let root;
beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.tema;
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
});
afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
  delete window.matchMedia;
});

const montar = () => act(() => root.render(<TemaProvider><BotonTema /></TemaProvider>));
const boton = () => contenedor.querySelector('[data-testid="boton-tema"]');

describe('el botón claro / oscuro', () => {
  it('sin elegir nada, sigue al celular: en oscuro muestra la luna', () => {
    celular(true);
    montar();
    expect(document.documentElement.dataset.tema).toBe('oscuro');
    expect(boton().getAttribute('aria-label')).toBe('Pantalla oscura: pasar a clara');
    expect(localStorage.getItem('tema')).toBeNull();
  });

  it('sin elegir nada y el celular en claro: el sol; al tocarlo pasa a oscuro y queda fijo, y otra vez a claro', () => {
    celular(false);
    montar();
    expect(document.documentElement.dataset.tema).toBe('claro');
    expect(boton().getAttribute('aria-label')).toBe('Pantalla clara: pasar a oscura');
    act(() => boton().click());
    expect(document.documentElement.dataset.tema).toBe('oscuro');
    expect(localStorage.getItem('tema')).toBe('oscuro');
    expect(boton().getAttribute('aria-label')).toBe('Pantalla oscura: pasar a clara');
    act(() => boton().click());
    expect(document.documentElement.dataset.tema).toBe('claro');
    expect(localStorage.getItem('tema')).toBe('claro');
  });

  it('solo en el celular (en la compu está en el menú)', () => {
    montar();
    expect(boton().className).toMatch(/\blg:hidden\b/);
  });
});
