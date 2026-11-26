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
    nombre: 'IATF 2026',
    modalidad: 'IATF',
    campo: { sigla: 'EG' },
    grupos: [
      { seccion: 'prenadas', tipo: 'PRENADAS', cabezas: 165, potreros: ['P1'], desde: '2026-01-01', proxima: proxima('PARICION', '2026-10-10', 'PENDIENTE', { hasta: '2026-12-10' }) },
      // Las vacías de una IATF, para volver a servir: en Entore, con el color.
      { seccion: 'entore', tipo: 'VACIAS_REENTORE', cabezas: 35, potreros: ['P8'], desde: '2026-01-01', proxima: null, deIatf: true },
    ],
  },
  {
    id: 8,
    nombre: 'Entore vacas',
    modalidad: 'TOROS',
    campo: { sigla: 'EG' },
    grupos: [{ seccion: 'entore', tipo: 'VIENTRES', cabezas: 40, potreros: ['P5'], desde: '2026-11-01', proxima: proxima('FIN_SERVICIO', '2027-01-30') }],
  },
  {
    id: 9,
    nombre: 'IATF vaquillonas',
    modalidad: 'IATF',
    campo: { sigla: 'EG' },
    grupos: [{ seccion: 'iatf', tipo: 'VIENTRES', cabezas: 80, potreros: ['P2'], desde: '2026-11-01', proxima: proxima('DIAGNOSTICO', '2026-12-01', 'ATRASADA', { dias: -2 }) }],
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
// Las secciones arrancan cerradas: abrir una (o varias) para ver sus tarjetas.
const abrir = (...claves) => claves.forEach((c) => act(() => seccion(c).querySelector('h2 button').click()));

describe('la página Procesos', () => {
  it('sin título a la vista; abajo (después del tablero) Tablero / Todos y "+ Nuevo" (24/11)', async () => {
    await montar();
    // El título queda solo para los lectores de pantalla; la estancia ya está arriba.
    expect(contenedor.querySelector('h1').className).toMatch(/sr-only/);
    expect(contenedor.textContent).not.toMatch(/La Gateada/);
    const barra = contenedor.querySelector('[data-testid="barra-procesos"]');
    const tablero = contenedor.querySelector('[data-testid="tablero"]');
    expect(tablero.compareDocumentPosition(barra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect([...barra.querySelectorAll('nav[aria-label="Vista"] button')].map((b) => b.textContent)).toEqual(['Tablero', 'Todos']);
    expect(barra.querySelector('a[href="/pecuaria/procesos/nuevo"]')).not.toBeNull();
    expect(api.getProcesos).toHaveBeenCalledWith(1, { estado: 'ABIERTO' });
    expect(lista()).toBeUndefined();
  });

  it('las 4 secciones arrancan cerradas, con sus cabezas (acordeón)', async () => {
    await montar();
    const titulos = [...contenedor.querySelectorAll('[data-testid="tablero"] h2 button')];
    expect(titulos.map((b) => b.textContent.replace(/\s+/g, ' '))).toEqual([
      '1Inseminación · Embriones! DIAGNOSTICO: atrasada 2 días80cab · 1 grupo',
      '2EntoreFIN_SERVICIO: faltan 10 días75cab · 2 grupos35 de IATF',
      '3PreñadasPARICION: faltan 10 días165cab · 1 grupo',
      '4Con cría al pieSin vacas0cab',
    ]);
    expect(titulos.every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(contenedor.querySelector('[data-testid="fila-grupo"]')).toBeNull();
    abrir('prenadas', 'entore', 'cria');
    // Una fila por grupo: la misma IATF está en Preñadas y en Entore (sus vacías).
    expect(seccion('prenadas').textContent).toMatch(/IATF 2026/);
    expect(seccion('entore').textContent).toMatch(/IATF 2026/);
    expect(seccion('cria').textContent).toMatch(/No hay vacas con cría al pie/);
  });

  it('cerrada, debajo del nombre lo más urgente (lo atrasado en rojo); abierta, el subtítulo (25/11)', async () => {
    await montar();
    expect(contenedor.querySelector('[data-testid="aviso-iatf"]').className).toMatch(/text-red-700/);
    abrir('iatf');
    expect(contenedor.querySelector('[data-testid="aviso-iatf"]')).toBeNull();
    expect(seccion('iatf').querySelector('h2').textContent).toMatch(/IATF y transferencia80/);
  });

  it('cada sección mide lo que su contenido (no un pedazo fijo del alto); se baja el tablero entero (25/11)', async () => {
    await montar();
    const tablero = contenedor.querySelector('[data-testid="tablero"]');
    expect(tablero.className).toMatch(/overflow-y-auto/);
    abrir('prenadas', 'entore');
    for (const c of ['iatf', 'entore', 'prenadas', 'cria']) {
      expect(seccion(c).className).not.toMatch(/\bflex-1\b/);
      expect(seccion(c).className).not.toMatch(/overflow/);
    }
    // Abierta, la tabla entera adentro (sin scroll propio).
    expect(contenedor.querySelector('[data-testid="contenido-prenadas"]').className).not.toMatch(/overflow/);
    expect(seccion('prenadas').querySelectorAll('[data-testid="fila-grupo"]')).toHaveLength(1);
    expect(seccion('entore').querySelectorAll('[data-testid="fila-grupo"]')).toHaveLength(2);
    // Cerrarla deja solo el encabezado.
    act(() => seccion('prenadas').querySelector('h2 button').click());
    expect(seccion('prenadas').querySelector('[data-testid="fila-grupo"]')).toBeNull();
  });

  it('cada fila: el grupo, las cabezas, la barra del tiempo y el botón de lo que sigue', async () => {
    await montar();
    abrir('iatf', 'entore', 'prenadas');
    const servicio = seccion('iatf').querySelector('[data-testid="fila-grupo"]');
    expect(servicio.textContent).toMatch(/En servicio · Inseminación · P2/);
    expect(servicio.textContent).toMatch(/atrasada 2 días/);
    expect(servicio.querySelector('[data-testid="barra-tiempo"]')).not.toBeNull();
    expect(servicio.querySelector('a[href="/pecuaria/procesos/9/etapa/DIAGNOSTICO"]').textContent).toBe('Ecografía');
    expect(servicio.querySelector('a[href="/pecuaria/procesos/9"]').textContent).toBe('IATF vaquillonas');
    const vacias = seccion('entore').querySelector('[data-tipo="VACIAS_REENTORE"]');
    expect(vacias.querySelector('a[href="/pecuaria/procesos/nuevo?desde=7"]').textContent).toBe('Empezar el entore');
    // La parición es una ventana.
    expect(seccion('prenadas').textContent).toMatch(/10\/10\/2026 a 10\/12\/2026/);
  });

  it('lo que viene de una IATF va en Entore con otro color y la etiqueta "viene de IATF"', async () => {
    await montar();
    abrir('entore');
    const tarjetas = [...seccion('entore').querySelectorAll('[data-testid="fila-grupo"]')];
    const deIatf = tarjetas.find((t) => t.dataset.deIatf);
    const comun = tarjetas.find((t) => !t.dataset.deIatf);
    expect(deIatf.dataset.deIatf).toBe('true');
    expect(deIatf.className).toMatch(/bg-trigo-100/);
    expect(deIatf.textContent).toMatch(/^IATF 2026.*viene de IATF/);
    expect(comun.dataset.deIatf).toBeUndefined();
    expect(comun.textContent).not.toMatch(/viene de IATF/);
    expect(contenedor.querySelector('[data-testid="de-iatf-entore"]').textContent).toBe('35 de IATF');
  });

  it('abierta, la sección es una tabla tipo Excel: títulos y una fila por grupo (25/11)', async () => {
    await montar();
    abrir('entore');
    const tabla = seccion('entore').querySelector('[data-testid="tabla-grupos"]');
    expect(tabla.tagName).toBe('TABLE');
    expect([...tabla.querySelectorAll('thead th')].map((th) => th.textContent.replace(/[▲▼↕]/g, '').trim())).toEqual([
      'Proceso',
      'Estado',
      'Potreros',
      'Cab.',
      'Lo que sigue',
      'Fecha',
      'Registrar',
    ]);
    expect(tabla.querySelectorAll('tbody tr')).toHaveLength(2);
    // Por defecto, lo que vence primero (lo que no tiene fecha, al final).
    const nombres = () => [...tabla.querySelectorAll('tbody tr td:first-child a')].map((a) => a.textContent);
    expect(nombres()).toEqual(['Entore vacas', 'IATF 2026']);
    // Tocar "Cab." ordena por cabezas: de menor a mayor y, otra vez, al revés.
    const cab = [...tabla.querySelectorAll('thead th button')].find((b) => b.textContent.startsWith('Cab.'));
    act(() => cab.click());
    expect(nombres()).toEqual(['IATF 2026', 'Entore vacas']);
    act(() => cab.click());
    expect(nombres()).toEqual(['Entore vacas', 'IATF 2026']);
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
    abrir('iatf');
    expect(seccion('iatf').textContent).toMatch(/EG IATF vaquillonas/);
  });
});
