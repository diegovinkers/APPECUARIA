// @vitest-environment jsdom
// "+ Nuevo proceso" (ajustes del 20/11): solo entore o IATF; el paso "Dónde"
// arranca en "Se quedan donde están" y deja repartirlas en potreros; las
// vacías para volver a servir van primero.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getProcesos: vi.fn(),
  vistaPreviaProceso: vi.fn(),
  crearProceso: vi.fn(),
  getToros: vi.fn(),
  getProceso: vi.fn(),
  vistaPreviaEtapa: vi.fn(),
  registrarEtapa: vi.fn(),
}));
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
  api.getToros.mockResolvedValue({ data: [] });
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
    expect(contenedor.querySelector('[data-testid="quedan"]').textContent).toBe('De las 50 que entran, quedan en P8: 30.');
    await click(boton('Revisar'));
    expect(api.vistaPreviaProceso).toHaveBeenCalledWith(
      expect.objectContaining({ modalidad: 'TOROS', lineas: [{ loteId: 1, reparto: [{ potreroId: 13, cabezas: 20, toros: 1 }] }] }),
    );
    expect(contenedor.textContent).toContain('20 → P13, lote Lote V · P13');
  });

  it('IATF: pregunta cuántas se van a inseminar, y el reparto cuenta solo esas (captura de Diego, 24/11)', async () => {
    await montar();
    await click(boton('IATF'));
    await click(boton('Seguir'));
    await click(contenedor.querySelectorAll('section[aria-label="A quién"] input[type="checkbox"]')[1]);
    await click(boton('Seguir'));
    expect(contenedor.textContent).toContain('¿Cuántas se van a inseminar? (Lote V, tiene 50)');
    expect(contenedor.textContent).toContain('quedan aparte como "sin inseminar"');
    const cuantas = [...contenedor.querySelectorAll('label')].find((l) => l.textContent.startsWith('¿Cuántas se van a inseminar?')).querySelector('input');
    await cambiar(cuantas, '12');
    // Abajo, las que se inseminan (no el lote entero).
    expect(contenedor.textContent).toContain('1 lote · 12 a inseminar');
    await click(boton('Seguir'));
    await click(boton('Repartirlas en potreros'));
    expect(contenedor.querySelector('[data-reparto] legend').textContent).toBe('Lote V (P8) · se inseminan 12');
    await cambiar(campo('Lote V: potrero 1'), '13');
    await cambiar(campo('Lote V: cabezas 1'), '6');
    expect(contenedor.querySelector('[data-testid="quedan"]').textContent).toBe(
      'De las 12 que se inseminan, quedan en P8: 6. Las otras 38 (sin inseminar) también quedan ahí.',
    );
    await cambiar(campo('Lote V: cabezas 1'), '13');
    expect(contenedor.querySelector('[data-testid="quedan"]').textContent).toBe('Repartís 13, pero se inseminan 12.');
  });
});

describe('toros uno por uno y otra tanda (fase 6)', () => {
  const TOROS = [
    { id: 14, identificacion: 'T-014', raza: 'Angus', activo: true, lote: { id: 4, nombre: 'Toros', potrero: { nombre: 'P3' } }, enProceso: null },
    { id: 22, identificacion: 'T-022', raza: 'Angus', activo: true, lote: { id: 4, nombre: 'Toros', potrero: { nombre: 'P3' } }, enProceso: null },
    { id: 30, identificacion: 'T-030', activo: true, lote: null, enProceso: { proceso: { id: 9, nombre: 'Otro' } } },
  ];

  it('en un entore con toros cargados, se eligen uno por uno (no el número) y van en asignarToros', async () => {
    api.getToros.mockResolvedValue({ data: TOROS });
    await montar();
    await click(boton('Seguir'));
    await click(contenedor.querySelectorAll('section[aria-label="A quién"] input[type="checkbox"]')[1]);
    await click(boton('Seguir'));
    const lista = contenedor.querySelector('fieldset[aria-label="Toros (opcional)"]');
    // T-030 está en otro proceso: no se ofrece.
    expect([...lista.querySelectorAll('[data-toro]')].map((li) => li.getAttribute('data-toro'))).toEqual(['T-014', 'T-022']);
    await click(lista.querySelector('[data-toro="T-022"] input[type="checkbox"]'));
    await click(boton('Seguir'));
    await click(boton('Revisar'));
    const cuerpo = api.vistaPreviaProceso.mock.calls[0][0];
    expect(cuerpo.asignarToros).toEqual([{ toroId: 22 }]);
    expect(cuerpo.toros).toBeUndefined();
  });

  it('otra tanda: sin elegir el tipo, y se carga como etapa TANDA del proceso', async () => {
    api.getProceso.mockResolvedValue({ data: { proceso: { id: 7, nombre: 'Entore EJ', campoId: 1, datos: { modalidad: 'TOROS' } } } });
    api.vistaPreviaEtapa.mockResolvedValue({ data: { oracion: 'Vas a anotar otra tanda', pasos: [] } });
    api.registrarEtapa.mockResolvedValue({ data: { oracion: 'Anotaste otra tanda' } });
    function Donde() {
      const l = useLocation();
      return <p data-testid="donde">{l.pathname}</p>;
    }
    act(() =>
      root.render(
        <MemoryRouter initialEntries={['/pecuaria/procesos/7/tanda']}>
          <Routes>
            <Route path="/pecuaria/procesos/:id/tanda" element={<NuevoProcesoPage />} />
            <Route path="*" element={<Donde />} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
    expect(contenedor.textContent).toContain('Otra tanda · Entore EJ');
    expect(contenedor.querySelector('section[aria-label="Qué"]')).toBeNull();
    await click(contenedor.querySelectorAll('section[aria-label="A quién"] input[type="checkbox"]')[1]);
    await click(boton('Seguir'));
    await click(boton('Seguir'));
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'TANDA', expect.objectContaining({ lineas: [{ loteId: 1 }] }));
    expect(api.vistaPreviaProceso).not.toHaveBeenCalled();
    await click(boton('Confirmar'));
    expect(api.registrarEtapa).toHaveBeenCalledWith('7', 'TANDA', expect.objectContaining({ lineas: [{ loteId: 1 }] }));
    expect(contenedor.querySelector('[data-testid="donde"]').textContent).toBe('/pecuaria/procesos/7');
  });
});

describe('nuevo entore con ternero al pie (fase 7)', () => {
  it('con ?desde=, las paridas de ese proceso ya vienen elegidas y marcadas', async () => {
    // Lote V: paridas con cría al pie en el proceso 5.
    api.getProcesos.mockResolvedValue({ data: [{ id: 5, nombre: 'Entore viejo', loteIds: [], reentoreIds: [], conCriaIds: [1] }] });
    act(() =>
      root.render(
        <MemoryRouter initialEntries={['/pecuaria/procesos/nuevo?desde=5']}>
          <NuevoProcesoPage />
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
    await click(boton('Seguir'));
    const filas = [...contenedor.querySelectorAll('section[aria-label="A quién"] li')];
    // Primero las paridas, elegidas y con la marca.
    expect(filas[0].textContent).toContain('Lote V');
    expect(filas[0].textContent).toContain('con cría al pie');
    expect(filas[0].querySelector('input[type="checkbox"]').checked).toBe(true);
    expect(filas[1].querySelector('input[type="checkbox"]').checked).toBe(false);
    await click(boton('Seguir'));
    await click(boton('Seguir'));
    await click(boton('Revisar'));
    expect(api.vistaPreviaProceso.mock.calls[0][0].lineas).toEqual([{ loteId: 1 }]);
  });
});

describe('procesos enganchados (fase 8)', () => {
  it('con ?desde=, las vacías para volver a servir de ese proceso también vienen elegidas', async () => {
    api.getProcesos.mockResolvedValue({ data: [{ id: 3, nombre: 'Entore viejo', loteIds: [], reentoreIds: [2], conCriaIds: [] }] });
    act(() =>
      root.render(
        <MemoryRouter initialEntries={['/pecuaria/procesos/nuevo?desde=3']}>
          <NuevoProcesoPage />
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
    await click(boton('IATF'));
    await click(boton('Seguir'));
    const filas = [...contenedor.querySelectorAll('section[aria-label="A quién"] li')];
    expect(filas[0].textContent).toContain('Lote R');
    expect(filas[0].textContent).toContain('para volver a servir');
    expect(filas[0].querySelector('input[type="checkbox"]').checked).toBe(true);
  });
});
