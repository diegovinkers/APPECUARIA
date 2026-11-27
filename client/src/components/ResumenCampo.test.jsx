// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Cabecera, CargaPorGrupo, TablaResumen, ayudaTabla } from './ResumenCampo.jsx';
import { PlataProvider } from './Plata.jsx';
import PotrerosLista from './PotrerosLista.jsx';
import { ConPanel } from '../test-utils.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let contenedor;
let root;

const RESUMEN = {
  fecha: '2026-11-13',
  kgPorUg: 380,
  filas: [
    { categoriaId: 7, categoria: 'Terneros', CN: 100, VERDEO: 50, CORRAL: 0, OTRO: 0, total: 150 },
    { categoriaId: 9, categoria: 'Vacas', CN: 80, VERDEO: 0, CORRAL: 0, OTRO: 0, total: 80 },
  ],
  totales: { CN: 180, VERDEO: 50, CORRAL: 0, OTRO: 0, total: 230 },
  porGrupo: [{ grupo: 'CN', potreros: 3, hectareas: 100, cabezas: 180, cabHa: 1.8, kilosCompletos: true, ugHa: 0.8 }],
};

beforeEach(() => {
  contenedor = document.createElement('div');
  root = createRoot(contenedor);
});
afterEach(() => act(() => root.unmount()));

const links = () => [...contenedor.querySelectorAll('a')].map((a) => [a.textContent.trim(), a.getAttribute('href')]);

describe('Resumen → Potreros', () => {
  it('la categoría, cada número y cada grupo llevan a Potreros con ese filtro', () => {
    act(() =>
      root.render(
        <MemoryRouter>
          <TablaResumen resumen={RESUMEN} />
        </MemoryRouter>,
      ),
    );
    const l = links();
    expect(l).toContainEqual(['Terneros', '/pecuaria/potreros?categoria=7']);
    expect(l).toContainEqual(['50', '/pecuaria/potreros?categoria=7&grupo=VERDEO']);
    expect(l).toContainEqual(['150', '/pecuaria/potreros?categoria=7']);
    expect(l).toContainEqual(['180', '/pecuaria/potreros?grupo=CN']);
    // Un cero no es link.
    expect(l.some(([, href]) => href === '/pecuaria/potreros?categoria=9&grupo=VERDEO')).toBe(false);
    expect(ayudaTabla(RESUMEN)).toContain('CN: campo natural');
  });
});

describe('filtros de Potreros', () => {
  it('los grupos bajan de renglón (sin scroll de costado) y el filtro de categoría sale de la dirección', () => {
    const potreros = [
      { id: 1, nombre: '1', orden: 0, usoActual: { grupo: 'CN', nombre: 'Campo natural' }, hectareas: 10, stock: { cabezas: 5, lotes: [{ loteId: 1, lote: 'A', categoriaId: 7, categoria: 'Terneros', cabezas: 5 }], kilosCompletos: true } },
      { id: 2, nombre: '2', orden: 0, usoActual: { grupo: 'CN', nombre: 'Campo natural' }, hectareas: 10, stock: { cabezas: 3, lotes: [{ loteId: 2, lote: 'B', categoriaId: 9, categoria: 'Vacas', cabezas: 3 }], kilosCompletos: true } },
    ];
    act(() =>
      root.render(
        <MemoryRouter initialEntries={['/pecuaria/potreros?categoria=7']}>
          <ConPanel>
            <PotrerosLista potreros={potreros} />
          </ConPanel>
        </MemoryRouter>,
      ),
    );
    const grupos = contenedor.querySelector('[aria-label="Grupo de uso de suelo"]');
    expect(grupos.className).toContain('flex-wrap');
    expect(grupos.className).not.toContain('overflow-x-auto');
    expect(contenedor.textContent).toContain('1 de 2 potreros');
  });
});

describe('valor del ganado', () => {
  const montar = (resumen, { conOjo = false } = {}) => {
    const contenido = (
      <>
        <Cabecera cabezas="230" detalle="3 potreros" valor={resumen.valor} />
        <CargaPorGrupo porGrupo={resumen.porGrupo} />
        <TablaResumen resumen={resumen} />
      </>
    );
    act(() => root.render(<MemoryRouter>{conOjo ? <PlataProvider>{contenido}</PlataProvider> : contenido}</MemoryRouter>));
  };
  const cuadro = () => contenedor.querySelector('[data-testid="valor-ganado"]');
  const CON_VALOR = {
    ...RESUMEN,
    valor: { usd: 93500, completo: false },
    filas: [{ ...RESUMEN.filas[0], valorUsd: 60000, valorCompleto: true }, RESUMEN.filas[1]],
    porGrupo: [{ ...RESUMEN.porGrupo[0], kilosEstimados: true, valorUsd: 93500 }],
  };

  it('muestra el valor, avisa si está incompleto; la carga en cab/ha, sin UG/ha', () => {
    montar(CON_VALOR);
    expect(cuadro().textContent).toMatch(/USD 93\.500/);
    expect(cuadro().textContent).toMatch(/Incompleto/);
    expect(contenedor.textContent).toMatch(/1,8 cab\/ha/);
    expect(contenedor.textContent).not.toMatch(/UG/);
  });

  it('sin precios cargados, manda a Configuración (y no hay ojito)', () => {
    montar({ ...RESUMEN, valor: { usd: 0, completo: false } }, { conOjo: true });
    expect(cuadro().querySelector('a').getAttribute('href')).toBe('/pecuaria/configuracion');
    expect(contenedor.querySelector('button[aria-label="Mostrar los valores"]')).toBeNull();
  });

  it('en el Resumen la plata arranca tapada y el ojito la muestra y la vuelve a tapar', () => {
    montar(CON_VALOR, { conOjo: true });
    const texto = () => contenedor.textContent;
    expect(texto()).not.toMatch(/93\.500/);
    expect(texto()).not.toMatch(/60 mil/);
    expect(contenedor.querySelectorAll('[data-plata="oculta"]').length).toBeGreaterThanOrEqual(3);
    // Las cabezas se ven igual.
    expect(texto()).toContain('230');

    const ojo = contenedor.querySelector('button[aria-label="Mostrar los valores"]');
    expect(ojo.getAttribute('aria-pressed')).toBe('false');
    act(() => ojo.click());
    expect(texto()).toMatch(/USD 93\.500/);
    expect(texto()).toMatch(/60 mil/);
    expect(contenedor.querySelector('[data-plata="oculta"]')).toBeNull();

    act(() => contenedor.querySelector('button[aria-label="Ocultar los valores"]').click());
    expect(texto()).not.toMatch(/93\.500/);
  });
});

describe('columna Valor', () => {
  const montar = (resumen) =>
    act(() =>
      root.render(
        <MemoryRouter>
          <TablaResumen resumen={resumen} />
        </MemoryRouter>,
      ),
    );
  const titulos = () => [...contenedor.querySelectorAll('thead th')].map((th) => th.textContent);

  it('va entre los grupos y el Total, con el valor de la categoría y por cabeza', () => {
    montar({
      ...RESUMEN,
      valor: { usd: 2_224_000, completo: true },
      filas: [
        { ...RESUMEN.filas[0], valorUsd: 120_000, valorCompleto: true },
        { ...RESUMEN.filas[1], valorUsd: 104_000, valorCompleto: true },
      ],
    });
    expect(titulos()).toEqual(['Categoría', 'CN', 'Verdeos', 'Valor USD', 'Total']);
    const celdas = [...contenedor.querySelectorAll('[data-testid="valor-categoria"]')].map((c) => c.textContent);
    // Terneros: 120.000 / 150 = 800 por cabeza; total: 2,22 M / 230.
    expect(celdas).toEqual(['120 mil800/cab', '104 mil1.300/cab', '2,22 M9.670/cab']);
  });

  it('sin precios cargados no aparece', () => {
    montar({ ...RESUMEN, valor: { usd: 0, completo: false } });
    expect(titulos()).not.toContain('Valor USD');
  });
});
