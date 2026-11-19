// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ConPanel, textoCompu } from '../test-utils.jsx';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ user: null, datos: null }));
const api = vi.hoisted(() => ({
  getMovimientos: vi.fn(),
  getTiposMovimiento: vi.fn(),
  revertirEvento: vi.fn(),
  revertirMovimiento: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: estado.user }) }));
vi.mock('../api/pecuaria', () => api);

const { default: MovimientosLista, armarFilas, ordenarFilas } = await import('./MovimientosLista.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EG = { id: 1, sigla: 'EG', nombre: 'La Gateada' };
const LS = { id: 2, sigla: 'ELS', nombre: 'La Seda' };
const p = (id, nombre, campoId = 1) => ({ id, nombre, campoId });
const lote = (id, nombre) => ({ id, nombre });
const base = {
  causa: null,
  guia: null,
  campo: EG,
  campoOtro: null,
  loteMadres: null,
  nota: null,
  usuario: 'Encargado',
  revertido: false,
  puedeRevertir: true,
  evento: null,
  pesoPromedioKg: null,
  tipo: { nombre: 'Sumar a otro lote' },
};

// Un movimiento suelto (12/11), un múltiple de 2 pasos (14/11) y uno entre
// campos de La Gateada a La Seda (15/11). Llegan del más nuevo al más viejo.
const MULTIPLE = { id: 7, tipo: 'MULTIPLE', nota: 'Liberar el 2', pasos: 2, revertido: false, puedeRevertir: true };
const ENTRE = { id: 8, tipo: 'ENTRE_CAMPOS', nota: null, pasos: 1, revertido: false, puedeRevertir: true };
const MOVIMIENTOS = [
  {
    ...base,
    id: 30,
    fecha: '2026-11-15',
    modo: 'ENTERO',
    cabezas: 100,
    categoriaOrigen: 'Terneros',
    categoriaDestino: 'Terneros',
    potreroOrigen: p(1, '10.3'),
    loteOrigen: lote(5, 'A'),
    potreroDestino: p(9, 'Feedlot', 2),
    loteDestino: lote(5, 'A'),
    campoOtro: LS,
    guia: 'G-1',
    evento: ENTRE,
    puedeRevertir: false,
  },
  {
    ...base,
    id: 21,
    fecha: '2026-11-14',
    modo: 'ENTERO',
    cabezas: 80,
    categoriaOrigen: 'Vacas',
    categoriaDestino: 'Vacas',
    potreroOrigen: p(2, '2'),
    loteOrigen: lote(6, 'B'),
    potreroDestino: p(3, '3'),
    loteDestino: lote(6, 'B'),
    evento: MULTIPLE,
    puedeRevertir: false,
  },
  {
    ...base,
    id: 20,
    fecha: '2026-11-14',
    modo: 'NUEVO',
    cabezas: 50,
    categoriaOrigen: 'Terneros',
    categoriaDestino: 'Terneros',
    potreroOrigen: p(1, '10.3'),
    loteOrigen: lote(5, 'A'),
    potreroDestino: p(2, '2'),
    loteDestino: lote(9, 'Pesados'),
    evento: MULTIPLE,
    puedeRevertir: false,
  },
  {
    ...base,
    id: 10,
    fecha: '2026-11-12',
    modo: 'SALIDA',
    cabezas: 3,
    tipo: { nombre: 'Muerte' },
    categoriaOrigen: 'Vacas',
    categoriaDestino: null,
    potreroOrigen: p(2, '2'),
    loteOrigen: lote(6, 'B'),
    potreroDestino: null,
    loteDestino: null,
    pesoPromedioKg: 450,
  },
];

describe('armarFilas', () => {
  it('un evento es una fila con sus pasos; lo suelto, una fila cada uno', () => {
    const filas = armarFilas(MOVIMIENTOS, EG.id);
    expect(filas.map((f) => [f.clave, f.tipo, f.cabezas])).toEqual([
      ['e8', 'Entre campos', 100],
      ['e7', 'Múltiple · 2 pasos', 130],
      ['m10', 'Muerte', 3],
    ]);
    const multiple = filas[1];
    expect(multiple.pasos.map((m) => m.id)).toEqual([20, 21]);
    expect(multiple.origen).toBe('10.3 · A, 2 · B');
    expect(multiple.nota).toBe('Liberar el 2');
    expect(filas[2]).toMatchObject({ signo: '−', origen: '2 · B', destino: '—', peso: 450 });
  });

  it('entre campos: "→ La Seda" en el origen y "← La Gateada" en el destino', () => {
    const [enOrigen] = armarFilas(MOVIMIENTOS, EG.id);
    expect(enOrigen.origen).toBe('10.3 · A');
    expect(enOrigen.destino).toBe('→ La Seda · Feedlot · A');
    const [enDestino] = armarFilas(MOVIMIENTOS, LS.id);
    expect(enDestino.origen).toBe('← La Gateada · 10.3 · A');
    expect(enDestino.destino).toBe('Feedlot · A');
  });

  it('para la segunda línea del celular, solo los potreros (sin repetir la categoría del lote)', () => {
    const [entre, multiple, suelto] = armarFilas(MOVIMIENTOS, EG.id);
    expect([multiple.origenCorto, multiple.destinoCorto]).toEqual(['10.3, 2', '2, 3']);
    expect([entre.origenCorto, entre.destinoCorto]).toEqual(['10.3', '→ La Seda · Feedlot']);
    expect([suelto.origenCorto, suelto.destinoCorto]).toEqual(['2', '—']);
  });
});

describe('ordenarFilas', () => {
  const filas = armarFilas(MOVIMIENTOS, EG.id);
  it('por cabezas, de mayor a menor y al revés', () => {
    expect(ordenarFilas(filas, { col: 'cabezas', dir: 'desc' }).map((f) => f.cabezas)).toEqual([130, 100, 3]);
    expect(ordenarFilas(filas, { col: 'cabezas', dir: 'asc' }).map((f) => f.cabezas)).toEqual([3, 100, 130]);
  });
  it('por fecha, de la más vieja a la más nueva', () => {
    expect(ordenarFilas(filas, { col: 'fecha', dir: 'asc' }).map((f) => f.fecha)).toEqual(['2026-11-12', '2026-11-14', '2026-11-15']);
  });
});

describe('la tabla', () => {
  let contenedor;
  let root;

  beforeEach(() => {
    estado.user = { esSuperadmin: true, permisos: [] };
    for (const f of Object.values(api)) f.mockReset();
    api.getMovimientos.mockResolvedValue({ data: { movimientos: MOVIMIENTOS, resumen: { movimientos: 4, cabezas: 230, entradas: 0, salidas: 3 } } });
    api.getTiposMovimiento.mockResolvedValue({ data: [] });
    api.revertirEvento.mockResolvedValue({ data: {} });
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    root = createRoot(contenedor);
  });
  afterEach(() => {
    act(() => root.unmount());
    contenedor.remove();
  });

  async function montar() {
    act(() =>
      root.render(
        <MemoryRouter>
          <ConPanel>
            <MovimientosLista campoId={EG.id} potreros={[]} />
          </ConPanel>
        </MemoryRouter>,
      ),
    );
    await act(async () => {});
  }
  const filasDelCuerpo = () => [...contenedor.querySelectorAll('tbody tr')].map(textoCompu);
  const boton = (texto) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.includes(texto) || b.getAttribute('aria-label') === texto);

  it('una fila por movimiento, con los totales de lo filtrado abajo', async () => {
    await montar();
    expect(filasDelCuerpo()).toHaveLength(3);
    expect(contenedor.querySelector('tfoot').textContent).toMatch(/4 movimientos · 230 cabezas movidas · \+0 entraron · −3 salieron/);
    // Ya no están Mover / Entrada / Salida arriba: todo se registra desde el "+".
    expect(boton('Mover')).toBeUndefined();
  });

  it('el evento se despliega con sus pasos', async () => {
    await montar();
    const ver = [...contenedor.querySelectorAll('button[aria-label="Ver los pasos"]')];
    act(() => ver[1].click());
    const filas = filasDelCuerpo();
    expect(filas).toHaveLength(5);
    expect(filas[2]).toMatch(/Paso 1.*Lote nuevo.*10\.3 · A.*2 · Pesados/);
    expect(filas[3]).toMatch(/Paso 2.*Lote entero.*2 · B.*3 · B/);
  });

  it('ordena tocando el título de la columna', async () => {
    await montar();
    act(() => boton('Cab.').click());
    expect(filasDelCuerpo().map((t) => t.match(/^.\s?(\d\d\/\d\d\/\d{4})|^(\d\d\/\d\d\/\d{4})/)?.slice(1).find(Boolean))).toEqual(['14/11/2026', '15/11/2026', '12/11/2026']);
    act(() => boton('Cab.').click());
    expect(filasDelCuerpo()[0]).toMatch(/12\/11\/2026/);
  });

  it('Revertir en la fila del evento revierte el evento entero', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await montar();
    const [revertir] = [...contenedor.querySelectorAll('button')].filter((b) => b.textContent === 'Revertir');
    await act(async () => revertir.click());
    expect(api.revertirEvento).toHaveBeenCalledWith(8);
    expect(api.revertirMovimiento).not.toHaveBeenCalled();
    window.confirm.mockRestore();
  });

  it('con más de 50 filas aparece el paginador; la página 2 trae el resto', async () => {
    const muchos = Array.from({ length: 120 }, (_, i) => ({ ...MOVIMIENTOS[3], id: 1000 + i, cabezas: i + 1 }));
    api.getMovimientos.mockResolvedValue({ data: { movimientos: muchos, resumen: { movimientos: 120, cabezas: 0, entradas: 0, salidas: 0 } } });
    await montar();
    expect(filasDelCuerpo()).toHaveLength(50);
    const paginas = contenedor.querySelector('nav[aria-label="Páginas"]');
    expect(paginas.textContent).toContain('1–50 de 120');
    act(() => [...paginas.querySelectorAll('button')].find((b) => b.textContent === '3').click());
    expect(filasDelCuerpo()).toHaveLength(20);
    expect(paginas.textContent).toContain('101–120 de 120');
  });

  it('sin permiso de revertir no hay columna de acciones', async () => {
    estado.user = { esSuperadmin: false, permisos: ['pecuaria:VER'] };
    await montar();
    expect([...contenedor.querySelectorAll('button')].some((b) => b.textContent === 'Revertir')).toBe(false);
  });
});
