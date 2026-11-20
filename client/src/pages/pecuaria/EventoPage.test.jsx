// @vitest-environment jsdom
// El camino de 4 pasos de un evento: qué → a quién → datos → revisar y
// confirmar, con el buscador, el sexo, "arranca donde estás", volver sin
// perder lo cargado y "Hacer otro igual".
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TODOS = ['CAMPO', 'POTRERO', 'CATEGORIA', 'LOTE', 'PARTE_LOTE'];
const TIPOS = vi.hoisted(() => []);
const api = vi.hoisted(() => ({
  getTiposMovimiento: vi.fn(),
  getPotrero: vi.fn(),
  getLote: vi.fn(),
  vistaPreviaEventoRegistro: vi.fn(),
  registrarEventoRegistro: vi.fn(),
}));
const estado = vi.hoisted(() => ({ todas: false }));
vi.mock('../../api/pecuaria', () => api);
const EG = { id: 1, sigla: 'EG', nombre: 'La Gateada' };
vi.mock('../../context/EstanciaContext', () => ({
  useEstancia: () => ({
    campos: [{ id: 1, sigla: 'EG', nombre: 'La Gateada' }, { id: 2, sigla: 'ES', nombre: 'El Silencio' }],
    campoId: estado.todas ? null : 1,
    todas: estado.todas,
    campo: estado.todas ? null : { id: 1, sigla: 'EG', nombre: 'La Gateada' },
    camposDelGrupo: [{ id: 1, sigla: 'EG', nombre: 'La Gateada' }, { id: 2, sigla: 'ES', nombre: 'El Silencio' }],
    esFeedlot: false,
  }),
}));
const POTREROS = [
  {
    id: 10,
    nombre: '10.3',
    stock: {
      lotes: [
        { loteId: 101, lote: '10.3 · Terneros', categoriaId: 1, categoria: 'Terneros', sexo: 'MACHO', cabezas: 80, pesoPromedioKg: 250 },
        { loteId: 102, lote: '10.3 · Vacas', categoriaId: 2, categoria: 'Vacas', sexo: 'HEMBRA', cabezas: 40, pesoPromedioKg: null },
      ],
    },
  },
  { id: 12, nombre: '12', stock: { lotes: [{ loteId: 121, lote: '12 · Novillos', categoriaId: 3, categoria: 'Novillos', sexo: 'MACHO', cabezas: 50 }] } },
];
vi.mock('../../hooks/usePotreros', () => ({ default: (campoId) => ({ potreros: campoId ? POTREROS : null, errors: [] }) }));

const { default: EventoPage } = await import('./EventoPage.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const tipo = (id, clave, nombre, extra = {}) => ({ id, clave, nombre, efecto: 'REGISTRO', activo: true, orden: id * 10, sexo: 'CUALQUIERA', niveles: TODOS, ...extra });
TIPOS.push(
  tipo(15, 'PESADA', 'Pesada', { niveles: ['POTRERO', 'CATEGORIA', 'LOTE', 'PARTE_LOTE'] }),
  tipo(16, 'ECOGRAFIA', 'Ecografía', { sexo: 'HEMBRA', niveles: ['CATEGORIA', 'LOTE', 'PARTE_LOTE'] }),
  tipo(24, 'VACUNA_AFTOSA', 'Vacuna aftosa'),
  tipo(27, 'RECUENTO', 'Recuento', { niveles: ['CAMPO', 'POTRERO', 'LOTE'] }),
);

let contenedor;
let root;
const almacen = new Map();

function Donde() {
  const { pathname, search } = useLocation();
  return <p data-testid="donde">{pathname + search}</p>;
}

async function montar(ruta) {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/pecuaria/eventos/nuevo" element={<EventoPage />} />
          <Route path="*" element={<Donde />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}

const texto = () => contenedor.textContent;
const botones = () => [...contenedor.querySelectorAll('button')];
const boton = (t) => botones().find((b) => b.textContent.trim() === t || b.textContent.trim().startsWith(t));
const click = async (el) => {
  await act(async () => el.click());
};
const pasoActual = () => contenedor.querySelector('[aria-current="step"]').textContent;
const escribir = async (el, valor) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const casilla = (lote) => [...contenedor.querySelectorAll('label')].find((l) => l.textContent.includes(lote))?.querySelector('input[type="checkbox"]');
const seguir = () => boton('Seguir') ?? boton('Revisar') ?? boton('Confirmar');

beforeEach(() => {
  estado.todas = false;
  almacen.clear();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => almacen.get(k) ?? null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => almacen.set(k, v));
  for (const f of Object.values(api)) f.mockReset();
  api.getTiposMovimiento.mockResolvedValue({ data: TIPOS });
  api.getPotrero.mockResolvedValue({ data: { id: 10, campoId: 1 } });
  api.getLote.mockResolvedValue({ data: { lote: { id: 121, campoId: 1 } } });
  api.vistaPreviaEventoRegistro.mockResolvedValue({
    data: {
      tipo: { id: 24, clave: 'VACUNA_AFTOSA', nombre: 'Vacuna aftosa' },
      oracion: 'Vas a anotar Vacuna aftosa en 1 lote, 80 cabezas, el 20/11/2026',
      cambiaStock: false,
      avisos: [],
      lineas: [{ loteId: 101, lote: '10.3 · Terneros', potrero: '10.3', cabezas: 80, texto: 'Producto: Bivalente' }],
    },
  });
  api.registrarEventoRegistro.mockResolvedValue({ data: { grupoId: 'g1', eventos: [], oracion: 'Anotaste Vacuna aftosa en 1 lote, 80 cabezas, el 20/11/2026' } });
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
});

afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
  vi.restoreAllMocks();
});

describe('el camino de 4 pasos', () => {
  it('qué → a quién → datos → revisar → confirmar; se vuelve atrás sin perder lo cargado', async () => {
    await montar('/pecuaria/eventos/nuevo?tipo=24');
    expect(contenedor.querySelector('h1').textContent).toBe('Vacuna aftosa');
    expect(pasoActual()).toMatch(/2A quién/);
    // Sin nada elegido no se puede seguir.
    expect(seguir().disabled).toBe(true);
    await click(casilla('10.3 · Terneros'));
    expect(texto()).toContain('1 lote · 80 cab');
    await click(seguir());

    expect(pasoActual()).toMatch(/3Datos/);
    const producto = [...contenedor.querySelectorAll('label')].find((l) => l.textContent.startsWith('Producto')).querySelector('input');
    await escribir(producto, 'Bivalente');
    // Atrás: lo elegido sigue; adelante otra vez: el producto sigue.
    await click(boton('Atrás'));
    expect(pasoActual()).toMatch(/2A quién/);
    expect(casilla('10.3 · Terneros').checked).toBe(true);
    await click(seguir());
    expect([...contenedor.querySelectorAll('input')].some((i) => i.value === 'Bivalente')).toBe(true);

    await click(boton('Revisar'));
    expect(api.vistaPreviaEventoRegistro).toHaveBeenCalledWith(
      expect.objectContaining({ tipoId: 24, nivel: 'LOTE', lineas: [{ loteId: 101 }], datos: { producto: 'Bivalente' } }),
    );
    expect(pasoActual()).toMatch(/4Revisar/);
    expect(contenedor.querySelector('[data-testid="oracion"]').textContent).toBe('Vas a anotar Vacuna aftosa en 1 lote, 80 cabezas, el 20/11/2026.');

    await click(boton('Confirmar'));
    expect(api.registrarEventoRegistro).toHaveBeenCalledTimes(1);
    expect(contenedor.querySelector('[data-testid="hecho"]').textContent).toMatch(/^Anotaste Vacuna aftosa/);
  });

  it('"Hacer otro igual": mismo tipo y fecha, sin elegir a quién', async () => {
    await montar('/pecuaria/eventos/nuevo?tipo=24');
    await click(casilla('12 · Novillos'));
    await click(seguir());
    const fecha = contenedor.querySelector('input[type="date"]');
    await escribir(fecha, '2026-11-18');
    await click(boton('Revisar'));
    await click(boton('Confirmar'));
    await click(boton('Hacer otro igual'));

    expect(contenedor.querySelector('h1').textContent).toBe('Vacuna aftosa');
    expect(pasoActual()).toMatch(/2A quién/);
    expect(casilla('12 · Novillos').checked).toBe(false);
    expect(seguir().disabled).toBe(true);
    await click(casilla('10.3 · Vacas'));
    await click(seguir());
    expect(contenedor.querySelector('input[type="date"]').value).toBe('2026-11-18');
  });

  it('"Listo" vuelve a Movimientos con los eventos a la vista', async () => {
    await montar('/pecuaria/eventos/nuevo?tipo=24');
    await click(casilla('12 · Novillos'));
    await click(seguir());
    await click(boton('Revisar'));
    await click(boton('Confirmar'));
    await click(boton('Listo'));
    expect(contenedor.querySelector('[data-testid="donde"]').textContent).toBe('/pecuaria/movimientos?ver=eventos');
  });

  it('el paso 1 (qué) se puede tocar para cambiar el tipo', async () => {
    await montar('/pecuaria/eventos/nuevo?tipo=24');
    await click(botones().find((b) => b.textContent.includes('Qué')));
    expect(pasoActual()).toMatch(/1Qué/);
    await click(boton('Recuento'));
    expect(contenedor.querySelector('h1').textContent).toBe('Recuento');
    expect(pasoActual()).toMatch(/2A quién/);
  });

  it('si la vista previa da un error, se queda en los datos y lo muestra', async () => {
    api.vistaPreviaEventoRegistro.mockRejectedValue({ response: { data: { errors: ['Escribí el peso promedio del lote 10.3 · Vacas'] } } });
    await montar('/pecuaria/eventos/nuevo?tipo=15');
    await click(casilla('10.3 · Vacas'));
    await click(seguir());
    await click(boton('Revisar'));
    expect(pasoActual()).toMatch(/3Datos/);
    expect(texto()).toContain('Escribí el peso promedio del lote 10.3 · Vacas');
  });
});

describe('a quién', () => {
  it('el buscador: por potrero, lote o categoría; una categoría entera si el tipo lo permite', async () => {
    await montar('/pecuaria/eventos/nuevo?tipo=24');
    const buscador = contenedor.querySelector('input[aria-label="Buscar potrero, lote o categoría"]');
    await escribir(buscador, 'vacas');
    const lista = contenedor.querySelector('[data-testid="potreros-evento"]').textContent;
    expect(lista).toContain('10.3 · Vacas');
    expect(lista).not.toContain('10.3 · Terneros');
    await click(boton('Todos los Vacas'));
    expect(texto()).toContain('1 lote · 40 cab');
    await escribir(buscador, '12');
    expect(contenedor.querySelector('[data-testid="potreros-evento"]').textContent).not.toContain('10.3');
  });

  it('la estancia entera, si el tipo lo permite (la vacuna sí, la ecografía no)', async () => {
    await montar('/pecuaria/eventos/nuevo?tipo=24');
    await click(boton('Toda la estancia'));
    expect(texto()).toContain('3 lotes · 170 cab');
    act(() => root.unmount());
    root = createRoot(contenedor);
    await montar('/pecuaria/eventos/nuevo?tipo=16');
    expect(boton('Toda la estancia')).toBeUndefined();
  });

  it('respeta el sexo: la ecografía no ofrece lotes de machos', async () => {
    await montar('/pecuaria/eventos/nuevo?tipo=16');
    expect(casilla('10.3 · Terneros')).toBeUndefined();
    expect(casilla('10.3 · Vacas')).toBeDefined();
    expect(texto()).toContain('No se muestran 2 lotes de machos: Ecografía es solo para hembras.');
  });

  it('arranca donde estás: desde la ficha de un potrero, el potrero entero', async () => {
    await montar('/pecuaria/eventos/nuevo?tipo=15&potrero=10');
    expect(api.getPotrero).toHaveBeenCalledWith(10);
    expect(texto()).toContain('2 lotes · 120 cab');
    expect(boton('Todo el potrero').getAttribute('aria-pressed')).toBe('true');
  });

  it('con "Todas las estancias", primero pregunta en cuál', async () => {
    estado.todas = true;
    await montar('/pecuaria/eventos/nuevo?tipo=24');
    expect(texto()).toContain('¿En qué estancia?');
    await click(boton('La Gateada'));
    expect(casilla('10.3 · Terneros')).toBeDefined();
  });

  it('los usados hace poco aparecen la próxima vez', async () => {
    await montar('/pecuaria/eventos/nuevo?tipo=24');
    expect(contenedor.querySelector('[data-testid="recientes"]')).toBeNull();
    await click(casilla('12 · Novillos'));
    await click(seguir());
    await click(boton('Revisar'));
    await click(boton('Confirmar'));
    act(() => root.unmount());
    root = createRoot(contenedor);
    await montar('/pecuaria/eventos/nuevo?tipo=24');
    const recientes = contenedor.querySelector('[data-testid="recientes"]');
    expect(recientes.textContent).toBe('12 · Novillos');
    await click(recientes.querySelector('button'));
    expect(casilla('12 · Novillos').checked).toBe(true);
  });
});

describe('los datos de cada tipo', () => {
  it('la pesada sugiere el peso actual y cuántas se pesaron (todas)', async () => {
    await montar('/pecuaria/eventos/nuevo?tipo=15');
    await click(casilla('10.3 · Terneros'));
    await click(seguir());
    const peso = contenedor.querySelector('input[aria-label="Peso promedio (kg) · 10.3 · Terneros"]');
    expect(peso.value).toBe('250');
    expect(contenedor.querySelector('input[aria-label="Cuántas se pesaron (de 80) · 10.3 · Terneros"]').value).toBe('80');
  });

  it('el recuento sugiere lo que dice la app; si hay diferencia pide el motivo', async () => {
    await montar('/pecuaria/eventos/nuevo?tipo=27');
    await click(casilla('12 · Novillos'));
    await click(seguir());
    const contadas = contenedor.querySelector('input[aria-label="Contadas (la app dice 50) · 12 · Novillos"]');
    expect(contadas.value).toBe('50');
    expect(texto()).not.toContain('Motivo de la diferencia');
    await escribir(contadas, '48');
    expect(texto()).toContain('Motivo de la diferencia');
  });
});
