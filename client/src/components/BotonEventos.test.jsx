// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// "Anotar evento" (23/11): la hoja Eventos que antes abría la barra de abajo.
const estado = vi.hoisted(() => ({ user: null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: estado.user }) }));

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

const { default: BotonEventos } = await import('./BotonEventos.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let contenedor;
let root;

const capataz = { nombre: 'Capataz', esSuperadmin: false, permisos: ['pecuaria:CREAR', 'pecuaria:VER'] };
const direccion = { nombre: 'Dirección', esSuperadmin: false, permisos: ['pecuaria:VER'] };

function Donde() {
  const { pathname, search } = useLocation();
  return <p data-testid="donde">{pathname + search}</p>;
}

function montar(contexto) {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={['/ficha']}>
        <Routes>
          <Route path="/ficha" element={<BotonEventos contexto={contexto} />} />
          <Route path="*" element={<Donde />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

const boton = () => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Anotar evento');
const hoja = () => contenedor.querySelector('[role="dialog"][aria-label="Eventos"]');
const donde = () => contenedor.querySelector('[data-testid="donde"]').textContent;
const abrir = async () => {
  await act(async () => boton().click());
};
const elegir = (nombre) => act(() => [...hoja().querySelectorAll('button')].find((b) => b.textContent.trim() === nombre).click());

beforeEach(() => {
  estado.user = capataz;
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
});

afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
});

describe('BotonEventos', () => {
  it('abre la hoja: Pesada y Recuento arriba y grandes, después los grupos; sin los inactivos ni los que mueven', async () => {
    montar();
    await abrir();
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
    await abrir();
    elegir('Pesada');
    expect(donde()).toBe('/pecuaria/eventos/nuevo?tipo=15');
  });

  it('arranca donde estás: con el potrero o el lote de la ficha', async () => {
    montar({ potrero: 10 });
    await abrir();
    elegir('Vacuna aftosa');
    expect(donde()).toBe('/pecuaria/eventos/nuevo?tipo=24&potrero=10');
    act(() => root.unmount());
    root = createRoot(contenedor);
    montar({ lote: 7 });
    await abrir();
    elegir('Recuento');
    expect(donde()).toBe('/pecuaria/eventos/nuevo?tipo=27&lote=7');
  });

  it('quien no registra (Dirección) no ve el botón', () => {
    estado.user = direccion;
    montar();
    expect(boton()).toBeUndefined();
  });
});
