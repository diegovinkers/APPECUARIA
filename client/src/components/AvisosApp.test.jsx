// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sw = vi.hoisted(() => ({ hayVersionNueva: false, actualizar: null }));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.hayVersionNueva, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: sw.actualizar,
  }),
}));

const { default: AvisosApp } = await import('./AvisosApp.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let contenedor;
let root;

beforeEach(() => {
  sw.hayVersionNueva = false;
  sw.actualizar = vi.fn();
  contenedor = document.createElement('div');
  root = createRoot(contenedor);
});

afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
});

describe('AvisosApp', () => {
  it('sin conexión dice claro que no se guarda nada (no promete guardarlo después)', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => root.render(<AvisosApp />));
    expect(contenedor.textContent).toBe('Sin conexión: no se puede guardar nada hasta que vuelva la señal.');
  });

  it('con conexión y sin versión nueva, no muestra nada', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    act(() => root.render(<AvisosApp />));
    expect(contenedor.textContent).toBe('');
  });

  it('la versión nueva se aplica solo al tocar "Actualizar"', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    sw.hayVersionNueva = true;
    act(() => root.render(<AvisosApp />));
    expect(contenedor.textContent).toContain('Hay una versión nueva de la app.');
    expect(sw.actualizar).not.toHaveBeenCalled();
    const boton = [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Actualizar');
    act(() => boton.click());
    expect(sw.actualizar).toHaveBeenCalledWith(true);
  });
});
