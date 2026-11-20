// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ConPanel, textoCompu } from '../test-utils.jsx';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ user: null, datos: null }));
const api = vi.hoisted(() => ({
  getMovimientos: vi.fn(),
  getMovimientosTodas: vi.fn(),
  getTiposMovimiento: vi.fn(),
  revertirEvento: vi.fn(),
  revertirMovimiento: vi.fn(),
  anularEventoRegistro: vi.fn(),
  anularGrupoEventos: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: estado.user }) }));
vi.mock('../api/pecuaria', () => api);

const { default: MovimientosLista, armarFilas, ordenarFilas, tiposDe } = await import('./MovimientosLista.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EG = { id: 1, sigla: 'EG', nombre: 'La Gateada' };
const LS = { id: 2, sigla: 'ELS', nombre: 'La Seda' };
const p = (id, nombre, campoId = 1) => ({ id, nombre, campoId, campo: { sigla: campoId === 1 ? 'EG' : 'ELS' } });
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

  it('con "Todas las estancias" (sin campoId), cada potrero con la sigla de su estancia', () => {
    const [entre, multiple, suelto] = armarFilas(MOVIMIENTOS, null);
    expect([entre.origen, entre.destino]).toEqual(['EG 10.3 · A', 'ELS Feedlot · A']);
    expect([multiple.origenCorto, multiple.destinoCorto]).toEqual(['EG 10.3, EG 2', 'EG 2, EG 3']);
    expect(suelto.origen).toBe('EG 2 · B');
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

  async function montar({ todas = false, potreros = [] } = {}) {
    act(() =>
      root.render(
        <MemoryRouter>
          <ConPanel>
            <MovimientosLista campoId={todas ? null : EG.id} potreros={potreros} todas={todas} />
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

  it('con "Todas las estancias" pide los de todas y el filtro de potrero lleva la sigla', async () => {
    api.getMovimientosTodas.mockResolvedValue({ data: { movimientos: MOVIMIENTOS, resumen: { movimientos: 4, cabezas: 230, entradas: 0, salidas: 3 } } });
    const potreros = [
      { id: 1, nombre: '10.3', campo: { sigla: 'EG' } },
      { id: 9, nombre: 'Feedlot', campo: { sigla: 'ELS' } },
    ];
    await montar({ todas: true, potreros });
    expect(api.getMovimientosTodas).toHaveBeenCalled();
    expect(api.getMovimientos).not.toHaveBeenCalled();
    expect(filasDelCuerpo()[0]).toMatch(/EG 10\.3 · A.*ELS Feedlot · A/);
    const opciones = [...document.querySelectorAll('option')].map((o) => o.textContent);
    expect(opciones).toEqual(expect.arrayContaining(['EG 10.3', 'ELS Feedlot']));
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

// Eventos (20/11): una vacuna a dos lotes (una carga) y una pesada suelta.
const ev = (id, extra) => ({
  id,
  grupoId: 'g1',
  fecha: '2026-11-16',
  creadoEn: '2026-11-16T10:00:00Z',
  tipo: { id: 24, clave: 'VACUNA_AFTOSA', nombre: 'Vacuna aftosa' },
  nivel: 'LOTE',
  cabezas: 80,
  datos: { producto: 'Bivalente' },
  texto: 'Producto: Bivalente',
  nota: null,
  campo: EG,
  potrero: p(1, '10.3'),
  lote: lote(5, 'A'),
  categoria: 'Terneros',
  usuario: 'Capataz',
  cambiaStock: false,
  anulado: false,
  puedeAnular: true,
  ...extra,
});
const EVENTOS = [
  ev(41, {}),
  ev(42, { potrero: p(2, '2'), lote: lote(6, 'B'), categoria: 'Vacas', cabezas: 40 }),
  ev(43, {
    grupoId: 'g2',
    fecha: '2026-11-13',
    tipo: { id: 15, clave: 'PESADA', nombre: 'Pesada' },
    datos: { pesoPromedioKg: 262 },
    texto: '262 kg (antes 250)',
    cambiaStock: true,
  }),
];

describe('eventos en la lista (20/11)', () => {
  it('una carga de eventos es una fila (que se despliega con sus lotes), ordenada con los movimientos por fecha', () => {
    const filas = armarFilas(MOVIMIENTOS, EG.id, EVENTOS);
    expect(filas.map((f) => [f.clave, f.tipo, f.cabezas, f.fecha])).toEqual([
      ['gg1', 'Vacuna aftosa · 2 lotes', 120, '2026-11-16'],
      ['e8', 'Entre campos', 100, '2026-11-15'],
      ['e7', 'Múltiple · 2 pasos', 130, '2026-11-14'],
      ['gg2', 'Pesada', 80, '2026-11-13'],
      ['m10', 'Muerte', 3, '2026-11-12'],
    ]);
    const vacuna = filas.find((f) => f.clave === 'gg1');
    expect(vacuna).toMatchObject({ origen: '10.3 · A, 2 · B', destino: '—', categoria: 'Terneros, Vacas', detalle: 'Producto: Bivalente', puedeRevertir: true });
    expect(filas.find((f) => f.clave === 'gg2')).toMatchObject({ peso: 262, detalle: '262 kg (antes 250)' });
  });

  it('una carga entera anulada queda como anulada y ya no se anula', () => {
    const [fila] = armarFilas([], EG.id, [ev(41, { anulado: true, puedeAnular: false })]);
    expect(fila).toMatchObject({ revertido: true, puedeRevertir: false });
  });

  describe('en la tabla', () => {
    let contenedor;
    let root;
    beforeEach(() => {
      estado.user = { esSuperadmin: true, permisos: [] };
      for (const f of Object.values(api)) f.mockReset();
      api.getMovimientos.mockResolvedValue({
        data: { movimientos: [], eventos: EVENTOS, resumen: { movimientos: 0, cabezas: 0, entradas: 0, salidas: 0, eventos: 3 } },
      });
      api.getTiposMovimiento.mockResolvedValue({ data: [] });
      api.anularGrupoEventos.mockResolvedValue({ data: {} });
      api.anularEventoRegistro.mockResolvedValue({ data: {} });
      contenedor = document.createElement('div');
      document.body.appendChild(contenedor);
      root = createRoot(contenedor);
    });
    afterEach(() => {
      act(() => root.unmount());
      contenedor.remove();
      vi.restoreAllMocks();
    });
    async function montar(ruta = '/pecuaria/registro?ver=eventos', ver = 'eventos') {
      act(() =>
        root.render(
          <MemoryRouter initialEntries={[ruta]}>
            <ConPanel>
              <MovimientosLista campoId={EG.id} potreros={[]} ver={ver} />
            </ConPanel>
          </MemoryRouter>,
        ),
      );
      await act(async () => {});
    }
    const titulos = () => [...contenedor.querySelectorAll('thead th')].map((th) => th.textContent.replace(/[↕▲▼]/g, '').trim()).filter(Boolean);

    it('cada pestaña pide lo suyo y tiene sus columnas (Eventos: sin Peso ni Destino; Origen es "Dónde")', async () => {
      await montar('/pecuaria/registro', 'movimientos');
      expect(api.getMovimientos).toHaveBeenLastCalledWith(EG.id, expect.objectContaining({ ver: 'movimientos' }));
      expect(titulos()).toEqual(['Fecha', 'Movimiento', 'Categoría', 'Cab.', 'Peso', 'Origen', 'Destino', 'Usuario']);
      act(() => root.unmount());
      root = createRoot(contenedor);
      await montar();
      expect(api.getMovimientos).toHaveBeenLastCalledWith(EG.id, expect.objectContaining({ ver: 'eventos' }));
      expect(titulos()).toEqual(['Fecha', 'Evento', 'Categoría', 'Cab.', 'Dónde', 'Usuario']);
      // Cada fila tiene tantas celdas como títulos (más la de Anular).
      expect(contenedor.querySelector('tbody tr').children).toHaveLength(7);
    });

    it('en Movimientos, un recuento con diferencia va con la marca "evento" y se cuenta en el total', async () => {
      const recuento = ev(50, {
        grupoId: 'g5',
        tipo: { id: 20, clave: 'RECUENTO', nombre: 'Recuento' },
        datos: { anteriores: 100, contadas: 96 },
        texto: 'había 100, se contaron 96 (abigeato)',
        cambiaStock: true,
        cambiaCabezas: true,
      });
      api.getMovimientos.mockResolvedValue({ data: { movimientos: [], eventos: [recuento], resumen: { movimientos: 0, cabezas: 0, entradas: 0, salidas: 0, eventos: 1 } } });
      await montar('/pecuaria/registro', 'movimientos');
      expect(textoCompu(contenedor.querySelector('tbody tr'))).toMatch(/evento.*Recuento.*había 100, se contaron 96/);
      expect(contenedor.querySelector('tfoot').textContent).toMatch(/0 movimientos.*1 recuento con diferencia/);
    });

    it('el filtro Tipo muestra los de la pestaña', async () => {
      const TIPOS = [
        { id: 1, clave: 'SUMAR_LOTE', nombre: 'Sumar a otro lote', efecto: 'MUEVE' },
        { id: 2, clave: 'MUERTE', nombre: 'Muerte', efecto: 'SALE' },
        { id: 3, clave: 'PESADA', nombre: 'Pesada', efecto: 'REGISTRO' },
        { id: 4, clave: 'RECUENTO', nombre: 'Recuento', efecto: 'REGISTRO' },
      ];
      expect(tiposDe(TIPOS, 'movimientos').map((t) => t.clave)).toEqual(['SUMAR_LOTE', 'MUERTE', 'RECUENTO']);
      expect(tiposDe(TIPOS, 'eventos').map((t) => t.clave)).toEqual(['PESADA', 'RECUENTO']);
      api.getTiposMovimiento.mockResolvedValue({ data: TIPOS });
      await montar();
      const opciones = [...contenedor.querySelectorAll('select')].at(-1).querySelectorAll('option');
      expect([...opciones].map((o) => o.textContent)).toEqual(['Todos', 'Pesada', 'Recuento']);
    });

    it('con ?ver=eventos: las cargas como filas, el total de eventos, y se despliegan los lotes', async () => {
      await montar();
      const filas = [...contenedor.querySelectorAll('tbody tr')].map(textoCompu);
      expect(filas).toHaveLength(2);
      expect(filas[0]).toMatch(/evento.*Vacuna aftosa · 2 lotes.*Producto: Bivalente/);
      expect(contenedor.querySelector('tfoot').textContent).toMatch(/3 eventos \(uno por lote\)/);
      expect(contenedor.querySelector('tfoot').textContent).not.toMatch(/movimientos/);
      act(() => contenedor.querySelector('button[aria-label="Ver los pasos"]').click());
      expect([...contenedor.querySelectorAll('tbody tr')]).toHaveLength(4);
    });

    it('"Anular" en la fila anula la carga entera; en un lote desplegado, solo ese', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await montar();
      const anular = () => [...contenedor.querySelectorAll('button')].filter((b) => b.textContent === 'Anular');
      await act(async () => anular()[0].click());
      expect(api.anularGrupoEventos).toHaveBeenCalledWith('g1');
      act(() => contenedor.querySelector('button[aria-label="Ver los pasos"]').click());
      await act(async () => anular()[1].click());
      expect(api.anularEventoRegistro).toHaveBeenCalledWith(41);
    });
  });
});
