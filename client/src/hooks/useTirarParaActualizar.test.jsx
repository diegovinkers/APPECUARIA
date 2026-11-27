// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useTirarParaActualizar, { UMBRAL, puedeTirar } from './useTirarParaActualizar';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Un toque del dedo en y (px), sobre el elemento.
function dedo(el, tipo, y) {
  const e = new Event(tipo, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'touches', { value: tipo === 'touchend' ? [] : [{ clientY: y }] });
  el.dispatchEvent(e);
  return e;
}
const arriba = (el, valor) => Object.defineProperty(el, 'scrollTop', { value: valor, configurable: true });

describe('puedeTirar', () => {
  it('solo si todo lo que scrollea está arriba de todo, y nunca en una ventana o un campo', () => {
    document.body.innerHTML = `
      <div id="caja"><div id="tabla"><p id="fila">fila</p></div>
        <div role="dialog"><p id="modal">detalle</p></div><input id="campo" /></div>
      <p id="afuera">afuera</p>`;
    const caja = document.getElementById('caja');
    const fila = document.getElementById('fila');
    expect(puedeTirar(fila, caja)).toBe(true);
    arriba(document.getElementById('tabla'), 40);
    expect(puedeTirar(fila, caja)).toBe(false);
    arriba(document.getElementById('tabla'), 0);
    arriba(caja, 5);
    expect(puedeTirar(fila, caja)).toBe(false);
    arriba(caja, 0);
    expect(puedeTirar(document.getElementById('modal'), caja)).toBe(false);
    expect(puedeTirar(document.getElementById('campo'), caja)).toBe(false);
    expect(puedeTirar(document.getElementById('afuera'), caja)).toBe(false);
  });
});

describe('tirar para actualizar (27/11)', () => {
  let contenedor;
  let root;
  let estado;
  const onActualizar = vi.fn();

  function Prueba() {
    const [caja, setCaja] = useState(null);
    estado = useTirarParaActualizar(caja, onActualizar);
    return (
      <div ref={setCaja} data-testid="caja">
        <p data-testid="fila">fila</p>
      </div>
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    onActualizar.mockReset();
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    root = createRoot(contenedor);
    act(() => root.render(<Prueba />));
  });
  afterEach(() => {
    act(() => root.unmount());
    contenedor.remove();
    vi.useRealTimers();
  });
  const fila = () => contenedor.querySelector('[data-testid="fila"]');

  it('tirar poco no actualiza: la ruedita vuelve', () => {
    act(() => dedo(fila(), 'touchstart', 100));
    act(() => dedo(fila(), 'touchmove', 160));
    expect(estado.distancia).toBe(30);
    expect(estado.listo).toBe(false);
    act(() => dedo(fila(), 'touchend'));
    expect(estado.distancia).toBe(0);
    expect(onActualizar).not.toHaveBeenCalled();
  });

  it('tirar pasado el umbral y soltar actualiza, con la ruedita girando un rato', async () => {
    act(() => dedo(fila(), 'touchstart', 100));
    let movida;
    act(() => {
      movida = dedo(fila(), 'touchmove', 100 + UMBRAL * 2 + 10);
    });
    expect(movida.defaultPrevented).toBe(true);
    expect(estado.listo).toBe(true);
    act(() => dedo(fila(), 'touchend'));
    expect(onActualizar).toHaveBeenCalledTimes(1);
    expect(estado.actualizando).toBe(true);
    // Mientras actualiza, otro tirón no hace nada.
    act(() => dedo(fila(), 'touchstart', 100));
    act(() => dedo(fila(), 'touchmove', 400));
    act(() => dedo(fila(), 'touchend'));
    expect(onActualizar).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(estado.actualizando).toBe(false);
    expect(estado.distancia).toBe(0);
  });

  it('para arriba es un scroll común; con la lista bajada, tampoco tira', () => {
    act(() => dedo(fila(), 'touchstart', 300));
    const e = dedo(fila(), 'touchmove', 200);
    expect(e.defaultPrevented).toBe(false);
    act(() => dedo(fila(), 'touchend'));
    arriba(contenedor.querySelector('[data-testid="caja"]'), 120);
    act(() => dedo(fila(), 'touchstart', 100));
    act(() => dedo(fila(), 'touchmove', 400));
    act(() => dedo(fila(), 'touchend'));
    expect(onActualizar).not.toHaveBeenCalled();
  });
});
