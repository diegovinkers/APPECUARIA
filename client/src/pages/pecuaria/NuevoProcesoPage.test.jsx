// @vitest-environment jsdom
// "+ Nuevo proceso" (ajustes del 20/11): solo entore o IATF; el paso "Dónde"
// arranca en "Se quedan donde están" y deja repartirlas en potreros; las
// vacías para volver a servir van primero.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getProcesos: vi.fn(), vistaPreviaProceso: vi.fn(), crearProceso: vi.fn() }));
vi.mock('../../api/pecuaria', () => api);
vi.mock('../../context/EstanciaContext', () => ({ useEstancia: () => ({ campoId: 1, todas: false }) }));
const POTREROS = [
  { id: 8, nombre: 'P8', stock: { lotes: [{ loteId: 1, lote: 'Lote V', categoriaId: 3, categoria: 'Vaquillonas', sexo: 'HEMBRA', cabezas: 50 }] } },
  { id: 12, nombre: 'P12', stock: { lotes: [{ loteId: 2, lote: 'Lote R', categoriaId: 3, categoria: 'Vacas de cría', sexo: 'HEMBRA', cabezas: 10 }] } },
  { id: 13, nombre: 'P13', stock: { lotes: [] } },
];
vi.mock('../../hooks/usePotreros', () => ({ default: () => ({ potreros: POTREROS, errors: [] }) }));

const { default: NuevoProcesoPage } = await import('./NuevoProcesoPage.jsx');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let contenedor;
let root;
beforeEach(() => {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  // Lote R: vacías que quedaron para volver a servir en otro proceso.
  api.getProcesos.mockResolvedValue({ data: [{ id: 3, loteIds: [], reentoreIds: [2] }] });
  api.vistaPreviaProceso.mockResolvedValue({ data: { oracion: 'Vas a empezar "Servicio"', pasos: [{ texto: '20 → P13, lote Lote V · P13 (Vaquillonas)' }] } });
});
afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
  vi.clearAllMocks();
});

async function montar() {
  act(() =>
    root.render(
      <MemoryRouter>
        <NuevoProcesoPage />
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}
const boton = (t) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(t));
const click = async (el) => act(async () => el.click());
const cambiar = async (el, valor) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};
const campo = (aria) => contenedor.querySelector(`[aria-label="${aria}"]`);

describe('nuevo proceso', () => {
  it('solo entore con toros o IATF', async () => {
    await montar();
    const opciones = [...contenedor.querySelectorAll('section[aria-label="Qué"] button')].map((b) => b.querySelector('span').textContent);
    expect(opciones).toEqual(['Entore con toros', 'IATF']);
  });

  it('las vacías para volver a servir, primero y marcadas', async () => {
    await montar();
    await click(boton('Seguir'));
    const nombres = [...contenedor.querySelectorAll('section[aria-label="A quién"] li')].map((li) => li.textContent);
    expect(nombres[0]).toContain('Lote R');
    expect(nombres[0]).toContain('para volver a servir');
  });

  it('entore repartido en potreros: el paso "Dónde" arranca en "se quedan" y manda el reparto', async () => {
    await montar();
    await click(boton('Seguir'));
    await click(contenedor.querySelectorAll('section[aria-label="A quién"] input[type="checkbox"]')[1]); // Lote V
    await click(boton('Seguir'));
    expect(contenedor.textContent).toContain('¿Cuántas entran al servicio? (Lote V, tiene 50)');
    expect(contenedor.textContent).toContain('Dejalo vacío si entran todas.');
    await click(boton('Seguir'));

    expect(boton('Se quedan donde están').getAttribute('aria-pressed')).toBe('true');
    await click(boton('Repartirlas en potreros'));
    await cambiar(campo('Lote V: potrero 1'), '13');
    await cambiar(campo('Lote V: cabezas 1'), '20');
    await cambiar(campo('Lote V: toros 1'), '1');
    expect(contenedor.querySelector('[data-testid="quedan"]').textContent).toBe('Quedan en P8: 30.');
    await click(boton('Revisar'));
    expect(api.vistaPreviaProceso).toHaveBeenCalledWith(
      expect.objectContaining({ modalidad: 'TOROS', lineas: [{ loteId: 1, reparto: [{ potreroId: 13, cabezas: 20, toros: 1 }] }] }),
    );
    expect(contenedor.textContent).toContain('20 → P13, lote Lote V · P13');
  });

  it('IATF: pregunta cuántas se inseminaron hoy', async () => {
    await montar();
    await click(boton('IATF'));
    await click(boton('Seguir'));
    await click(contenedor.querySelectorAll('section[aria-label="A quién"] input[type="checkbox"]')[1]);
    await click(boton('Seguir'));
    expect(contenedor.textContent).toContain('¿Cuántas se inseminaron hoy? (Lote V, tiene 50)');
    expect(contenedor.textContent).toContain('quedan aparte como "sin inseminar"');
  });
});
