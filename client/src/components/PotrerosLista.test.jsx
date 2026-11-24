// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import PotrerosLista, { ordenarPotreros } from './PotrerosLista.jsx';
import { ConPanel, textoCompu } from '../test-utils.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// El texto como se ve en el celular: sin lo que solo aparece en la compu.
const textoCelular = (el) => {
  const copia = el.cloneNode(true);
  for (const e of copia.querySelectorAll('.hidden')) e.remove();
  return copia.textContent;
};

const CN = { grupo: 'CN', nombre: 'Campo natural' };
const potrero = (id, nombre, cabezas, hectareas, extra = {}) => ({
  id,
  nombre,
  orden: id,
  usoActual: CN,
  hectareas,
  stock: {
    cabezas,
    cabHa: hectareas ? cabezas / hectareas : null,
    ugHa: null,
    kilosCompletos: true,
    lotes: cabezas ? [{ loteId: id, lote: `${nombre} · Vacas`, categoriaId: 9, categoria: 'Vacas', cabezas }] : [],
  },
  ...extra,
});

describe('ordenarPotreros', () => {
  const lista = [potrero(1, '1', 10, 5), potrero(2, '2', 50, 10), potrero(3, '3', 0, null, { hectareasAConfirmar: true })];
  it('por cabezas de mayor a menor; por ha, los que no tienen el dato al final', () => {
    expect(ordenarPotreros(lista, { col: 'cabezas', dir: 'desc' }).map((p) => p.nombre)).toEqual(['2', '1', '3']);
    expect(ordenarPotreros(lista, { col: 'hectareas', dir: 'asc' }).map((p) => p.nombre)).toEqual(['1', '2', '3']);
    expect(ordenarPotreros(lista, { col: 'hectareas', dir: 'desc' }).map((p) => p.nombre)).toEqual(['2', '1', '3']);
  });
  it('por potrero sigue el orden de la planilla', () => {
    expect(ordenarPotreros(lista, { col: 'potrero', dir: 'desc' }).map((p) => p.nombre)).toEqual(['3', '2', '1']);
  });
});

describe('la tabla de potreros', () => {
  let contenedor;
  let root;
  beforeEach(() => {
    contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    root = createRoot(contenedor);
  });
  afterEach(() => {
    act(() => root.unmount());
    contenedor.remove();
  });

  function Donde() {
    const { search } = useLocation();
    return <p data-testid="donde">{search}</p>;
  }
  const montar = (potreros, ruta = '/pecuaria/potreros', todas = false) =>
    act(() =>
      root.render(
        <MemoryRouter initialEntries={[ruta]}>
          <Routes>
            <Route
              path="/pecuaria/potreros"
              element={
                <ConPanel>
                  <PotrerosLista potreros={potreros} todas={todas} />
                  <Donde />
                </ConPanel>
              }
            />
          </Routes>
        </MemoryRouter>,
      ),
    );
  const primeraColumna = () => [...contenedor.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td a').textContent);
  const titulo = (t) => [...contenedor.querySelectorAll('thead button')].find((b) => b.textContent.startsWith(t));
  const donde = () => contenedor.querySelector('[data-testid="donde"]').textContent;

  it('con "Todas las estancias": la sigla adelante, por estancia, y la búsqueda la encuentra', () => {
    const EG = { sigla: 'EG', orden: 0 };
    const ES = { sigla: 'ES', orden: 1 };
    // Llegan desordenados: van primero los de EG (orden 0) y después los de ES.
    montar([potrero(1, '8.1', 10, 5, { campo: ES }), potrero(2, '8.1', 20, 5, { campo: EG }), potrero(3, '9', 0, 4, { campo: EG })], undefined, true);
    expect(primeraColumna()).toEqual(['EG8.1', 'EG9', 'ES8.1']);
    act(() => root.unmount());
    root = createRoot(contenedor);
    montar([potrero(1, '8.1', 10, 5, { campo: ES }), potrero(2, '8.1', 20, 5, { campo: EG })], '/pecuaria/potreros?q=es%208', true);
    expect(primeraColumna()).toEqual(['ES8.1']);
  });

  it('una fila por potrero con cabezas de qué, y los totales abajo', () => {
    montar([potrero(1, '1', 10, 5), potrero(2, '2', 50, 10), potrero(3, '3', 0, 4)]);
    const filas = [...contenedor.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map(textoCompu));
    expect(filas[1]).toEqual(['2', 'Campo natural', '10', '50', '50 Vacas', '—', '—', '5']);
    expect(filas[2][4]).toBe('vacío');
    expect(textoCompu(contenedor.querySelector('tfoot'))).toMatch(/Total.*3 potreros.*19.*60.*cabezas.*3,16/);
  });

  it('con área utilizable: "40 de 50" (y "40/50 ha" en el celular); el cab/ha del total la usa', () => {
    // 100 cabezas en 40 de 50 ha + 20 en un potrero de 20 ha sin área: 120 / 60 = 2.
    montar([potrero(1, '1', 100, 50, { areaUtilizable: 40 }), potrero(2, '2', 20, 20)]);
    const [fila] = [...contenedor.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map(textoCompu));
    expect(fila[2]).toBe('40 de 50');
    expect(textoCelular(contenedor.querySelector('[data-testid="celda-ha"]'))).toBe('40 de 50');
    expect(textoCompu(contenedor.querySelector('tfoot'))).toMatch(/70.*120.*cabezas.*\b2\b/);
  });

  it('con kilos estimados (peso de la categoría): "≈" en peso y kg/ha; cab/ha al final, sin UG/ha', () => {
    const p = potrero(1, '1', 100, 50);
    p.stock = { ...p.stock, kilos: 19000, kilosCompletos: true, kilosEstimados: true, kgPvHa: 380, ugHa: 1 };
    montar([p]);
    const [fila] = [...contenedor.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map(textoCompu));
    expect(fila.slice(5)).toEqual(['≈190', '≈380', '2']);
    expect(contenedor.querySelector('thead').textContent).not.toMatch(/UG/);
  });

  it('peso promedio y kg/ha (sin peso en algún lote: —); el total promedia los lotes con peso', () => {
    const conPeso = (id, cabezas, peso, ha, completos = true) => {
      const p = potrero(id, String(id), cabezas, ha);
      const lotes = p.stock.lotes.map((l) => ({ ...l, pesoPromedioKg: completos ? peso : null }));
      return { ...p, stock: { ...p.stock, lotes, kilosCompletos: completos, kilos: completos ? cabezas * peso : 0, kgPvHa: completos ? (cabezas * peso) / ha : 0 } };
    };
    montar([conPeso(1, 100, 300, 20), conPeso(2, 50, 400, 10), conPeso(3, 40, 0, 10, false)]);
    const filas = [...contenedor.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map(textoCompu));
    // Columnas: potrero, uso, ha, cabezas, categorías, peso, kg/ha, cab/ha.
    expect([filas[0][5], filas[0][6]]).toEqual(['300', '1.500']);
    expect([filas[1][5], filas[1][6]]).toEqual(['400', '2.000']);
    expect([filas[2][5], filas[2][6]]).toEqual(['—', '—']);
    // Total: (100×300 + 50×400) / 150 = 333.
    expect([...contenedor.querySelectorAll('tfoot td')].map(textoCompu)[5]).toBe('333');
  });

  it('el título ordena y queda en la dirección', () => {
    montar([potrero(1, '1', 10, 5), potrero(2, '2', 50, 10), potrero(3, '3', 0, 4)]);
    act(() => titulo('Cabezas').click());
    expect(primeraColumna()).toEqual(['2', '1', '3']);
    expect(donde()).toBe('?orden=cabezas');
    act(() => titulo('Cabezas').click());
    expect(primeraColumna()).toEqual(['3', '1', '2']);
    expect(donde()).toBe('?orden=cabezas&dir=asc');
  });

  it('en el celular: debajo del nombre el uso con color y qué hay, sin repetir las cabezas; cab/ha en su columna', () => {
    const dos = { ...potrero(4, '4', 65, 10), stock: { ...potrero(4, '4', 65, 10).stock, lotes: [
      { loteId: 41, lote: '4 · Vacas', categoriaId: 9, categoria: 'Vacas', cabezas: 40 },
      { loteId: 42, lote: '4 · Terneros', categoriaId: 8, categoria: 'Terneros', cabezas: 25 },
    ] } };
    const arroz = potrero(5, '5', 0, 30, { usoActual: { grupo: 'OTRO', nombre: 'Arroz' } });
    montar([potrero(2, '2', 50, 10), dos, arroz]);
    const lineas = [...contenedor.querySelectorAll('[data-testid="linea-celular"]')].map((l) => l.textContent);
    expect(lineas).toEqual(['Campo naturalVacas', 'Campo natural40 Vacas · 25 Terneros', 'Arroz']);
    // Las hectáreas tienen su columna también en el celular (sin decimales).
    expect([...contenedor.querySelectorAll('[data-testid="celda-ha"]')].map(textoCelular)).toEqual(['10', '10', '30']);
    // El uso va como etiqueta de color.
    expect(contenedor.querySelector('[data-testid="linea-celular"] span').className).toContain('bg-lime');
    const cabezas = contenedor.querySelectorAll('tbody tr')[0].querySelectorAll('td')[3];
    // Solo las cabezas (cab/ha tiene su columna, también en el celular), y todo centrado a lo alto.
    expect(cabezas.textContent).toBe('50');
    expect(cabezas.className).toContain('align-middle');
    // Todas las filas del mismo alto; lo largo se corta con "…" (no baja de renglón).
    for (const tr of contenedor.querySelectorAll('tbody tr')) expect(tr.className).toContain('h-[4.5rem]');
    expect(contenedor.querySelector('[data-testid="linea-celular"] span.truncate')).not.toBeNull();
    const escondidas = [...contenedor.querySelectorAll('thead th')].filter((th) => th.className.includes('hidden md:table-cell'));
    expect(escondidas.map((th) => th.textContent.replace(/[▲▼↕]/g, '').trim())).toEqual(['Uso', 'Categorías']);
  });

  it('la barra de carga (cab/ha) se llena según el potrero más cargado; no pide peso', () => {
    const conCarga = (id, cabHa, extra = {}) => {
      const p = potrero(id, String(id), 10, 5);
      return { ...p, stock: { ...p.stock, cabHa, ...extra } };
    };
    montar([conCarga(1, 2), conCarga(2, 4), conCarga(3, 3, { kilosCompletos: false })]);
    const anchos = [...contenedor.querySelectorAll('[data-testid="barra-carga"] > span')].map((b) => b.style.width);
    expect(anchos).toEqual(['50%', '100%', '75%']);
  });

  it('los filtros van al panel izquierdo; el botón es solo el ícono, con cuántos hay puestos', () => {
    montar([potrero(1, '1', 10, 5)], '/pecuaria/potreros?grupo=CN&categoria=9');
    const botonFiltros = contenedor.querySelector('button[aria-label="Filtros"]');
    expect(botonFiltros.textContent).toBe('2');
  });

  it('abajo de la tabla (cerca del pulgar): el buscador ocupa el ancho y el botón Filtros va a la derecha (24/11)', () => {
    montar([potrero(1, '8.1', 10, 5), potrero(2, '10.2', 10, 5)], '/pecuaria/potreros?q=8&grupo=CN');
    const barra = contenedor.querySelector('[data-testid="barra-potreros"]');
    // La barra va después de la tabla.
    const tabla = contenedor.querySelector('[data-testid="caja-potreros"]');
    expect(tabla.compareDocumentPosition(barra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const buscador = barra.querySelector('input[aria-label="Buscar potrero o lote"]');
    expect(buscador.value).toBe('8');
    // El botón queda después del buscador (a la derecha).
    expect(barra.lastElementChild.querySelector('button[aria-label="Filtros"]')).not.toBeNull();
    // La búsqueda se ve: el número del botón cuenta solo los filtros del panel.
    expect(barra.querySelector('button[aria-label="Filtros"]').textContent).toBe('1');
    expect(primeraColumna()).toEqual(['8.1']);
    // La ✕ borra la búsqueda.
    act(() => barra.querySelector('button[aria-label="Borrar la búsqueda"]').click());
    expect(donde()).toBe('?grupo=CN');
  });

  it('filtro por uso de suelo (Sorgo, Raigrás…): con un grupo elegido, solo los usos de ese grupo', () => {
    const verdeo = (nombre) => ({ grupo: 'VERDEO', nombre });
    montar([
      potrero(1, '1', 10, 5),
      potrero(2, '2', 10, 5, { usoActual: verdeo('Sorgo') }),
      potrero(3, '3', 10, 5, { usoActual: verdeo('Raigrás') }),
      potrero(4, '4', 10, 5, { usoActual: verdeo('Sorgo') }),
    ]);
    const selectUso = () => [...contenedor.querySelectorAll('label')].find((l) => l.textContent.startsWith('Uso')).querySelector('select');
    expect([...selectUso().options].map((o) => o.textContent)).toEqual(['Todos', 'Campo natural', 'Raigrás', 'Sorgo']);
    act(() => {
      selectUso().value = 'Sorgo';
      selectUso().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(primeraColumna()).toEqual(['2', '4']);
    expect(donde()).toBe('?uso=Sorgo');
    // Elegir Verdeos deja el Sorgo; elegir CN lo saca (no es de ese grupo).
    const chip = (t) => [...contenedor.querySelectorAll('[role="group"] button')].find((b) => b.textContent === t);
    act(() => chip('Verdeos').click());
    expect(donde()).toBe('?uso=Sorgo&grupo=VERDEO');
    expect([...selectUso().options].map((o) => o.textContent)).toEqual(['Todos', 'Raigrás', 'Sorgo']);
    act(() => chip('CN').click());
    expect(donde()).toBe('?grupo=CN');
    expect(primeraColumna()).toEqual(['1']);
  });

  it('sin paginado: todos los potreros en la tabla (un ?pagina= viejo no cambia nada)', () => {
    const muchos = Array.from({ length: 60 }, (_, i) => potrero(i + 1, String(i + 1), 1, 1));
    montar(muchos, '/pecuaria/potreros?pagina=2');
    expect(primeraColumna()).toHaveLength(60);
    expect(contenedor.querySelector('nav[aria-label="Páginas"]')).toBeNull();
    // Al cambiar un filtro, el ?pagina= viejo se va de la dirección.
    act(() => [...contenedor.querySelectorAll('[role="group"] button')].find((b) => b.textContent === 'CN').click());
    expect(donde()).toBe('?grupo=CN');
  });
});
