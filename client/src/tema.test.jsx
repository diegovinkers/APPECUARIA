// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SelectorTema } from './components/Marco';
import { TemaProvider } from './context/TemaContext';
import { aplicarTema, guardarPreferencia, leerPreferencia, resolverTema } from './tema';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Un localStorage de mentira, para no depender del de jsdom.
function almacen(inicial = {}) {
  const datos = { ...inicial };
  return {
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => {
      datos[k] = String(v);
    },
    removeItem: (k) => {
      delete datos[k];
    },
    datos,
  };
}

describe('tema: preferencia', () => {
  it('sin nada guardado, o con algo raro, es automático', () => {
    expect(leerPreferencia(almacen())).toBe('auto');
    expect(leerPreferencia(almacen({ tema: 'violeta' }))).toBe('auto');
    expect(leerPreferencia(almacen({ tema: 'oscuro' }))).toBe('oscuro');
  });

  it('si el almacenamiento falla (ventana privada), no rompe', () => {
    const roto = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(leerPreferencia(roto)).toBe('auto');
    expect(() => guardarPreferencia('oscuro', roto)).not.toThrow();
  });

  it('guardar "auto" borra lo guardado', () => {
    const s = almacen({ tema: 'claro' });
    guardarPreferencia('auto', s);
    expect(s.datos).toEqual({});
    guardarPreferencia('oscuro', s);
    expect(s.datos.tema).toBe('oscuro');
  });

  it('automático sigue al celular o la compu; claro y oscuro mandan', () => {
    expect(resolverTema('auto', true)).toBe('oscuro');
    expect(resolverTema('auto', false)).toBe('claro');
    expect(resolverTema('claro', true)).toBe('claro');
    expect(resolverTema('oscuro', false)).toBe('oscuro');
  });

  it('aplicar pone el tema en <html> y el color de la barra del sistema', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
    aplicarTema('oscuro');
    expect(document.documentElement.dataset.tema).toBe('oscuro');
    expect(meta.getAttribute('content')).toBe('#1d3a26');
    aplicarTema('claro');
    expect(meta.getAttribute('content')).toBe('#2e5e3a');
    meta.remove();
  });
});

describe('SelectorTema', () => {
  let contenedor;
  let raiz;
  beforeEach(() => {
    localStorage.clear();
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    raiz = createRoot(contenedor);
  });
  afterEach(() => {
    act(() => raiz.unmount());
    contenedor.remove();
    delete document.documentElement.dataset.tema;
  });

  it('elegir Oscuro cambia la pantalla y queda guardado; Automático lo borra', () => {
    act(() =>
      raiz.render(
        <TemaProvider>
          <SelectorTema />
        </TemaProvider>,
      ),
    );
    const boton = (texto) => [...contenedor.querySelectorAll('[role="radio"]')].find((b) => b.textContent === texto);
    expect(boton('Automático').getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.dataset.tema).toBe('claro');

    act(() => boton('Oscuro').click());
    expect(boton('Oscuro').getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.dataset.tema).toBe('oscuro');
    expect(localStorage.getItem('tema')).toBe('oscuro');

    act(() => boton('Automático').click());
    expect(document.documentElement.dataset.tema).toBe('claro');
    expect(localStorage.getItem('tema')).toBeNull();
  });
});
