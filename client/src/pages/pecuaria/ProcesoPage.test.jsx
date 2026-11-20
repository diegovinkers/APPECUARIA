// @vitest-environment jsdom
// La ficha de un proceso: el embudo, la línea de tiempo (hecha, pendiente,
// atrasada; "dato inicial"), los lotes, el botón de la etapa que sigue,
// renombrar y anular una carga (solo con el permiso de anular).
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getProceso: vi.fn(),
  editarProceso: vi.fn(),
  anularCargaProceso: vi.fn(),
  cerrarProceso: vi.fn(),
  anularProceso: vi.fn(),
  getSueltos: vi.fn(),
  asociarSueltos: vi.fn(),
}));
const permisos = vi.hoisted(() => ({ lista: ['pecuaria:VER', 'pecuaria:CREAR'] }));
vi.mock('../../api/pecuaria', () => api);
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { esSuperadmin: false, permisos: permisos.lista } }) }));

const { default: ProcesoPage } = await import('./ProcesoPage.jsx');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const etapa = (clave, nombre, estado, extra = {}) => ({ clave, nombre, linea: true, unica: true, estado, fecha: null, cargas: [], ...extra });
const FICHA = {
  proceso: { id: 7, nombre: 'Servicio 2026-27 · Vaquillonas', estado: 'ABIERTO', campania: '2026-27', fechaInicio: '2026-11-15', campo: { id: 1, sigla: 'EG', nombre: 'La Gateada' } },
  etapa: 'SERVICIO',
  textoEtapa: 'En servicio',
  proxima: { etapa: 'FIN_SERVICIO', texto: 'en servicio desde 15/11', atrasada: false },
  embudo: { servidas: 50, prenadas: 40, paridas: null, destetados: null, porcentajes: { prenez: 80, paricion: null, destete: null }, corto: '50 → 40 → — → —' },
  lotes: [{ loteId: 1, nombre: 'Lote V', potrero: { id: 8, nombre: 'P8' }, categoria: 'Vaquillonas', cabezas: 50, rol: 'VIENTRES', activo: true }],
  etapas: [
    etapa('INICIO', 'Inicio del servicio', 'HECHA', {
      fecha: '2026-11-15',
      cargas: [{ grupoId: 'g1', fecha: '2026-11-15', inicial: false, anulada: false, puedeAnular: true, lineas: [{ registroId: 1, lote: 'Lote V', cabezas: 50, texto: 'Entore con toros · 50 cab.' }] }],
    }),
    etapa('REPASO', 'Repaso', 'PENDIENTE', { linea: false }),
    etapa('FIN_SERVICIO', 'Fin del servicio', 'PENDIENTE'),
    etapa('DIAGNOSTICO', 'Diagnóstico', 'HECHA', {
      fecha: '2026-11-19',
      cargas: [{ grupoId: 'g2', fecha: '2026-11-19', inicial: true, anulada: false, puedeAnular: true, lineas: [{ registroId: 2, lote: null, cabezas: 50, texto: '40 preñadas · 10 vacías' }] }],
    }),
    etapa('PARICION', 'Parición', 'ATRASADA', { unica: false }),
    etapa('DESTETE', 'Destete', 'PENDIENTE'),
  ],
  pendientes: [],
};

let contenedor;
let root;
beforeEach(() => {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  api.getProceso.mockResolvedValue({ data: FICHA });
  permisos.lista = ['pecuaria:VER', 'pecuaria:CREAR'];
});
afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
  vi.clearAllMocks();
});

async function montar() {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={['/pecuaria/procesos/7']}>
        <Routes>
          <Route path="/pecuaria/procesos/:id" element={<ProcesoPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}
const etapaEn = (clave) => contenedor.querySelector(`[data-etapa="${clave}"]`);

describe('la ficha del proceso', () => {
  it('el embudo con sus porcentajes', async () => {
    await montar();
    const embudo = contenedor.querySelector('[aria-label="Embudo"]');
    expect(embudo.textContent).toContain('Servidas');
    expect(embudo.textContent).toContain('50');
    expect(embudo.textContent).toContain('80 %');
    expect(embudo.textContent).toContain('Destetados');
  });

  it('la línea de tiempo: hecha, pendiente y atrasada; los datos iniciales marcados; el repaso no va si no se hizo', async () => {
    await montar();
    expect(etapaEn('INICIO').getAttribute('data-estado')).toBe('HECHA');
    expect(etapaEn('INICIO').textContent).toContain('Entore con toros · 50 cab.');
    expect(etapaEn('FIN_SERVICIO').getAttribute('data-estado')).toBe('PENDIENTE');
    expect(etapaEn('PARICION').getAttribute('data-estado')).toBe('ATRASADA');
    expect(etapaEn('DIAGNOSTICO').textContent).toContain('dato inicial');
    expect(etapaEn('REPASO')).toBeNull();
  });

  it('el botón de abajo registra la etapa que sigue', async () => {
    await montar();
    const boton = contenedor.querySelector('[data-testid="siguiente"]');
    expect(boton.textContent).toBe('Registrar fin del servicio');
    expect(boton.getAttribute('href')).toBe('/pecuaria/procesos/7/etapa/FIN_SERVICIO');
  });

  it('renombrar', async () => {
    api.editarProceso.mockResolvedValue({ data: { id: 7, nombre: 'Vaquillonas EG' } });
    await montar();
    act(() => contenedor.querySelector('[aria-label="Más acciones"]').click());
    act(() => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Renombrar').click());
    const input = contenedor.querySelector('input[aria-label="Nombre del proceso"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    act(() => {
      setter.call(input, 'Vaquillonas EG');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.form.requestSubmit());
    expect(api.editarProceso).toHaveBeenCalledWith(7, { nombre: 'Vaquillonas EG' });
  });

  it('anular una carga, solo con el permiso de anular', async () => {
    await montar();
    expect([...contenedor.querySelectorAll('button')].some((b) => b.textContent === 'Anular')).toBe(false);
    act(() => root.unmount());
    root = createRoot(contenedor);
    permisos.lista = ['pecuaria:VER', 'pecuaria:CREAR', 'pecuaria:ANULAR'];
    api.anularCargaProceso.mockResolvedValue({ data: {} });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await montar();
    const anular = [...etapaEn('INICIO').querySelectorAll('button')].find((b) => b.textContent === 'Anular');
    await act(async () => anular.click());
    expect(api.anularCargaProceso).toHaveBeenCalledWith(7, 'g1');
  });

  it('cerrar el proceso (con nota) y anularlo (solo con el permiso de anular)', async () => {
    permisos.lista = ['pecuaria:VER', 'pecuaria:CREAR'];
    api.cerrarProceso.mockResolvedValue({ data: {} });
    vi.spyOn(window, 'prompt').mockReturnValue('Se vendió todo');
    await montar();
    act(() => contenedor.querySelector('[aria-label="Más acciones"]').click());
    expect([...contenedor.querySelectorAll('button')].some((b) => b.textContent === 'Anular el proceso')).toBe(false);
    await act(async () => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Cerrar el proceso').click());
    expect(api.cerrarProceso).toHaveBeenCalledWith(7, { nota: 'Se vendió todo' });
  });

  it('sumar eventos sueltos: la lista con la etapa que toman, y "Sumar"', async () => {
    api.getSueltos.mockResolvedValue({ data: [{ id: 31, fecha: '2026-11-14', tipo: { clave: 'ECOGRAFIA', nombre: 'Ecografía' }, lote: { id: 1, nombre: 'Lote V' }, cabezas: 50, texto: '40 preñadas · 10 vacías', etapa: 'DIAGNOSTICO' }] });
    api.asociarSueltos.mockResolvedValue({ data: {} });
    await montar();
    act(() => contenedor.querySelector('[aria-label="Más acciones"]').click());
    await act(async () => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Sumar eventos sueltos').click());
    const caja = contenedor.querySelector('[aria-label="Eventos sueltos"]');
    expect(caja.textContent).toContain('Ecografía');
    expect(caja.textContent).toContain('como diagnóstico');
    act(() => caja.querySelector('input[type="checkbox"]').click());
    await act(async () => [...caja.querySelectorAll('button')].find((b) => b.textContent === 'Sumar al proceso').click());
    expect(api.asociarSueltos).toHaveBeenCalledWith(7, [31]);
  });
});
