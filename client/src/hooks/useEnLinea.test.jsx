// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEnLinea } from './useEnLinea.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let valores;
function Sonda() {
  valores.push(useEnLinea());
  return null;
}

let contenedor;
let root;

function cambiarConexion(enLinea) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(enLinea);
  act(() => window.dispatchEvent(new Event(enLinea ? 'online' : 'offline')));
}

beforeEach(() => {
  valores = [];
  contenedor = document.createElement('div');
  root = createRoot(contenedor);
});

afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
});

describe('useEnLinea', () => {
  it('arranca con lo que dice el navegador', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => root.render(<Sonda />));
    expect(valores.at(-1)).toBe(false);
  });

  it('se entera cuando se corta y cuando vuelve la conexión', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    act(() => root.render(<Sonda />));
    expect(valores.at(-1)).toBe(true);

    cambiarConexion(false);
    expect(valores.at(-1)).toBe(false);

    cambiarConexion(true);
    expect(valores.at(-1)).toBe(true);
  });

  it('al desmontar deja de escuchar los eventos', () => {
    const quitar = vi.spyOn(window, 'removeEventListener');
    act(() => root.render(<Sonda />));
    act(() => root.unmount());
    const eventos = quitar.mock.calls.map(([nombre]) => nombre);
    expect(eventos).toEqual(expect.arrayContaining(['online', 'offline']));
    root = createRoot(contenedor); // para el afterEach
  });
});
