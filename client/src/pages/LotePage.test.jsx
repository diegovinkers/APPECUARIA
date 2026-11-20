// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getLote: vi.fn(), editarLote: vi.fn() }));
vi.mock('../api/pecuaria', () => api);
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { esSuperadmin: false, permisos: ['pecuaria:VER', 'pecuaria:CREAR'] } }) }));

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

  it('en un corral, la entrada (fecha y peso) se ve y se edita', async () => {
    const corral = datos(null);
    corral.lote = { ...corral.lote, potrero: { id: 1, nombre: 'Corral 2', tipo: 'CORRAL' }, fechaEntrada: '2026-10-05', pesoEntradaKg: 240 };
    api.getLote.mockResolvedValue({ data: corral });
    api.editarLote.mockResolvedValue({ data: {} });
    await montar();
    const cuadro = contenedor.querySelector('[aria-label="Entrada al corral"]');
    expect(cuadro.textContent).toContain('Entró el 05/10/2026 · 240 kg promedio');
    act(() => [...cuadro.querySelectorAll('button')].find((b) => b.textContent === 'Editar').click());
    const peso = cuadro.querySelector('input[aria-label="Peso de entrada"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    act(() => {
      setter.call(peso, '250,5');
      peso.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => cuadro.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(api.editarLote).toHaveBeenCalledWith('5', { fechaEntrada: '2026-10-05', pesoEntradaKg: 250.5 });
  });

  it('fuera del feedlot, sin datos de entrada, no aparece', async () => {
    api.getLote.mockResolvedValue({ data: datos(null) });
    await montar();
    expect(contenedor.querySelector('[aria-label="Entrada al corral"]')).toBeNull();
  });
});
