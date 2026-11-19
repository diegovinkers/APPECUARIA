// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getLote: vi.fn() }));
vi.mock('../api/pecuaria', () => api);

const { default: LotePage } = await import('./LotePage.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const datos = (familia) => ({
  lote: { id: 5, nombre: 'Terneras', activo: true, categoria: 'Terneras', potrero: { id: 1, nombre: '8.1' }, campoId: 1 },
  actual: { cabezas: 72, pesoPromedioKg: 250, fecha: '2026-11-19' },
  familia,
  movimientos: [],
});

describe('la ficha del lote', () => {
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
  const montar = async () => {
    act(() =>
      root.render(
        <MemoryRouter initialEntries={['/pecuaria/lotes/5']}>
          <Routes>
            <Route path="/pecuaria/lotes/:id" element={<LotePage />} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
  };

  it('repartido: las partes con sus cabezas, el total y las de otras estancias', async () => {
    api.getLote.mockResolvedValue({
      data: datos({
        raiz: { id: 5, nombre: 'Terneras' },
        cabezas: 272,
        otrasEstancias: 1,
        partes: [
          { id: 5, nombre: 'Terneras', potrero: { id: 1, nombre: '8.1' }, categoria: 'Terneras', cabezas: 72 },
          { id: 9, nombre: 'Terneras · P 15', potrero: { id: 2, nombre: 'P 15' }, categoria: 'Terneras', cabezas: 200 },
        ],
      }),
    });
    await montar();
    const cuadro = contenedor.querySelector('[aria-label="Lote repartido"]');
    expect(cuadro.textContent).toMatch(/Repartido en 2 potreros · 272 cab en total/);
    expect(cuadro.textContent).toMatch(/Terneras \(este\)/);
    expect(cuadro.querySelector('a[href="/pecuaria/lotes/9"]').textContent).toBe('Terneras · P 15');
    expect(cuadro.textContent).toMatch(/Y 1 parte en otra estancia/);
  });

  it('sin familia no muestra el cuadro', async () => {
    api.getLote.mockResolvedValue({ data: datos(null) });
    await montar();
    expect(contenedor.querySelector('[aria-label="Lote repartido"]')).toBeNull();
  });
});
