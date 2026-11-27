// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EsqueletoBloques } from './Esqueleto';
import { EsqueletoPotreros } from './PotrerosLista';

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

describe('esqueletos mientras carga (27/11)', () => {
  it('Potreros: la tabla vacía con sus columnas (las de la compu, escondidas en el celular)', () => {
    act(() => root.render(<EsqueletoPotreros />));
    const esqueleto = contenedor.querySelector('[data-testid="esqueleto-potreros"]');
    expect(esqueleto.getAttribute('role')).toBe('status');
    expect(esqueleto.textContent).toBe('Cargando…');
    const ths = [...esqueleto.querySelectorAll('thead th')];
    expect(ths).toHaveLength(10);
    // En el celular: Potrero, ha, Cab., Peso, kg/ha y cab/ha.
    expect(ths.filter((th) => !/(^|\s)hidden(\s|$)/.test(th.className))).toHaveLength(6);
    expect(esqueleto.querySelector('tbody tr').className).toMatch(/h-\[4\.5rem\] md:h-10/);
  });

  it('Resumen y Procesos: bloques grises, que dicen "Cargando…" al lector de pantalla', () => {
    act(() => root.render(<EsqueletoBloques bloques={3} testId="esqueleto-resumen" />));
    const esqueleto = contenedor.querySelector('[data-testid="esqueleto-resumen"]');
    expect(esqueleto.getAttribute('role')).toBe('status');
    expect(esqueleto.textContent).toBe('Cargando…');
    expect(esqueleto.querySelectorAll('[aria-hidden="true"].rounded-lg')).toHaveLength(3);
  });
});
