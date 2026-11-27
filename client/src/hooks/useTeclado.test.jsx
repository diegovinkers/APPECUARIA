// @vitest-environment jsdom
// El teclado del celular (27/11): la app sabe si está abierto y cuánto se ve
// arriba de él (<html data-teclado>, --teclado-arriba y --teclado-alto).
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useTeclado, { CERRADO, UMBRAL, calcularTeclado, cerrarTecladoConEnter, esEditable, traerALaVista } from './useTeclado';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('esEditable', () => {
  it('solo lo que abre el teclado', () => {
    const el = (html) => {
      document.body.innerHTML = html;
      return document.body.firstElementChild;
    };
    expect(esEditable(el('<input />'))).toBe(true);
    expect(esEditable(el('<input type="search" />'))).toBe(true);
    expect(esEditable(el('<input type="number" />'))).toBe(true);
    expect(esEditable(el('<textarea></textarea>'))).toBe(true);
    expect(esEditable(el('<input type="checkbox" />'))).toBe(false);
    expect(esEditable(el('<input type="date" />'))).toBe(false);
    expect(esEditable(el('<input disabled />'))).toBe(false);
    expect(esEditable(el('<input readonly />'))).toBe(false);
    expect(esEditable(el('<select></select>'))).toBe(false);
    expect(esEditable(el('<button>x</button>'))).toBe(false);
    expect(esEditable(null)).toBe(false);
  });
});

describe('calcularTeclado', () => {
  it('con VirtualKeyboard (Android): manda el alto del teclado', () => {
    expect(calcularTeclado({ tecladoAlto: 330, ventanaAlto: 880 })).toEqual({ abierto: true, arriba: 0, alto: 550 });
    expect(calcularTeclado({ tecladoAlto: 0, ventanaAlto: 880 })).toBe(CERRADO);
    expect(calcularTeclado({ tecladoAlto: UMBRAL - 1, ventanaAlto: 880 })).toBe(CERRADO);
  });

  it('con visualViewport (iPhone): lo que se achicó lo visible, con un campo enfocado', () => {
    const base = { base: 844, visibleAlto: 500, visibleArriba: 40, enfocado: true };
    expect(calcularTeclado(base)).toEqual({ abierto: true, arriba: 40, alto: 500 });
    // Sin campo enfocado no es el teclado.
    expect(calcularTeclado({ ...base, enfocado: false })).toBe(CERRADO);
    // La barra del navegador (poco) no es el teclado.
    expect(calcularTeclado({ ...base, visibleAlto: 790 })).toBe(CERRADO);
    // Con zoom, la app no se toca.
    expect(calcularTeclado({ ...base, escala: 1.5 })).toBe(CERRADO);
  });
});

describe('cerrarTecladoConEnter', () => {
  it('la tecla "buscar" saca el cursor del buscador (se cierra el teclado)', () => {
    document.body.innerHTML = '<input id="b" />';
    const input = document.getElementById('b');
    input.focus();
    const otra = { key: 'a', nativeEvent: {}, currentTarget: input, preventDefault: vi.fn() };
    cerrarTecladoConEnter(otra);
    expect(document.activeElement).toBe(input);
    const enter = { key: 'Enter', nativeEvent: {}, currentTarget: input, preventDefault: vi.fn() };
    cerrarTecladoConEnter(enter);
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(document.activeElement).not.toBe(input);
  });
});

describe('traerALaVista', () => {
  it('si el campo quedó tapado, lo centra en lo que se ve de su caja', () => {
    document.body.innerHTML = '<div id="caja" style="overflow-y: auto"><input id="c" /></div>';
    const caja = document.getElementById('caja');
    const campo = document.getElementById('c');
    Object.defineProperty(caja, 'scrollHeight', { value: 2000 });
    Object.defineProperty(caja, 'clientHeight', { value: 800 });
    caja.getBoundingClientRect = () => ({ top: 50, bottom: 850 });
    campo.getBoundingClientRect = () => ({ top: 700, bottom: 740, height: 40 });
    // Se ve de 0 a 500: el centro de lo visible de la caja es 275; el del campo, 720.
    traerALaVista(campo, { arriba: 0, alto: 500 });
    expect(caja.scrollTop).toBe(445);
    // Si ya se ve, no se mueve.
    caja.scrollTop = 0;
    traerALaVista(campo, { arriba: 0, alto: 800 });
    expect(caja.scrollTop).toBe(0);
  });
});

// Un visualViewport de mentira (jsdom no tiene).
function visualViewportFalso() {
  const vv = new EventTarget();
  Object.assign(vv, { height: 800, offsetTop: 0, scale: 1 });
  return vv;
}

describe('useTeclado', () => {
  let contenedor;
  let root;
  let vista;
  const raiz = document.documentElement;
  function Prueba({ activo = true }) {
    vista = useTeclado(activo);
    return <input data-testid="campo" />;
  }
  const montar = (activo = true) => act(() => root.render(<Prueba activo={activo} />));
  const cuadro = () => act(() => new Promise((r) => requestAnimationFrame(() => r())));

  beforeEach(() => {
    contenedor = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(contenedor);
    root = createRoot(contenedor);
    Object.defineProperty(document.documentElement, 'clientHeight', { value: 800, configurable: true });
    window.innerHeight = 800;
  });
  afterEach(() => {
    act(() => root.unmount());
    contenedor.remove();
    delete window.visualViewport;
    delete navigator.virtualKeyboard;
  });

  it('iPhone: con un campo enfocado y lo visible achicado, marca <html> y dice cuánto se ve; al cerrar, lo saca', async () => {
    const vv = visualViewportFalso();
    window.visualViewport = vv;
    montar();
    expect(vista.abierto).toBe(false);
    expect(raiz.hasAttribute('data-teclado')).toBe(false);

    contenedor.querySelector('input').focus();
    await cuadro();
    act(() => {
      Object.assign(vv, { height: 450, offsetTop: 30 });
      vv.dispatchEvent(new Event('resize'));
    });
    expect(vista).toEqual({ abierto: true, arriba: 30, alto: 450 });
    expect(raiz.hasAttribute('data-teclado')).toBe(true);
    expect(raiz.style.getPropertyValue('--teclado-arriba')).toBe('30px');
    expect(raiz.style.getPropertyValue('--teclado-alto')).toBe('450px');

    // Se cierra el teclado (el campo sigue enfocado: la flecha de Android).
    act(() => {
      Object.assign(vv, { height: 800, offsetTop: 0 });
      vv.dispatchEvent(new Event('resize'));
    });
    expect(vista.abierto).toBe(false);
    expect(raiz.hasAttribute('data-teclado')).toBe(false);
    expect(raiz.style.getPropertyValue('--teclado-alto')).toBe('');
  });

  it('Android: prende VirtualKeyboard (el navegador no corre nada) y usa su alto; al desmontar lo apaga', () => {
    const vk = new EventTarget();
    vk.overlaysContent = false;
    vk.boundingRect = { height: 0 };
    navigator.virtualKeyboard = vk;
    montar();
    expect(vk.overlaysContent).toBe(true);
    act(() => {
      vk.boundingRect = { height: 300 };
      vk.dispatchEvent(new Event('geometrychange'));
    });
    expect(vista).toEqual({ abierto: true, arriba: 0, alto: 500 });
    expect(raiz.hasAttribute('data-teclado')).toBe(true);
    act(() => root.unmount());
    root = createRoot(contenedor);
    expect(vk.overlaysContent).toBe(false);
    expect(raiz.hasAttribute('data-teclado')).toBe(false);
  });

  it('sin sesión (activo = false) no mide ni toca nada', () => {
    const vk = new EventTarget();
    vk.overlaysContent = false;
    vk.boundingRect = { height: 300 };
    navigator.virtualKeyboard = vk;
    montar(false);
    expect(vk.overlaysContent).toBe(false);
    expect(vista).toBe(CERRADO);
    expect(raiz.hasAttribute('data-teclado')).toBe(false);
  });
});
