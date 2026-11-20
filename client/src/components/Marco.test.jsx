// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Lo que devuelven los contextos y la API, a mano en cada test.
const estado = vi.hoisted(() => ({ user: null, campos: [], potreros: [], todas: false, grupo: 'estancias', setCampoId: null }));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: estado.user, logout: vi.fn() }),
}));
vi.mock('../context/EstanciaContext', () => ({
  TODAS: 'todas',
  useEstancia: () => ({
    campos: estado.campos,
    todas: estado.todas,
    campoId: estado.todas ? null : (estado.campos[0]?.id ?? null),
    campo: estado.todas ? null : (estado.campos[0] ?? null),
    grupo: estado.grupo,
    esFeedlot: estado.grupo === 'feedlots',
    camposDelGrupo: estado.campos.filter((c) => (c.tipo === 'CONFINAMIENTO') === (estado.grupo === 'feedlots')),
    setCampoId: estado.setCampoId ?? vi.fn(),
    errors: [],
  }),
}));
vi.mock('../hooks/usePotreros', () => ({
  default: (campoId) => ({ potreros: campoId ? estado.potreros : null, errors: [] }),
}));
// Los tipos del catálogo (la hoja "Eventos").
const TIPOS = vi.hoisted(() => [
  { id: 1, clave: 'SUMAR_LOTE', nombre: 'Sumar a otro lote', efecto: 'MUEVE', activo: true, orden: 10 },
  { id: 15, clave: 'PESADA', nombre: 'Pesada', efecto: 'REGISTRO', activo: true, orden: 150 },
  { id: 16, clave: 'ECOGRAFIA', nombre: 'Ecografía', efecto: 'REGISTRO', sexo: 'HEMBRA', activo: true, orden: 160 },
  { id: 24, clave: 'VACUNA_AFTOSA', nombre: 'Vacuna aftosa', efecto: 'REGISTRO', activo: true, orden: 240 },
  { id: 27, clave: 'RECUENTO', nombre: 'Recuento', efecto: 'REGISTRO', activo: true, orden: 270 },
  { id: 30, clave: 'BANO', nombre: 'Baño', efecto: 'REGISTRO', activo: true, orden: 300 },
  { id: 31, clave: 'DOSIS', nombre: 'Dosificación', efecto: 'REGISTRO', activo: false, orden: 310 },
]);
vi.mock('../api/pecuaria', () => ({ getTiposMovimiento: () => Promise.resolve({ data: TIPOS }) }));

const { default: Marco } = await import('./Marco.jsx');
const { default: PanelFiltros } = await import('./PanelFiltros.jsx');
const { RedirigirPecuaria } = await import('../pages/pecuaria/comun.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let contenedor;
let root;

const EG = { id: 1, sigla: 'EG', nombre: 'La Gateada' };
const superadmin = { nombre: 'Superadmin', esSuperadmin: true, roles: [], permisos: [] };
const capataz = { nombre: 'Capataz', esSuperadmin: false, roles: [{ nombre: 'Capataz' }], permisos: ['pecuaria:CREAR', 'pecuaria:VER'] };
const direccion = { nombre: 'Dirección', esSuperadmin: false, roles: [{ nombre: 'Dirección' }], permisos: ['pecuaria:VER'] };

function Donde() {
  const { pathname, search } = useLocation();
  return <p data-testid="donde">{pathname + search}</p>;
}

function montar(ruta = '/pecuaria/resumen') {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route element={<Marco />}>
            <Route path="/pecuaria" element={<RedirigirPecuaria />} />
            <Route path="*" element={<Donde />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    ),
  );
}

const texto = () => contenedor.textContent;
const donde = () => contenedor.querySelector('[data-testid="donde"]').textContent;
const boton = (nombre) =>
  [...contenedor.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === nombre || b.textContent.trim() === nombre);
const click = (el) => act(() => el.click());
const links = () => [...contenedor.querySelectorAll('a')].map((a) => a.textContent.trim());

beforeEach(() => {
  estado.user = superadmin;
  estado.campos = [EG];
  estado.potreros = [];
  estado.todas = false;
  estado.grupo = 'estancias';
  estado.setCampoId = null;
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
});

afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
});

describe('Marco: barras y panel', () => {
  it('la barra de abajo: Resumen · Potreros · + · Movimientos · Eventos ("Eventos" reemplaza a "Menú")', () => {
    montar();
    const abajo = contenedor.querySelector('nav[aria-label="Barra de abajo"]');
    const partes = [...abajo.children].map((el) => el.textContent.trim() || el.querySelector('button')?.getAttribute('aria-label'));
    expect(partes).toEqual(['Resumen', 'Potreros', 'Registrar', 'Movim.', 'Eventos']);
  });

  it('el superadmin ve Usuarios en el menú; el capataz no', () => {
    montar();
    click(boton('Menú'));
    expect(links()).toContain('Usuarios');
    act(() => root.unmount());
    root = createRoot(contenedor);
    estado.user = capataz;
    montar();
    click(boton('Menú'));
    expect(links()).not.toContain('Usuarios');
    // El capataz no importa ni configura.
    expect(links()).not.toContain('Configuración');
    expect(links()).toContain('Mi perfil');
  });

  it('Dirección no tiene el botón + (no registra)', () => {
    estado.user = direccion;
    montar();
    expect(boton('Registrar')).toBeUndefined();
    const abajo = contenedor.querySelector('nav[aria-label="Barra de abajo"]');
    expect([...abajo.children].map((el) => el.textContent.trim())).toEqual(['Resumen', 'Potreros', 'Movim.', 'Menú']);
  });

  it('con una sola estancia, la muestra fija (sin selector)', () => {
    montar();
    expect(contenedor.querySelector('select[aria-label="Estancia"]')).toBeNull();
    expect(texto()).toContain('La Gateada');
  });

  it('con varias estancias, aparece el selector', () => {
    estado.campos = [EG, { id: 2, sigla: 'ES', nombre: 'Otra estancia' }];
    montar();
    const select = contenedor.querySelector('select[aria-label="Estancia"]');
    expect([...select.options].map((o) => o.textContent)).toEqual(['Todas las estancias', 'La Gateada', 'Otra estancia']);
  });

  it('con feedlots, dos grupos: Estancias y Feedlots, cada uno con su "Todas / Todos"', () => {
    estado.campos = [
      EG,
      { id: 2, sigla: 'ES', nombre: 'Otra estancia' },
      { id: 7, sigla: 'FA', nombre: 'Feedlot A', tipo: 'CONFINAMIENTO' },
      { id: 8, sigla: 'FB', nombre: 'Feedlot B', tipo: 'CONFINAMIENTO' },
    ];
    estado.setCampoId = vi.fn();
    montar();
    const select = contenedor.querySelector('select[aria-label="Estancia"]');
    const grupos = [...select.querySelectorAll('optgroup')].map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.textContent)]);
    expect(grupos).toEqual([
      ['Estancias', ['Todas las estancias', 'La Gateada', 'Otra estancia']],
      ['Feedlots', ['Todos los feedlots', 'Feedlot A', 'Feedlot B']],
    ]);
    act(() => {
      select.value = 'feedlots';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(estado.setCampoId).toHaveBeenCalledWith('feedlots');
    act(() => {
      select.value = '7';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(estado.setCampoId).toHaveBeenLastCalledWith(7);
  });

  it('con "Todos los feedlots" elegido, el selector lo muestra; con un solo feedlot, no hay "Todos"', () => {
    estado.campos = [EG, { id: 7, sigla: 'FA', nombre: 'Feedlot A', tipo: 'CONFINAMIENTO' }];
    montar();
    const select = contenedor.querySelector('select[aria-label="Estancia"]');
    expect([...select.options].map((o) => o.textContent)).toEqual(['La Gateada', 'Feedlot A']);
    act(() => root.unmount());
    root = createRoot(contenedor);
    estado.campos = [EG, { id: 7, sigla: 'FA', nombre: 'Feedlot A', tipo: 'CONFINAMIENTO' }, { id: 8, sigla: 'FB', nombre: 'Feedlot B', tipo: 'CONFINAMIENTO' }];
    estado.todas = true;
    estado.grupo = 'feedlots';
    montar();
    expect(contenedor.querySelector('select[aria-label="Estancia"]').value).toBe('feedlots');
  });

  it('sin feedlots, la lista no tiene grupos', () => {
    estado.campos = [EG, { id: 2, sigla: 'ES', nombre: 'Otra estancia' }];
    montar();
    expect(contenedor.querySelector('select[aria-label="Estancia"] optgroup')).toBeNull();
  });

  it('el botón ☰ de arriba despliega el menú, y tocar afuera lo cierra', () => {
    montar();
    expect(contenedor.querySelector('[role="dialog"][aria-label="Menú"]')).toBeNull();
    click(contenedor.querySelector('header button[aria-label="Menú"]'));
    const panel = contenedor.querySelector('[role="dialog"][aria-label="Menú"]');
    expect(panel.textContent).toContain('Tu estancia');
    expect(panel.textContent).toContain('Parcelas · pronto');
    click(boton('Cerrar el menú'));
    expect(contenedor.querySelector('[role="dialog"][aria-label="Menú"]')).toBeNull();
  });

  it('"Menú" de la barra de abajo (quien no registra) abre el mismo menú', () => {
    estado.user = direccion;
    montar();
    click(contenedor.querySelector('nav[aria-label="Barra de abajo"] > button:last-child'));
    expect(contenedor.querySelector('[role="dialog"][aria-label="Menú"]')).not.toBeNull();
  });

  it('una pantalla sin filtros no muestra la flechita ni el panel', () => {
    montar();
    expect(boton('Abrir los filtros')).toBeUndefined();
    expect(contenedor.querySelector('aside[aria-label="Filtros"]').className).toContain('hidden');
  });

  it('una pantalla con filtros los pone en el panel, que abre la flechita', () => {
    act(() =>
      root.render(
        <MemoryRouter initialEntries={['/con-filtros']}>
          <Routes>
            <Route element={<Marco />}>
              <Route
                path="/con-filtros"
                element={
                  <PanelFiltros activos={1}>
                    <p>Filtro de prueba</p>
                  </PanelFiltros>
                }
              />
            </Route>
          </Routes>
        </MemoryRouter>,
      ),
    );
    const panel = contenedor.querySelector('aside[aria-label="Filtros"]');
    expect(panel.className).not.toMatch(/(^| )hidden( |$)/);
    expect(panel.textContent).toContain('Filtro de prueba');
    expect(panel.className).toContain('-translate-x-full');
    click(boton('Abrir los filtros'));
    expect(contenedor.querySelector('aside[aria-label="Filtros"]').className).toContain('translate-x-0');
  });

  it('ocupa justo la pantalla: lo que scrollea es el contenido, no la página', () => {
    montar();
    expect(contenedor.firstElementChild.className).toContain('fixed inset-0');
    expect(contenedor.querySelector('[data-testid="contenido"]').className).toContain('overflow-y-auto');
  });

  it('sin sesión no hay menú, solo la barra simple', () => {
    estado.user = null;
    montar('/login');
    expect(contenedor.querySelector('nav[aria-label="Barra de abajo"]')).toBeNull();
    expect(boton('Salir')).toBeUndefined();
  });

  it('con la contraseña por cambiar, solo se puede salir', () => {
    estado.user = { ...capataz, debeCambiarPassword: true };
    montar('/cambiar-password');
    expect(contenedor.querySelector('nav[aria-label="Barra de abajo"]')).toBeNull();
    expect(boton('Salir')).toBeTruthy();
  });
});

describe('Marco: el botón +', () => {
  beforeEach(() => {
    estado.potreros = [
      { id: 10, nombre: '10.3', stock: { cabezas: 120, lotes: [
        { loteId: 101, lote: '10.3 · Terneros', categoria: 'Terneros', cabezas: 80 },
        { loteId: 102, lote: '10.3 · Vacas', categoria: 'Vacas', cabezas: 40 },
      ] } },
      { id: 12, nombre: '12', stock: { cabezas: 50, lotes: [{ loteId: 121, lote: '12 · Novillos', categoria: 'Novillos', cabezas: 50 }] } },
      { id: 14, nombre: '14', stock: { cabezas: 0, lotes: [] } },
    ];
  });

  const elegir = (texto) => click([...contenedor.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim().startsWith(texto)));

  it('Mover: potrero → lote → la pantalla de mover', () => {
    montar();
    click(boton('Registrar'));
    elegir('Mover de potrero');
    // Sin animales no aparece.
    expect(texto()).not.toMatch(/\b14\b.*cab/);
    elegir('10.3');
    expect(texto()).toContain('¿Qué lote de 10.3?');
    elegir('10.3 · Vacas');
    expect(donde()).toBe('/pecuaria/mover?potrero=10&lote=102');
  });

  it('cada potrero dice cabezas de qué (por categoría)', () => {
    montar();
    click(boton('Registrar'));
    elegir('Compra');
    const opciones = [...contenedor.querySelectorAll('[role="dialog"] li button')].map((b) => b.textContent);
    expect(opciones).toEqual(['10.380 Terneros · 40 Vacas120 cab', '1250 Novillos50 cab', '14vacío0 cab']);
  });

  it('con un solo lote en el potrero, va directo (y la salida lleva su tipo)', () => {
    montar();
    click(boton('Registrar'));
    elegir('Venta');
    elegir('12');
    expect(donde()).toBe('/pecuaria/registrar?efecto=SALE&potrero=12&lote=121&tipo=VENTA');
  });

  it('el "+" en secciones: Mover arriba, Entra y Sale en dos columnas', () => {
    montar();
    click(boton('Registrar'));
    const hoja = contenedor.querySelector('[role="dialog"]');
    expect(hoja.textContent).toMatch(/Mover.*Mover de potrero.*Cambio de categoría.*Destete.*Mover entre campos.*Movimiento múltiple.*Entra.*Nacimiento.*Compra.*Traslado.*Sale.*Venta.*Muerte.*Traslado.*Consumo.*Pérdida.*Corrección de stock/);
  });

  it('Destete: solo potreros con las madres al lado (dos lotes o más) → el lote de los terneros', () => {
    montar();
    click(boton('Registrar'));
    elegir('Destete');
    const opciones = [...contenedor.querySelectorAll('[role="dialog"] li button')].map((b) => b.textContent);
    expect(opciones).toHaveLength(1);
    elegir('10.3');
    expect(texto()).toContain('¿Cuál es el lote de los terneros?');
    elegir('10.3 · Terneros');
    expect(donde()).toBe('/pecuaria/mover?potrero=10&lote=101&destete=1');
  });

  it('Mover entre campos y Movimiento múltiple van directo a su pantalla', () => {
    montar();
    click(boton('Registrar'));
    elegir('Mover entre campos');
    expect(donde()).toBe('/pecuaria/mover-entre-campos');
    click(boton('Registrar'));
    elegir('Movimiento múltiple');
    expect(donde()).toBe('/pecuaria/movimiento-multiple');
  });

  it('Una entrada pide solo el potrero (también los vacíos)', () => {
    montar();
    click(boton('Registrar'));
    elegir('Nacimiento');
    elegir('14');
    expect(donde()).toBe('/pecuaria/registrar?efecto=ENTRA&potrero=14&tipo=NACIMIENTO');
  });

  it('con "Todas las estancias" elegido, primero pregunta en cuál', () => {
    estado.campos = [EG, { id: 2, sigla: 'ES', nombre: 'Otra estancia' }];
    estado.todas = true;
    montar();
    click(boton('Registrar'));
    elegir('Compra');
    expect(texto()).toContain('¿En qué estancia?');
    elegir('La Gateada');
    expect(texto()).toContain('¿A qué potrero entran?');
    elegir('14');
    expect(donde()).toBe('/pecuaria/registrar?efecto=ENTRA&potrero=14&tipo=COMPRA');
  });

  it('con "Todos los feedlots" elegido, pregunta en qué feedlot (solo los feedlots)', () => {
    estado.campos = [EG, { id: 7, sigla: 'FA', nombre: 'Feedlot A', tipo: 'CONFINAMIENTO' }, { id: 8, sigla: 'FB', nombre: 'Feedlot B', tipo: 'CONFINAMIENTO' }];
    estado.todas = true;
    estado.grupo = 'feedlots';
    montar();
    click(boton('Registrar'));
    elegir('Compra');
    expect(texto()).toContain('¿En qué feedlot?');
    const opciones = [...contenedor.querySelectorAll('[role="dialog"] li button')].map((b) => b.textContent);
    expect(opciones).toEqual(['Feedlot A', 'Feedlot B']);
  });

  it('la búsqueda filtra los potreros', () => {
    montar();
    click(boton('Registrar'));
    elegir('Compra');
    const input = contenedor.querySelector('input[aria-label="Buscar potrero"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    act(() => {
      setter.call(input, '10');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const opciones = [...contenedor.querySelectorAll('[role="dialog"] li button')].map((b) => b.textContent);
    expect(opciones).toHaveLength(1);
    expect(opciones[0]).toContain('10.3');
  });
});

describe('Marco: el botón Eventos', () => {
  // Espera a que lleguen los tipos (la promesa de la API).
  const abrirEventos = async () => {
    await act(async () => {
      contenedor.querySelector('nav[aria-label="Barra de abajo"] > button:last-child').click();
    });
  };
  const hoja = () => contenedor.querySelector('[role="dialog"][aria-label="Eventos"]');

  it('abre la hoja: Pesada y Recuento arriba y grandes, después los grupos; sin los inactivos ni los que mueven', async () => {
    montar();
    await abrirEventos();
    const grandes = [...hoja().querySelectorAll('.grid button')].map((b) => b.textContent.trim());
    expect(grandes).toEqual(['Pesada', 'Recuento']);
    const grupos = [...hoja().querySelectorAll('section')].map((g) => [g.querySelector('p').textContent, [...g.querySelectorAll('button')].map((b) => b.textContent)]);
    expect(grupos).toEqual([
      ['Sanidad', ['Vacuna aftosa']],
      ['Reproducción (hembras)', ['Ecografía']],
      ['Otros', ['Baño']],
    ]);
    expect(hoja().textContent).not.toContain('Dosificación');
    expect(hoja().textContent).not.toContain('Sumar a otro lote');
  });

  it('elegir un evento lleva al camino de 4 pasos', async () => {
    montar();
    await abrirEventos();
    click([...hoja().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Pesada'));
    expect(donde()).toBe('/pecuaria/eventos/nuevo?tipo=15');
  });

  it('arranca donde estás: desde la ficha de un potrero o de un lote, lo lleva', async () => {
    montar('/pecuaria/potreros/10');
    await abrirEventos();
    click([...hoja().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Vacuna aftosa'));
    expect(donde()).toBe('/pecuaria/eventos/nuevo?tipo=24&potrero=10');
    act(() => root.unmount());
    root = createRoot(contenedor);
    montar('/pecuaria/lotes/7');
    await abrirEventos();
    click([...hoja().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Recuento'));
    expect(donde()).toBe('/pecuaria/eventos/nuevo?tipo=27&lote=7');
  });

  it('en la compu, "Eventos" está arriba al lado del "+"', () => {
    montar();
    const arriba = [...contenedor.querySelectorAll('header button')].map((b) => b.textContent.trim());
    expect(arriba.indexOf('Eventos')).toBe(arriba.indexOf('Registrar') + 1);
  });

  it('Dirección (no registra) no tiene Eventos', () => {
    estado.user = direccion;
    montar();
    expect([...contenedor.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Eventos')).toBe(false);
  });
});

describe('direcciones viejas', () => {
  it('/pecuaria?vista=potreros&q=10 → /pecuaria/potreros?q=10', () => {
    montar('/pecuaria?vista=potreros&q=10');
    expect(donde()).toBe('/pecuaria/potreros?q=10');
  });

  it('/pecuaria sola → Resumen', () => {
    montar('/pecuaria');
    expect(donde()).toBe('/pecuaria/resumen');
  });
});
