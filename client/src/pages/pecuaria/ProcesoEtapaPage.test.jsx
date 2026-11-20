// @vitest-environment jsdom
// Cargar una etapa de un proceso: el diagnóstico (preñadas por mes y vacías,
// después a dónde va cada grupo y revisar) y decidir lo de las vacías.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getProceso: vi.fn(), getCategorias: vi.fn(), vistaPreviaEtapa: vi.fn(), registrarEtapa: vi.fn() }));
vi.mock('../../api/pecuaria', () => api);
vi.mock('../../hooks/usePotreros', () => ({
  default: () => ({ potreros: [{ id: 8, nombre: 'P8' }, { id: 12, nombre: 'P12' }], errors: [] }),
}));

const { default: ProcesoEtapaPage } = await import('./ProcesoEtapaPage.jsx');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOTE_V = { loteId: 1, nombre: 'Lote V', potrero: { id: 8, nombre: 'P8' }, categoria: 'Vaquillonas', categoriaId: 3, cabezas: 50, activo: true, sugeridas: { PRENADA: 4, VACIA: 5 } };
const ficha = (lotes) => ({
  proceso: { id: 7, nombre: 'Servicio 2026-27 · Vaquillonas', campoId: 1, estado: 'ABIERTO', campo: { id: 1, nombre: 'EJ' } },
  meses: ['2027-10', '2027-11', '2027-12'],
  etapas: [{ clave: 'DIAGNOSTICO', cargas: [] }],
  lotes,
});

function Donde() {
  const l = useLocation();
  return <p data-testid="donde">{l.pathname}</p>;
}

let contenedor;
let root;
beforeEach(() => {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  api.getCategorias.mockResolvedValue({
    data: [
      { id: 3, nombre: 'Vaquillonas', activo: true },
      { id: 4, nombre: 'Vaquillonas preñadas', activo: true },
      { id: 5, nombre: 'Vaquillonas invernar', activo: true },
    ],
  });
  api.vistaPreviaEtapa.mockResolvedValue({ data: { oracion: 'Vas a anotar el diagnóstico de 50 cabezas', pasos: [{ texto: '18 → P12, lote Lote V · preñadas oct' }], avisos: [] } });
  api.registrarEtapa.mockResolvedValue({ data: { oracion: 'Anotaste el diagnóstico' } });
});
afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
  vi.clearAllMocks();
});

async function montar(etapa) {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[`/pecuaria/procesos/7/etapa/${etapa}`]}>
        <Routes>
          <Route path="/pecuaria/procesos/:id/etapa/:etapa" element={<ProcesoEtapaPage />} />
          <Route path="*" element={<Donde />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}
const boton = (t) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
const click = async (el) => act(async () => el.click());
const escribir = async (el, valor) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const elegir = async (el, valor) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const input = (aria) => contenedor.querySelector(`input[aria-label="${aria}"]`);
const select = (aria) => contenedor.querySelector(`select[aria-label="${aria}"]`);

describe('el diagnóstico', () => {
  it('preñadas por mes → a dónde va cada grupo (vacías: decidir después) → revisar → confirmar', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([{ ...LOTE_V, rol: 'VIENTRES' }]) });
    await montar('DIAGNOSTICO');
    expect(contenedor.textContent).toContain('Lote V');
    await click(boton('Seguir'));

    // Datos: una casilla por mes esperado, "sin mes" y las vacías.
    await click(boton('Tacto'));
    await escribir(input('Lote V: preñadas oct'), '18');
    await escribir(input('Lote V: preñadas nov'), '22');
    await escribir(input('Lote V: vacías'), '10');
    expect(contenedor.textContent).toContain('50 de 50');
    await click(boton('Seguir'));

    // Destino: un grupo por mes con preñadas, y las vacías.
    const grupos = [...contenedor.querySelectorAll('[data-grupo]')].map((g) => g.getAttribute('data-grupo'));
    expect(grupos).toEqual(['2027-10', '2027-11', 'vacias']);
    expect(select('Lote V · Vacías: qué se hace').value).toBe('DESPUES');
    expect(select('Lote V · Preñadas oct: categoría').value).toBe('4');
    await elegir(select('Lote V · Preñadas oct: a dónde'), 'POTRERO:12');
    await click(boton('Revisar'));

    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'DIAGNOSTICO', {
      fecha: expect.any(String),
      metodo: 'TACTO',
      lineas: [{ loteId: 1, prenadas: { '2027-10': 18, '2027-11': 22 }, vacias: 10 }],
      decision: [
        {
          loteId: 1,
          grupos: [
            { clave: '2027-10', destino: { potreroId: 12 }, categoriaId: 4 },
            { clave: '2027-11', destino: { potreroId: 8 }, categoriaId: 4 },
            { clave: 'vacias', destino: { despues: true } },
          ],
        },
      ],
    });
    expect(contenedor.textContent).toContain('18 → P12, lote Lote V · preñadas oct');
    await click(boton('Confirmar'));
    expect(api.registrarEtapa).toHaveBeenCalledTimes(1);
    expect(contenedor.querySelector('[data-testid="donde"]').textContent).toBe('/pecuaria/procesos/7');
  });
});

describe('decidir lo de las vacías', () => {
  it('dos opciones: volver a intentar (a otro potrero) o solo moverlas; la venta ya no está', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([{ ...LOTE_V, cabezas: 10, rol: 'VACIAS', destino: null }]) });
    await montar('DECISION');
    expect(contenedor.textContent).toContain('Lote V');
    await click(boton('Seguir'));
    const opciones = [...select('Lote V · Vacías: qué se hace').options].map((o) => o.value);
    expect(opciones).toEqual(['', 'REENTORE', 'SALEN']);
    await elegir(select('Lote V · Vacías: qué se hace'), 'REENTORE');
    await elegir(select('Lote V · Vacías: a qué potrero'), '12');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'DECISION', {
      fecha: expect.any(String),
      lineas: [{ loteId: 1, destino: { reentore: true, potreroId: 12 } }],
    });
  });

  it('solo moverlas: al potrero y con su categoría, y salen del proceso', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([{ ...LOTE_V, cabezas: 10, rol: 'VACIAS', destino: null }]) });
    await montar('DECISION');
    await click(boton('Seguir'));
    await elegir(select('Lote V · Vacías: qué se hace'), 'SALEN');
    await elegir(select('Lote V · Vacías: categoría'), '5');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'DECISION', {
      fecha: expect.any(String),
      lineas: [{ loteId: 1, destino: { salen: true, potreroId: 8 }, categoriaId: 5 }],
    });
  });
});

describe('IATF por días', () => {
  const SIN = { ...LOTE_V, cabezas: 20, rol: 'SIN_SERVIR' };

  it('otro día: cuántas se inseminaron y a dónde van', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([SIN]) });
    await montar('INSEMINACION');
    await click(boton('Seguir'));
    expect(boton('Revisar').disabled).toBe(true);
    await escribir(input('¿Cuántas se inseminaron hoy? (Lote V)'), '15');
    await elegir(select('Lote V: a qué potrero'), '12');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'INSEMINACION', { fecha: expect.any(String), lineas: [{ loteId: 1, cabezas: '15', potreroId: 12 }] });
  });

  it('terminar: las sin inseminar, al repaso o salen', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([SIN]) });
    await montar('FIN_INSEMINACION');
    await click(boton('Seguir'));
    expect(boton('Revisar').disabled).toBe(true);
    const [repaso] = contenedor.querySelectorAll('[aria-label="Lote V: qué pasa con las sin inseminar"] button');
    await click(repaso);
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'FIN_INSEMINACION', { fecha: expect.any(String), lineas: [{ loteId: 1, destino: 'REPASO' }] });
  });
});

describe('la parición', () => {
  it('por lote: madres, terneros, terneras, nacidos muertos y madres muertas; la categoría de las madres', async () => {
    api.getProceso.mockResolvedValue({
      data: ficha([{ ...LOTE_V, nombre: 'Lote P', cabezas: 18, rol: 'PRENADAS', sugeridas: { PARIDA: 6 } }]),
    });
    api.getCategorias.mockResolvedValue({ data: [{ id: 3, nombre: 'Vaquillonas preñadas' }, { id: 6, nombre: 'Vaquillonas paridas' }] });
    await montar('PARICION');
    await click(boton('Seguir'));
    await escribir(input('Lote P: madres que parieron'), '6');
    await escribir(input('Lote P: terneros (machos) vivos'), '3');
    await escribir(input('Lote P: terneras (hembras) vivas'), '2');
    await escribir(input('Lote P: nacidos muertos'), '1');
    expect(select('Lote P: las madres pasan a').value).toBe('6');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'PARICION', {
      fecha: expect.any(String),
      lineas: [{ loteId: 1, madres: '6', machos: '3', hembras: '2', muertos: '1', categoriaMadresId: 6 }],
    });
  });

  it('un aborto puede pasarlas a vacías', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([{ ...LOTE_V, nombre: 'Lote P', cabezas: 18, rol: 'PRENADAS' }]) });
    await montar('ABORTO');
    await click(boton('Seguir'));
    await escribir(contenedor.querySelector('input[inputmode="numeric"]'), '2');
    await click(contenedor.querySelector('[data-testid="a-vacias"] input'));
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'ABORTO', { fecha: expect.any(String), aVacias: true, lineas: [{ loteId: 1, cabezas: '2' }] });
  });
});

describe('el destete', () => {
  it('cada lote de crías a un potrero, con la categoría al llegar y el peso', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([{ ...LOTE_V, loteId: 9, nombre: 'Lote Q · terneros oct', cabezas: 10, rol: 'CRIAS' }]) });
    api.getCategorias.mockResolvedValue({ data: [{ id: 7, nombre: 'Terneros chicos' }, { id: 8, nombre: 'Terneros' }] });
    await montar('DESTETE');
    await click(boton('Seguir'));
    await elegir(select('Lote Q · terneros oct: a qué potrero'), '12');
    await elegir(select('Lote Q · terneros oct: categoría al llegar'), '8');
    await escribir(input('Lote Q · terneros oct: peso promedio'), '180');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'DESTETE', {
      fecha: expect.any(String),
      lineas: [{ loteId: 9, destinoPotreroId: 12, categoriaId: 8, pesoPromedioKg: '180' }],
    });
  });
});
