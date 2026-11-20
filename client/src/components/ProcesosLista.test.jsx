// @vitest-environment jsdom
// La pestaña Procesos de Registro: una fila por proceso, con su etapa, lo que
// sigue (en ámbar si se atrasó), el embudo corto, los filtros y "+ Nuevo proceso".
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConPanel } from '../test-utils.jsx';

const api = vi.hoisted(() => ({ getProcesos: vi.fn(), getProcesosTodas: vi.fn() }));
const permisos = vi.hoisted(() => ({ lista: ['pecuaria:VER', 'pecuaria:CREAR'] }));
vi.mock('../api/pecuaria', () => api);
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { esSuperadmin: false, permisos: permisos.lista } }) }));

const { default: ProcesosLista } = await import('./ProcesosLista.jsx');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PROCESOS = [
  {
    id: 7,
    nombre: 'Servicio 2026-27 · Vaquillonas',
    campo: { id: 1, sigla: 'EG', nombre: 'La Gateada' },
    estado: 'ABIERTO',
    campania: '2026-27',
    fechaInicio: '2026-11-15',
    etapa: 'PRENEZ',
    textoEtapa: 'Diagnosticado',
    proxima: { etapa: 'PARICION', texto: 'parición oct–dic', atrasada: false },
    embudoCorto: '50 → 40 → — → —',
    lotes: 2,
    cabezas: 50,
    pendientes: 1,
    loteIds: [1, 2],
  },
  {
    id: 8,
    nombre: 'Servicio 2026-27 · Vacas de cría',
    campo: { id: 1, sigla: 'EG', nombre: 'La Gateada' },
    estado: 'ABIERTO',
    campania: '2026-27',
    fechaInicio: '2026-11-01',
    etapa: 'ESPERA_DIAGNOSTICO',
    textoEtapa: 'Esperando el diagnóstico',
    proxima: { etapa: 'DIAGNOSTICO', texto: 'diag. desde 29/04', atrasada: true },
    embudoCorto: '120 → — → — → —',
    lotes: 3,
    cabezas: 120,
    pendientes: 0,
    loteIds: [3],
  },
];

function Donde() {
  const l = useLocation();
  return <p data-testid="donde">{`${l.pathname}${l.search}`}</p>;
}

let contenedor;
let root;
beforeEach(() => {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  api.getProcesos.mockResolvedValue({ data: PROCESOS });
  api.getProcesosTodas.mockResolvedValue({ data: PROCESOS });
  permisos.lista = ['pecuaria:VER', 'pecuaria:CREAR'];
});
afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
  vi.clearAllMocks();
});

async function montar({ ruta = '/pecuaria/registro?ver=procesos', todas = false } = {}) {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[ruta]}>
        <ConPanel>
          <Routes>
            <Route path="/pecuaria/registro" element={<ProcesosLista campoId={todas ? null : 1} todas={todas} grupo="estancias" />} />
            <Route path="*" element={null} />
          </Routes>
          <Donde />
        </ConPanel>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}
const filas = () => [...contenedor.querySelectorAll('tbody tr')];
const donde = () => contenedor.querySelector('[data-testid="donde"]').textContent;

describe('la pestaña Procesos', () => {
  it('una fila por proceso: nombre, etapa, lo que sigue y el embudo corto', async () => {
    await montar();
    expect(api.getProcesos).toHaveBeenCalledWith(1, expect.objectContaining({ estado: 'ABIERTO' }));
    expect(filas()).toHaveLength(2);
    const [a, b] = filas();
    expect(a.textContent).toContain('Servicio 2026-27 · Vaquillonas');
    expect(a.textContent).toContain('Diagnosticado');
    expect(a.textContent).toContain('parición oct–dic');
    expect(a.textContent).toContain('50 → 40 → — → —');
    expect(a.textContent).toContain('decidir');
    // Atrasada: en ámbar.
    expect(b.querySelector('[data-atrasada="true"]').textContent).toContain('diag. desde 29/04');
    expect(a.querySelector('[data-atrasada="true"]')).toBeNull();
  });

  it('con todas las estancias, la sigla adelante', async () => {
    await montar({ todas: true });
    expect(api.getProcesosTodas).toHaveBeenCalled();
    expect(filas()[0].textContent).toContain('EG Servicio 2026-27 · Vaquillonas');
  });

  it('tocar la fila abre la ficha', async () => {
    await montar();
    act(() => filas()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(donde()).toBe('/pecuaria/procesos/7');
  });

  it('el filtro de estado arranca en Abiertos y va a la URL', async () => {
    await montar();
    const abiertos = [...contenedor.querySelectorAll('[aria-label="Estado"] button')].find((x) => x.textContent === 'Abiertos');
    expect(abiertos.getAttribute('aria-pressed')).toBe('true');
    const cerrados = [...contenedor.querySelectorAll('[aria-label="Estado"] button')].find((x) => x.textContent === 'Cerrados');
    act(() => cerrados.click());
    await act(async () => {});
    expect(donde()).toContain('pestado=CERRADO');
    expect(api.getProcesos).toHaveBeenLastCalledWith(1, expect.objectContaining({ estado: 'CERRADO' }));
  });

  it('"+ Nuevo proceso" solo para quien registra', async () => {
    await montar();
    const nuevo = [...contenedor.querySelectorAll('a')].find((a) => a.textContent.includes('Nuevo proceso'));
    expect(nuevo.getAttribute('href')).toBe('/pecuaria/procesos/nuevo');
    act(() => root.unmount());
    root = createRoot(contenedor);
    permisos.lista = ['pecuaria:VER'];
    await montar();
    expect([...contenedor.querySelectorAll('a')].some((a) => a.textContent.includes('Nuevo proceso'))).toBe(false);
  });
});
