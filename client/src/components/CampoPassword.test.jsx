// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CampoPassword } from './ui.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let contenedor;
let root;

beforeEach(() => {
  contenedor = document.createElement('div');
  root = createRoot(contenedor);
});

afterEach(() => {
  act(() => root.unmount());
});

describe('CampoPassword', () => {
  it('arranca oculta y el ojo la muestra y la vuelve a ocultar', () => {
    act(() => root.render(<CampoPassword placeholder="Contraseña" name="password" />));
    const input = contenedor.querySelector('input');
    const boton = contenedor.querySelector('button');
    expect(input.type).toBe('password');
    expect(input.name).toBe('password');
    expect(boton.type).toBe('button'); // no manda el formulario
    expect(boton.getAttribute('aria-label')).toBe('Mostrar contraseña');

    act(() => boton.click());
    expect(input.type).toBe('text');
    expect(boton.getAttribute('aria-label')).toBe('Ocultar contraseña');

    act(() => boton.click());
    expect(input.type).toBe('password');
  });

  it('pasa la ref al input (para react-hook-form)', () => {
    let nodo = null;
    act(() => root.render(<CampoPassword ref={(n) => (nodo = n)} />));
    expect(nodo).toBe(contenedor.querySelector('input'));
  });
});
