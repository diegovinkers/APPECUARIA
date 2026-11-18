// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Lo que devuelven los contextos y la API, a mano en cada test.
const estado = vi.hoisted(() => ({ user: null, campos: [], potreros: [] }));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: estado.user, logout: vi.fn() }),
}));
vi.mock('../context/EstanciaContext', () => ({
  useEstancia: () => ({
    campos: estado.campos,
    campoId: estado.campos[0]?.id ?? null,
    campo: estado.campos[0] ?? null,
    setCampoId: vi.fn(),
    errors: [],
  }),
}));
vi.mock('../hooks/usePotreros', () => ({
  default: (campoId) => ({ potreros: campoId ? estado.potreros : null, errors: [] }),
}));

const { default: Marco } = await import('./Marco.jsx');
const { RedirigirPecuaria } = await import('../pages/pecuaria/comun.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let contenedor;
let root;

const EG = { id: 1, sigla: 'EG', nombre: 'La Gateada' };
const superadmin = { nombre: 'Superadmin', esSuperadmin: true, roles: [] };
const capataz = { nombre: 'Capataz', esSuperadmin: false, roles: [{ nombre: 'Capataz' }] };

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
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
});

afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
});

describe('Marco: barras y panel', () => {
  it('la barra de abajo: Resumen · Potreros · + · Movimientos · Menú', () => {
    montar();
    const abajo = contenedor.querySelector('nav[aria-label="Barra de abajo"]');
    const partes = [...abajo.children].map((el) => el.textContent.trim() || el.querySelector('button')?.getAttribute('aria-label'));
    expect(partes).toEqual(['Resumen', 'Potreros', 'Registrar', 'Movim.', 'Menú']);
  });

  it('el superadmin ve Usuarios en el panel; el capataz no', () => {
    montar();
    expect(links()).toContain('Usuarios');
    act(() => root.unmount());
    root = createRoot(contenedor);
    estado.user = capataz;
    montar();
    expect(links()).not.toContain('Usuarios');
    expect(links()).toContain('Configuración');
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
    expect([...select.options].map((o) => o.textContent)).toEqual(['La Gateada', 'Otra estancia']);
  });

  it('la flechita del borde abre el panel y la X lo cierra', () => {
    montar();
    expect(contenedor.querySelector('[role="dialog"][aria-label="Menú"]')).toBeNull();
    click(boton('Abrir el menú'));
    const panel = contenedor.querySelector('[role="dialog"][aria-label="Menú"]');
    expect(panel.textContent).toContain('Tu estancia');
    expect(panel.textContent).toContain('Parcelas · pronto');
    click(boton('Cerrar'));
    expect(contenedor.querySelector('[role="dialog"][aria-label="Menú"]')).toBeNull();
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
    elegir('Mover entre potreros');
    // Sin animales no aparece.
    expect(texto()).not.toMatch(/\b14\b.*cab/);
    elegir('10.3');
    expect(texto()).toContain('¿Qué lote de 10.3?');
    elegir('10.3 · Vacas');
    expect(donde()).toBe('/pecuaria/mover?potrero=10&lote=102');
  });

  it('con un solo lote en el potrero, va directo', () => {
    montar();
    click(boton('Registrar'));
    elegir('Salida');
    elegir('12');
    expect(donde()).toBe('/pecuaria/registrar?efecto=SALE&potrero=12&lote=121');
  });

  it('Entrada pide solo el potrero (también los vacíos)', () => {
    montar();
    click(boton('Registrar'));
    elegir('Entrada');
    elegir('14');
    expect(donde()).toBe('/pecuaria/registrar?efecto=ENTRA&potrero=14');
  });

  it('la búsqueda filtra los potreros', () => {
    montar();
    click(boton('Registrar'));
    elegir('Entrada');
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
