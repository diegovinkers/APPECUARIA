// @vitest-environment jsdom
// La recorrida de pasto (26/11): se marca la altura de los potreros que se
// vieron y solo se guardan esos. Sin los corrales; el de la ficha, primero.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getPotrero: vi.fn(),
  registrarRecorridaPasto: vi.fn(),
}));
vi.mock('../../api/pecuaria', () => api);
const CAMPOS = vi.hoisted(() => [
  { id: 1, nombre: 'Estancia Ejemplo' },
  { id: 2, nombre: 'Otra Estancia' },
]);
const estado = vi.hoisted(() => ({ todas: false, esFeedlot: false }));
vi.mock('../../context/EstanciaContext', () => ({
  useEstancia: () => ({
    todas: estado.todas,
    esFeedlot: estado.esFeedlot,
    campoId: estado.todas ? null : 1,
    campo: estado.todas ? null : CAMPOS[0],
    camposDelGrupo: CAMPOS,
  }),
}));
const POTREROS = vi.hoisted(() => [
  { id: 10, nombre: '1', tipo: 'POTRERO', llevaPasto: true, usoActual: { nombre: 'Campo natural', grupo: 'CN' }, pasto: { altura: 'ALTO', fecha: '2026-11-20', momento: 'RECORRIDA' }, descanso: { conGanado: false, dias: 12, masDe: false } },
  { id: 11, nombre: '2', tipo: 'POTRERO', llevaPasto: true, usoActual: null, pasto: null, descanso: null },
  { id: 12, nombre: '3', tipo: 'POTRERO', llevaPasto: true, usoActual: null, pasto: null, descanso: { conGanado: true, dias: 3, masDe: false } },
  { id: 13, nombre: 'Corral 1', tipo: 'CORRAL', llevaPasto: false, usoActual: null, pasto: null, descanso: null },
]);
const pedidos = vi.hoisted(() => []);
vi.mock('../../hooks/usePotreros', () => ({
  default: (campoId) => {
    pedidos.push(campoId);
    return { potreros: campoId ? POTREROS : null, errors: [] };
  },
}));

const { default: PastoPage } = await import('./PastoPage.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('la recorrida de pasto', () => {
  let contenedor;
  let root;
  beforeEach(() => {
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    root = createRoot(contenedor);
    estado.todas = false;
    estado.esFeedlot = false;
    pedidos.length = 0;
    api.registrarRecorridaPasto.mockReset().mockResolvedValue({ data: {} });
    api.getPotrero.mockReset().mockResolvedValue({ data: { id: 12, campo: CAMPOS[0] } });
  });
  afterEach(() => {
    act(() => root.unmount());
    contenedor.remove();
  });
  const montar = async (ruta = '/pecuaria/pasto/nuevo') => {
    act(() =>
      root.render(
        <MemoryRouter initialEntries={[ruta]}>
          <Routes>
            <Route path="/pecuaria/pasto/nuevo" element={<PastoPage />} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
  };
  const filas = () => [...contenedor.querySelectorAll('[data-testid^="recorrida-"]')].filter((li) => li.tagName === 'LI');
  const nombres = () => filas().map((li) => li.querySelector('.font-semibold').textContent);
  const botonEn = (id, t) => [...contenedor.querySelector(`[data-testid="recorrida-${id}"]`).querySelectorAll('button')].find((b) => b.textContent === t);
  const guardar = () => [...contenedor.querySelectorAll('button')].find((b) => /^Guardar|^Marcá/.test(b.textContent));

  it('lista los potreros de la estancia sin los corrales, con la última lectura y el descanso; la escala, una vez arriba', async () => {
    await montar();
    expect(nombres()).toEqual(['1', '2', '3']);
    expect(contenedor.querySelector('[data-testid="escala-pasto"]').textContent).toMatch(/Bajo: menos de 10 cm.*Medio: de 10 a 20 cm.*Alto: más de 20 cm/);
    const p1 = contenedor.querySelector('[data-testid="recorrida-10"]').textContent;
    expect(p1).toMatch(/última: Alto/);
    expect(p1).toMatch(/descansa hace 12 días/);
    expect(contenedor.querySelector('[data-testid="recorrida-12"]').textContent).toMatch(/con ganado hace 3 días/);
  });

  it('manda solo los marcados, con la fecha y la nota, y después ofrece otra recorrida', async () => {
    await montar();
    expect(guardar().disabled).toBe(true);
    expect(guardar().textContent).toBe('Marcá al menos un potrero');
    act(() => botonEn(10, 'Bajo').click());
    act(() => botonEn(12, 'Alto').click());
    expect(guardar().textContent).toBe('Guardar (2 potreros)');
    await act(async () => guardar().click());
    expect(api.registrarRecorridaPasto).toHaveBeenCalledTimes(1);
    const cuerpo = api.registrarRecorridaPasto.mock.calls[0][0];
    expect(cuerpo.lecturas).toEqual([
      { potreroId: 10, altura: 'BAJO' },
      { potreroId: 12, altura: 'ALTO' },
    ]);
    expect(cuerpo.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(contenedor.querySelector('[data-testid="recorrida-lista"]').textContent).toMatch(/Pasto anotado en 2 potreros/);
    await act(async () => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Anotar otra recorrida').click());
    expect(nombres()).toEqual(['1', '2', '3']);
    expect(guardar().disabled).toBe(true);
  });

  it('desde la ficha (?potrero=): ese va primero y marcado, en su estancia aunque arriba diga "Todas"', async () => {
    estado.todas = true;
    await montar('/pecuaria/pasto/nuevo?potrero=12');
    expect(api.getPotrero).toHaveBeenCalledWith(12);
    expect(nombres()).toEqual(['3', '1', '2']);
    expect(contenedor.querySelector('[data-testid="recorrida-12"]').className).toMatch(/ring-campo-500/);
    expect(contenedor.querySelector('a').getAttribute('href')).toBe('/pecuaria/potreros/12');
  });

  it('con "Todas las estancias" pide cuál; con los feedlots avisa que no llevan pasto', async () => {
    estado.todas = true;
    await montar();
    expect(contenedor.textContent).toMatch(/¿En qué estancia\?/);
    expect(filas()).toHaveLength(0);
    await act(async () => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Otra Estancia').click());
    expect(pedidos.at(-1)).toBe(2);
    expect(nombres()).toEqual(['1', '2', '3']);

    act(() => root.unmount());
    root = createRoot(contenedor);
    estado.esFeedlot = true;
    await montar();
    expect(contenedor.textContent).toMatch(/Los feedlots no llevan pasto/);
  });

  it('si falla, muestra el error y no pierde lo marcado', async () => {
    api.registrarRecorridaPasto.mockRejectedValue({ response: { data: { errors: ['La fecha no puede ser futura'] } } });
    await montar();
    act(() => botonEn(11, 'Medio').click());
    await act(async () => guardar().click());
    expect(contenedor.textContent).toMatch(/La fecha no puede ser futura/);
    expect(botonEn(11, 'Medio').getAttribute('aria-pressed')).toBe('true');
  });
});
