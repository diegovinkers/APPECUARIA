// @vitest-environment jsdom
// Mover con el pasto (26/11): opcional, del potrero que dejan y del que
// llegan; no en el mismo potrero ni en los corrales.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getPotrero: vi.fn(),
  getPotreros: vi.fn(),
  getCategorias: vi.fn(),
  vistaPreviaMovimiento: vi.fn(),
  registrarMovimiento: vi.fn(),
}));
vi.mock('../api/pecuaria', () => api);

const { default: MoverPage } = await import('./MoverPage.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const linea = { loteId: 7, lote: 'A', familiaId: 7, categoriaId: 3, categoria: 'Terneros', cabezas: 100, pesoPromedioKg: 180 };
const P1 = { id: 1, nombre: '1', campoId: 1, tipo: 'POTRERO', llevaPasto: true, usoActual: null, stock: { cabezas: 100, lineas: [linea] } };
const P2 = { id: 2, nombre: '2', campoId: 1, tipo: 'POTRERO', llevaPasto: true, usoActual: null, stock: null };
const C3 = { id: 3, nombre: 'Corral 1', campoId: 1, tipo: 'CORRAL', llevaPasto: false, usoActual: null, stock: null };
const POTREROS = { 1: P1, 2: P2, 3: C3 };
const lado = (potrero) => ({ potrero, antes: { cabezas: 0, cabHa: null }, despues: { cabezas: 0, cabHa: null }, lineas: [] });

describe('mover: el pasto', () => {
  let contenedor;
  let root;
  beforeEach(() => {
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    root = createRoot(contenedor);
    api.getPotrero.mockImplementation((id) => Promise.resolve({ data: POTREROS[Number(id)] }));
    api.getPotreros.mockResolvedValue({ data: Object.values(POTREROS) });
    api.getCategorias.mockResolvedValue({ data: [{ id: 3, nombre: 'Terneros', activo: true }, { id: 4, nombre: 'Novillos', activo: true }] });
    api.vistaPreviaMovimiento.mockReset().mockImplementation((cuerpo) =>
      Promise.resolve({
        data: {
          origen: lado('1'),
          destino: cuerpo.destinoPotreroId === 1 ? null : lado('2'),
          loteDestino: 'A',
          avisos: [],
          pasto: cuerpo.pastoOrigen || cuerpo.pastoDestino ? { ...(cuerpo.pastoOrigen && { salida: 'Bajo en 1' }), ...(cuerpo.pastoDestino && { entrada: 'Alto en 2' }) } : null,
        },
      }),
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    contenedor.remove();
  });
  const montar = async (ruta = '/pecuaria/mover?potrero=1&lote=7') => {
    act(() =>
      root.render(
        <MemoryRouter initialEntries={[ruta]}>
          <Routes>
            <Route path="/pecuaria/mover" element={<MoverPage />} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
  };
  // Espera la vista previa (se pide 350 ms después del último cambio).
  const esperarPrevia = () => act(() => new Promise((r) => setTimeout(r, 450)));
  const todas = () => act(() => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Todas').click());
  const destino = async (id) => {
    const select = contenedor.querySelector('[aria-label="Potrero de destino"]');
    await act(async () => {
      select.value = String(id);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {});
  };
  const grupo = (etiqueta) => contenedor.querySelector(`[role="group"][aria-label="${etiqueta}"]`);
  const elegir = (etiqueta, t) => act(() => [...grupo(etiqueta).querySelectorAll('button')].find((b) => b.textContent.startsWith(t)).click());

  it('a otro potrero: pide el pasto de los dos (opcional) y lo manda', async () => {
    await montar();
    await todas();
    await destino(2);
    expect(contenedor.querySelector('[aria-label="Pasto"]').textContent).toMatch(/3\. Pasto \(opcional\)/);
    expect(grupo('Pasto en 1 al salir')).not.toBeNull();
    expect(grupo('Pasto en 2 al entrar')).not.toBeNull();
    // Sin tocarlo, no va.
    await esperarPrevia();
    expect(api.vistaPreviaMovimiento.mock.calls.at(-1)[0]).not.toHaveProperty('pastoOrigen');
    elegir('Pasto en 1 al salir', 'Bajo');
    elegir('Pasto en 2 al entrar', 'Alto');
    await esperarPrevia();
    expect(api.vistaPreviaMovimiento.mock.calls.at(-1)[0]).toMatchObject({ modo: 'ENTERO', pastoOrigen: 'BAJO', pastoDestino: 'ALTO' });
    expect(contenedor.querySelector('[data-testid="pasto-previa"]').textContent).toBe('Pasto: Bajo en 1 al salir · Alto en 2 al entrar');
    // Sacarlo (tocar de nuevo) lo saca del cuerpo.
    elegir('Pasto en 2 al entrar', 'Alto');
    await esperarPrevia();
    const ultimo = api.vistaPreviaMovimiento.mock.calls.at(-1)[0];
    expect(ultimo.pastoOrigen).toBe('BAJO');
    expect(ultimo).not.toHaveProperty('pastoDestino');
  });

  it('a un corral: solo el del potrero que dejan', async () => {
    await montar();
    await todas();
    await destino(3);
    expect(grupo('Pasto en 1 al salir')).not.toBeNull();
    expect(grupo('Pasto en Corral 1 al entrar')).toBeNull();
  });

  it('un cambio de categoría (mismo potrero) no pide pasto', async () => {
    await montar('/pecuaria/mover?potrero=1&lote=7&cambio=categoria');
    await act(async () => {});
    expect(contenedor.querySelector('h1').textContent).toBe('Cambiar categoría');
    expect(contenedor.querySelector('[aria-label="Pasto"]')).toBeNull();
  });
});
