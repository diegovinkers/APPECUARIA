// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConPanel } from '../../test-utils.jsx';

// Procesos (24/11): el tablero de 4 secciones y "Todos" (la lista de siempre).
const estancia = vi.hoisted(() => ({ campoId: 1, todas: false }));
vi.mock('../../context/EstanciaContext', () => ({
  useEstancia: () => ({
    campoId: estancia.campoId,
    campo: estancia.campoId ? { id: 1, nombre: 'La Gateada' } : null,
    todas: estancia.todas,
    grupo: 'estancias',
    campos: [{ id: 1, nombre: 'La Gateada' }],
    errors: [],
  }),
}));
const api = vi.hoisted(() => ({ getProcesos: vi.fn(), getProcesosTodas: vi.fn() }));
vi.mock('../../api/pecuaria', () => api);
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { esSuperadmin: false, permisos: ['pecuaria:VER', 'pecuaria:CREAR'] } }) }));
// La lista se prueba aparte (ProcesosLista.test.jsx): acá, qué recibe.
vi.mock('../../components/ProcesosLista', () => ({
  default: ({ campoId, todas }) => <p data-testid="lista">{todas ? 'todas' : `campo ${campoId}`}</p>,
}));

const { default: ProcesosPage } = await import('./ProcesosPage.jsx');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const proxima = (etapa, fecha, estado = 'PENDIENTE', extra = {}) => ({ etapa, fecha, estado, nombre: etapa, dias: 10, ...extra });
const procesos = [
  {
    id: 7,
    nombre: 'Entore 2026',
    modalidad: 'TOROS',
    campo: { sigla: 'EG' },
    grupos: [
      { seccion: 'prenadas', tipo: 'PRENADAS', cabezas: 165, potreros: ['P1'], desde: '2026-01-01', proxima: proxima('PARICION', '2026-10-10', 'PENDIENTE', { hasta: '2026-12-10' }) },
      { seccion: 'reentore', tipo: 'VACIAS_REENTORE', cabezas: 35, potreros: ['P8'], desde: '2026-01-01', proxima: null },
    ],
  },
  {
    id: 9,
    nombre: 'IATF vaquillonas',
    modalidad: 'IATF',
    campo: { sigla: 'EG' },
    grupos: [{ seccion: 'servicio', tipo: 'VIENTRES', cabezas: 80, potreros: ['P2'], desde: '2026-11-01', proxima: proxima('DIAGNOSTICO', '2026-12-01', 'ATRASADA', { dias: -2 }) }],
  },
];

let contenedor;
let root;
beforeEach(() => {
  estancia.campoId = 1;
  estancia.todas = false;
  localStorage.clear();
  api.getProcesos.mockResolvedValue({ data: procesos });
  api.getProcesosTodas.mockResolvedValue({ data: procesos });
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
});
afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
});

async function montar(ruta = '/pecuaria/procesos') {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[ruta]}>
        <ConPanel>
          <Routes>
            <Route path="/pecuaria/procesos" element={<ProcesosPage />} />
          </Routes>
        </ConPanel>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}
const lista = () => contenedor.querySelector('[data-testid="lista"]')?.textContent;
const seccion = (clave) => contenedor.querySelector(`[data-testid="seccion-${clave}"]`);

describe('la página Procesos', () => {
  it('título con la estancia, "+ Nuevo proceso" y el tablero de los procesos abiertos', async () => {
    await montar();
    expect(contenedor.querySelector('h1').textContent).toBe('ProcesosLa Gateada');
    expect(contenedor.querySelector('a[href="/pecuaria/procesos/nuevo"]')).not.toBeNull();
    expect(api.getProcesos).toHaveBeenCalledWith(1, { estado: 'ABIERTO' });
    expect(lista()).toBeUndefined();
  });

  it('las 4 secciones una debajo de la otra, abiertas, con sus cabezas (acordeón)', async () => {
    await montar();
    const titulos = [...contenedor.querySelectorAll('[data-testid="tablero"] h2 button')];
    expect(titulos.map((b) => b.textContent.replace(/\s+/g, ' '))).toEqual([
      '1En servicioEntore · IATF80cab · 1 grupo',
      '2ReentoreVacías que se vuelven a servir35cab · 1 grupo',
      '3PreñadasHasta el parto165cab · 1 grupo',
      '4Con cría al pieHasta el destete0cab',
    ]);
    expect(titulos.every((b) => b.getAttribute('aria-expanded') === 'true')).toBe(true);
    // Una tarjeta por grupo: el mismo entore está en Preñadas y en Reentore.
    expect(seccion('prenadas').textContent).toMatch(/Entore 2026/);
    expect(seccion('reentore').textContent).toMatch(/Entore 2026/);
    expect(seccion('cria').textContent).toMatch(/No hay vacas con cría al pie/);
  });

  it('tocar el encabezado pliega la sección (y se recuerda)', async () => {
    await montar();
    const boton = () => seccion('prenadas').querySelector('h2 button');
    act(() => boton().click());
    expect(boton().getAttribute('aria-expanded')).toBe('false');
    expect(seccion('prenadas').querySelector('[data-testid="tarjeta-grupo"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem('procesos-plegadas'))).toEqual(['prenadas']);
    act(() => boton().click());
    expect(seccion('prenadas').querySelector('[data-testid="tarjeta-grupo"]')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('procesos-plegadas'))).toEqual([]);
  });

  it('cada tarjeta: el grupo, las cabezas, la barra del tiempo y el botón de lo que sigue', async () => {
    await montar();
    const servicio = seccion('servicio').querySelector('[data-testid="tarjeta-grupo"]');
    expect(servicio.textContent).toMatch(/En servicio · Inseminación · P2/);
    expect(servicio.textContent).toMatch(/atrasada 2 días/);
    expect(servicio.querySelector('[data-testid="barra-tiempo"]')).not.toBeNull();
    expect(servicio.querySelector('a[href="/pecuaria/procesos/9/etapa/DIAGNOSTICO"]').textContent).toBe('Ecografía');
    expect(servicio.querySelector('a[href="/pecuaria/procesos/9"]').textContent).toBe('IATF vaquillonas');
    const vacias = seccion('reentore').querySelector('[data-tipo="VACIAS_REENTORE"]');
    expect(vacias.querySelector('a[href="/pecuaria/procesos/nuevo?desde=7"]').textContent).toBe('Empezar el reentore');
    // La parición es una ventana.
    expect(seccion('prenadas').textContent).toMatch(/10\/10\/2026 a 10\/12\/2026/);
  });

  it('"Todos" muestra la lista de siempre', async () => {
    await montar('/pecuaria/procesos?ver=todos');
    expect(lista()).toBe('campo 1');
    expect(contenedor.querySelector('[data-testid="tablero"]')).toBeNull();
  });

  it('con "Todas las estancias", los procesos de todas', async () => {
    estancia.campoId = null;
    estancia.todas = true;
    await montar();
    expect(api.getProcesosTodas).toHaveBeenCalledWith({ estado: 'ABIERTO' }, 'estancias');
    expect(seccion('servicio').textContent).toMatch(/EG IATF vaquillonas/);
  });
});
