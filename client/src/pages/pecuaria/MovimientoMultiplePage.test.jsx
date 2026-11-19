// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getCategorias: vi.fn(), vistaPreviaMultiple: vi.fn(), registrarMultiple: vi.fn() }));
vi.mock('../../api/pecuaria', () => api);
vi.mock('../../context/EstanciaContext', () => ({
  useEstancia: () => ({ campoId: 1, campo: { id: 1, nombre: 'La Gateada' }, todas: false, campos: [], setCampoId: vi.fn() }),
}));
// Potrero 1: 100 terneros (lote A). Potrero 2: 80 vacas (lote B). Potrero 3: vacío.
vi.mock('../../hooks/usePotreros', () => ({
  ordenNatural: new Intl.Collator('es', { numeric: true }),
  default: () => ({
    errors: [],
    potreros: [
      { id: 1, nombre: '1', stock: { cabezas: 100, lotes: [{ loteId: 11, lote: 'A', categoriaId: 1, categoria: 'Terneros', cabezas: 100 }] } },
      { id: 2, nombre: '2', stock: { cabezas: 80, lotes: [{ loteId: 22, lote: 'B', categoriaId: 2, categoria: 'Vacas', cabezas: 80 }] } },
      { id: 3, nombre: '3', stock: { cabezas: 0, lotes: [] } },
    ],
  }),
}));

const { default: MovimientoMultiplePage } = await import('./MovimientoMultiplePage.jsx');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let contenedor;
let root;
beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  api.getCategorias.mockResolvedValue({ data: [{ id: 1, nombre: 'Terneros', activo: true }, { id: 2, nombre: 'Vacas', activo: true }] });
  api.vistaPreviaMultiple.mockResolvedValue({ data: { pasos: [], potreros: [] } });
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
});
afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
});

const elegir = (etiqueta, valor) => {
  const select = contenedor.querySelector(`select[aria-label="${etiqueta}"]`);
  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  act(() => {
    set.call(select, String(valor));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.includes(texto));

async function montar() {
  act(() =>
    root.render(
      <MemoryRouter>
        <MovimientoMultiplePage />
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}

describe('Movimiento múltiple', () => {
  it('avisa si se mezclan categorías y ofrece el movimiento que libera el potrero', async () => {
    await montar();
    elegir('Potrero de origen del movimiento 1', 1);
    elegir('Lote del movimiento 1', 11);
    elegir('Potrero de destino del movimiento 1', 2);
    // En 2 hay vacas: como no hay un lote de terneros, propone el lote entero (van las 100).
    expect(contenedor.textContent).toContain('En 2 hay Vacas: los Terneros se mezclarían.');

    act(() => boton('Agregar movimiento para sacar B').click());
    // El paso nuevo ya viene con el potrero 2, el lote B y sus 80 cabezas.
    expect(contenedor.querySelector('select[aria-label="Potrero de origen del movimiento 2"]').value).toBe('2');
    expect(contenedor.querySelector('select[aria-label="Lote del movimiento 2"]').value).toBe('22');
    expect(contenedor.querySelector('input[aria-label="Cabezas del movimiento 2"]').value).toBe('80');
    elegir('Potrero de destino del movimiento 2', 3);
    // Como las vacas se van enteras de 2, ya no hay mezcla.
    expect(contenedor.textContent).not.toContain('se mezclarían');

    await act(async () => boton('Ver cómo queda').click());
    expect(api.vistaPreviaMultiple).toHaveBeenCalledWith(
      expect.objectContaining({
        pasos: [
          { loteOrigenId: 11, cabezas: 100, destinoPotreroId: 2, modo: 'ENTERO' },
          { loteOrigenId: 22, cabezas: 80, destinoPotreroId: 3, modo: 'ENTERO' },
        ],
      }),
    );
  });

  it('"Agregar otro movimiento" está siempre', async () => {
    await montar();
    expect(boton('Agregar otro movimiento')).toBeTruthy();
    act(() => boton('Agregar otro movimiento').click());
    expect(contenedor.textContent).toContain('Movimiento 2');
  });
});
