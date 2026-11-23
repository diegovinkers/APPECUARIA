// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Configuración → Procesos y Toros (fase 3, docs/PECUARIA.md §9).
const api = vi.hoisted(() => ({
  getConfiguracionProcesos: vi.fn(),
  guardarConfiguracionProcesos: vi.fn(),
  getToros: vi.fn(),
  getPotreros: vi.fn(),
  crearToro: vi.fn(),
  editarToro: vi.fn(),
}));
vi.mock('../api/pecuaria', () => api);
vi.mock('../context/EstanciaContext', () => ({
  useEstancia: () => ({
    campos: [
      { id: 1, nombre: 'Estancia Ejemplo', tipo: 'ESTANCIA' },
      { id: 9, nombre: 'Feedlot Ejemplo', tipo: 'CONFINAMIENTO' },
    ],
    campoId: 1,
  }),
}));

const { ConfigProcesos, ConfigToros, lotesDeToros, problemaConfiguracion } = await import('./ProcesosConfig.jsx');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LIMITES = { DIAS: { min: 1, max: 400 }, MESES: { min: 1, max: 24 }, aviso: { min: 0, max: 60 } };
const CONFIG = {
  etapas: [
    { clave: 'FIN_SERVICIO', nombre: 'Fin del entore', plazo: 90, unidad: 'DIAS', avisoDias: 7, textoDesde: 'del inicio del servicio' },
    { clave: 'DESTETE', nombre: 'Destete', plazo: 6, unidad: 'MESES', avisoDias: 7, textoDesde: 'del parto' },
  ],
  estados: [
    { rol: 'PRENADAS', nombre: 'Preñada' },
    { rol: 'VACIAS', nombre: 'Vacía' },
  ],
  limites: LIMITES,
};

let contenedor;
let root;
beforeEach(() => {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  api.getConfiguracionProcesos.mockResolvedValue({ data: CONFIG });
  api.guardarConfiguracionProcesos.mockResolvedValue({ data: CONFIG });
});
afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
  vi.clearAllMocks();
});

const montar = async (el) => {
  act(() => root.render(el));
  await act(async () => {});
};
const escribir = (el, valor) =>
  act(() => {
    Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
const campo = (label) => contenedor.querySelector(`[aria-label="${label}"]`);
const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);

describe('problemaConfiguracion', () => {
  const etapas = CONFIG.etapas.map((e) => ({ ...e, plazo: String(e.plazo), avisoDias: String(e.avisoDias) }));
  it('sin problemas, null', () => {
    expect(problemaConfiguracion(etapas, CONFIG.estados, LIMITES)).toBeNull();
  });
  it('plazos fuera de rango (según la unidad), aviso y nombres', () => {
    expect(problemaConfiguracion([{ ...etapas[1], plazo: '30' }], [], LIMITES)).toBe('Destete: el plazo va de 1 a 24 meses');
    expect(problemaConfiguracion([{ ...etapas[0], plazo: 'x' }], [], LIMITES)).toMatch(/de 1 a 400 días/);
    expect(problemaConfiguracion([{ ...etapas[0], avisoDias: '61' }], [], LIMITES)).toMatch(/aviso va de 0 a 60/);
    expect(problemaConfiguracion(etapas, [{ rol: 'A', nombre: 'Vacía' }, { rol: 'B', nombre: ' vacía ' }], LIMITES)).toMatch(/mismo nombre/);
    expect(problemaConfiguracion(etapas, [{ rol: 'A', nombre: ' ' }], LIMITES)).toMatch(/necesita un nombre/);
  });
});

describe('ConfigProcesos', () => {
  it('muestra cada etapa con su plazo, unidad, "desde" y aviso, y los estados', async () => {
    await montar(<ConfigProcesos />);
    const fin = contenedor.querySelector('[data-testid="etapa-FIN_SERVICIO"]');
    expect(fin.textContent).toContain('días del inicio del servicio');
    expect(contenedor.querySelector('[data-testid="etapa-DESTETE"]').textContent).toContain('meses del parto');
    expect(campo('Plazo de Fin del entore').value).toBe('90');
    expect(campo('Estado VACIAS').value).toBe('Vacía');
  });

  it('guarda todo junto, con números', async () => {
    await montar(<ConfigProcesos />);
    escribir(campo('Plazo de Destete'), '7');
    escribir(campo('Estado VACIAS'), 'Falladas');
    await act(async () => boton('Guardar plazos y estados').click());
    expect(api.guardarConfiguracionProcesos).toHaveBeenCalledWith({
      etapas: [
        { clave: 'FIN_SERVICIO', nombre: 'Fin del entore', plazo: 90, avisoDias: 7 },
        { clave: 'DESTETE', nombre: 'Destete', plazo: 7, avisoDias: 7 },
      ],
      estados: [
        { rol: 'PRENADAS', nombre: 'Preñada' },
        { rol: 'VACIAS', nombre: 'Falladas' },
      ],
    });
    expect(contenedor.textContent).toContain('Listo: se guardaron los plazos y los estados.');
  });

  it('con un plazo fuera de rango avisa y no deja guardar', async () => {
    await montar(<ConfigProcesos />);
    escribir(campo('Plazo de Destete'), '30');
    expect(contenedor.textContent).toContain('Destete: el plazo va de 1 a 24 meses');
    expect(boton('Guardar plazos y estados').disabled).toBe(true);
  });
});

describe('ConfigToros', () => {
  const POTREROS = [
    { nombre: 'P3', stock: { lotes: [{ loteId: 4, lote: 'Toros P3', categoria: 'Toros', cabezas: 4 }, { loteId: 5, lote: 'Vacas', categoria: 'Vacas de cría', cabezas: 90 }] } },
    { nombre: 'P8', stock: null },
  ];
  const TOROS = [
    { id: 1, identificacion: 'T-014', raza: 'Angus', genetica: null, activo: true, lote: { id: 4, nombre: 'Toros P3', potrero: { nombre: 'P3' } }, enProceso: null },
    { id: 2, identificacion: 'T-022', raza: null, genetica: null, activo: false, lote: null, enProceso: null },
  ];
  beforeEach(() => {
    api.getToros.mockResolvedValue({ data: TOROS });
    api.getPotreros.mockResolvedValue({ data: POTREROS });
    api.crearToro.mockResolvedValue({ data: {} });
    api.editarToro.mockResolvedValue({ data: {} });
  });

  it('lotesDeToros: solo los lotes de categorías de toros', () => {
    expect(lotesDeToros(POTREROS)).toEqual([{ id: 4, texto: 'Toros P3 · P3 (4 cab)' }]);
  });

  it('lista los toros de la estancia elegida (no ofrece los feedlots)', async () => {
    await montar(<ConfigToros />);
    expect(api.getToros).toHaveBeenCalledWith(1, { todos: true });
    const filas = [...contenedor.querySelectorAll('[data-testid="toro"]')].map((li) => li.textContent);
    expect(filas[0]).toContain('T-014');
    expect(filas[0]).toContain('En Toros P3 (P3)');
    expect(filas[1]).toContain('dado de baja');
    expect(campo('Estancia de los toros')).toBeNull();
  });

  it('agregar un toro con su lote', async () => {
    await montar(<ConfigToros />);
    act(() => boton('+ Agregar toro').click());
    escribir(campo('Identificación del toro'), ' T-030 ');
    escribir(campo('Raza'), 'Hereford');
    escribir(campo('Lote de toros'), '4');
    await act(async () => boton('Agregar').click());
    expect(api.crearToro).toHaveBeenCalledWith(1, { identificacion: 'T-030', raza: 'Hereford', genetica: '', nota: '', loteId: 4 });
    expect(contenedor.textContent).toContain('Listo: se agregó el toro T-030.');
  });

  it('dar de baja y reactivar', async () => {
    await montar(<ConfigToros />);
    await act(async () => boton('Dar de baja').click());
    expect(api.editarToro).toHaveBeenCalledWith(1, { activo: false });
    await act(async () => boton('Reactivar').click());
    expect(api.editarToro).toHaveBeenCalledWith(2, { activo: true });
  });
});
