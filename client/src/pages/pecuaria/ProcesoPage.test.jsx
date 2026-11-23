// @vitest-environment jsdom
// La ficha de un proceso (fase 5, docs/PECUARIA.md §9): la tarjeta "Próximo
// evento" con Registrar y descartar, el cronograma (estimada y real), el
// stock por estado, el embudo, lo que se cargó (con Anular) y el menú ⋯
// "Más opciones" (renombrar, cerrar, anular, sumar sueltos).
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getProceso: vi.fn(),
  editarProceso: vi.fn(),
  anularCargaProceso: vi.fn(),
  cerrarProceso: vi.fn(),
  anularProceso: vi.fn(),
  getSueltos: vi.fn(),
  asociarSueltos: vi.fn(),
  descartarSugerencia: vi.fn(),
}));
const permisos = vi.hoisted(() => ({ lista: ['pecuaria:VER', 'pecuaria:CREAR'] }));
vi.mock('../../api/pecuaria', () => api);
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { esSuperadmin: false, permisos: permisos.lista } }) }));

const { default: ProcesoPage } = await import('./ProcesoPage.jsx');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const etapa = (clave, nombre, estado, extra = {}) => ({ clave, nombre, linea: true, unica: true, estado, fecha: null, cargas: [], ...extra });
const FIN = {
  clave: 'FIN_SERVICIO',
  etapa: 'FIN_SERVICIO',
  nombre: 'Fin del entore',
  fecha: '2027-03-01',
  real: null,
  estado: 'PROXIMA',
  dias: 5,
  texto: 'faltan 5 días (01/03/2027)',
  titulo: 'Fin del entore: faltan 5 días (01/03/2027)',
  atrasada: false,
};
const FICHA = {
  proceso: { id: 7, nombre: 'Entore 2026-27 · Vacas', estado: 'ABIERTO', campania: '2026-27', fechaInicio: '2026-12-01', datos: { modalidad: 'TOROS' }, campo: { id: 1, sigla: 'EJ', nombre: 'Estancia Ejemplo' } },
  etapa: 'SERVICIO',
  textoEtapa: 'En servicio',
  proxima: FIN,
  cronograma: [
    { clave: 'INICIO', etapa: 'INICIO', nombre: 'Inicio del entore', fecha: '2026-12-01', real: '2026-12-01', estado: 'HECHA', texto: 'hecha el 01/12/2026' },
    { ...FIN },
    { clave: 'DIAGNOSTICO', etapa: 'DIAGNOSTICO', nombre: 'Ecografía', fecha: '2027-03-31', real: null, estado: 'DESCARTADA', texto: 'descartada' },
    { clave: 'PARICION', etapa: 'PARICION', nombre: 'Parición', fecha: '2027-09-10', hasta: '2027-12-09', real: null, estado: 'PENDIENTE', texto: 'faltan 286 días' },
  ],
  estados: { VIENTRES: 'Servida', PRENADAS: 'Preñada', LIBRES: 'Fuera del proceso' },
  embudo: { servidas: 200, prenadas: 165, paridas: null, destetados: null, porcentajes: { prenez: 83, paricion: null, destete: null }, corto: '200 → 165 → — → —' },
  lotes: [
    { loteId: 1, nombre: 'Vacas', potrero: { id: 8, nombre: 'P8' }, categoria: 'Vacas de cría', cabezas: 200, rol: 'VIENTRES', activo: true },
    { loteId: 2, nombre: 'Vacas · P3', potrero: { id: 3, nombre: 'P3' }, categoria: 'Vacas de cría', cabezas: 0, rol: 'VIENTRES', activo: false },
  ],
  etapas: [
    etapa('INICIO', 'Inicio del servicio', 'HECHA', {
      fecha: '2026-12-01',
      cargas: [{ grupoId: 'g1', fecha: '2026-12-01', inicial: false, anulada: false, puedeAnular: true, lineas: [{ registroId: 1, lote: 'Vacas', cabezas: 200, texto: 'Entore con toros · 200 cab.' }] }],
    }),
    etapa('FIN_SERVICIO', 'Fin del servicio', 'PENDIENTE'),
    etapa('DIAGNOSTICO', 'Diagnóstico', 'HECHA', {
      fecha: '2027-03-31',
      cargas: [{ grupoId: 'g2', fecha: '2027-03-31', inicial: true, anulada: false, puedeAnular: true, lineas: [{ registroId: 2, lote: null, cabezas: 200, texto: '165 preñadas · 35 vacías' }] }],
    }),
  ],
  pendientes: [],
};

let contenedor;
let root;
beforeEach(() => {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  api.getProceso.mockResolvedValue({ data: FICHA });
  permisos.lista = ['pecuaria:VER', 'pecuaria:CREAR'];
});
afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function montar(datos) {
  if (datos) api.getProceso.mockResolvedValue({ data: datos });
  act(() =>
    root.render(
      <MemoryRouter initialEntries={['/pecuaria/procesos/7']}>
        <Routes>
          <Route path="/pecuaria/procesos/:id" element={<ProcesoPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}
const tarjeta = () => contenedor.querySelector('section[aria-label="Próximo evento"]');
const enCronograma = (clave) => contenedor.querySelector(`[aria-label="Cronograma"] [data-clave="${clave}"]`);
const cargada = (clave) => contenedor.querySelector(`[data-etapa="${clave}"]`);
const boton = (texto, dentro = contenedor) => [...dentro.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);
const abrirMenu = () => act(() => contenedor.querySelector('button[aria-label="Más opciones"]').click());

describe('la tarjeta "Próximo evento"', () => {
  it('lo que sigue, del color de su estado, con Registrar a la pantalla de la etapa', async () => {
    await montar();
    expect(tarjeta().getAttribute('data-estado')).toBe('PROXIMA');
    expect(tarjeta().textContent).toContain('Fin del entore');
    expect(tarjeta().textContent).toContain('faltan 5 días (01/03/2027)');
    expect(tarjeta().textContent).toContain('Se acerca');
    expect(tarjeta().querySelector('[data-testid="registrar"]').getAttribute('href')).toBe('/pecuaria/procesos/7/etapa/FIN_SERVICIO');
  });

  it('descartar desde la tarjeta: manda la clave y muestra la ficha que vuelve', async () => {
    api.descartarSugerencia.mockResolvedValue({ data: { ...FICHA, proxima: FICHA.cronograma[3] } });
    await montar();
    await act(async () => boton('No va a pasar: descartar', tarjeta()).click());
    expect(api.descartarSugerencia).toHaveBeenCalledWith(7, 'FIN_SERVICIO', true);
    expect(tarjeta().textContent).toContain('Parición');
    expect(contenedor.textContent).toContain('Listo: fin del entore quedó descartada.');
  });

  it('atrasada: en rojo', async () => {
    await montar({ ...FICHA, proxima: { ...FIN, estado: 'ATRASADA', atrasada: true, texto: 'atrasada 3 días (01/03/2027)' } });
    expect(tarjeta().getAttribute('data-estado')).toBe('ATRASADA');
    expect(tarjeta().className).toContain('border-red-500');
    expect(tarjeta().textContent).toContain('Atrasada');
  });

  it('IATF con sin inseminar: otro día, o terminar la inseminación', async () => {
    await montar({ ...FICHA, proxima: { clave: 'INSEMINACION', etapa: 'INSEMINACION', nombre: 'Inseminación', estado: 'HOY', texto: 'es hoy · quedan vacas sin inseminar' } });
    expect(tarjeta().querySelector('[data-testid="registrar"]').getAttribute('href')).toBe('/pecuaria/procesos/7/etapa/INSEMINACION');
    const terminar = tarjeta().querySelector('[data-testid="terminar-inseminacion"]');
    expect(terminar.textContent).toBe('Terminar la inseminación');
    expect(terminar.getAttribute('href')).toBe('/pecuaria/procesos/7/etapa/FIN_INSEMINACION');
  });

  it('el nuevo entore lleva a "+ Nuevo proceso" enganchado a este', async () => {
    await montar({ ...FICHA, proxima: { clave: 'NUEVO_ENTORE:2027-09', etapa: 'NUEVO_ENTORE', nombre: 'Nuevo entore (paridas de sep)', estado: 'PROXIMA', texto: 'faltan 3 días' } });
    expect(tarjeta().querySelector('[data-testid="registrar"]').getAttribute('href')).toBe('/pecuaria/procesos/nuevo?desde=7');
  });

  it('quien solo mira no ve Registrar; un proceso cerrado no tiene tarjeta', async () => {
    permisos.lista = ['pecuaria:VER'];
    await montar();
    expect(tarjeta().querySelector('[data-testid="registrar"]')).toBeNull();
    act(() => root.unmount());
    root = createRoot(contenedor);
    await montar({ ...FICHA, proceso: { ...FICHA.proceso, estado: 'CERRADO' }, proxima: null });
    expect(tarjeta()).toBeNull();
  });
});

describe('cronograma, stock y lo que se cargó', () => {
  it('el cronograma: estimada y real, la ventana de la parición, y lo descartado se puede volver a tener en cuenta', async () => {
    api.descartarSugerencia.mockResolvedValue({ data: FICHA });
    await montar();
    expect(enCronograma('INICIO').getAttribute('data-estado')).toBe('HECHA');
    expect(enCronograma('INICIO').textContent).toContain('Real: 01/12/2026');
    expect(enCronograma('FIN_SERVICIO').textContent).toContain('Estimada: 01/03/2027');
    expect(enCronograma('PARICION').textContent).toContain('Estimada: 10/09/2027 al 09/12/2027');
    await act(async () => boton('Volver a tenerla en cuenta', enCronograma('DIAGNOSTICO')).click());
    expect(api.descartarSugerencia).toHaveBeenCalledWith(7, 'DIAGNOSTICO', false);
  });

  it('el stock del proceso, por estado con los nombres de Configuración', async () => {
    await montar();
    const stock = contenedor.querySelector('[aria-label="Stock del proceso"]');
    expect(stock.querySelector('[data-rol="VIENTRES"]').textContent).toContain('Servida');
    expect(stock.querySelector('[data-rol="VIENTRES"]').textContent).toContain('200 cab');
    // El que salió va aparte, como "Fuera del proceso".
    expect(stock.querySelector('[data-rol="LIBRES"]').textContent).toContain('Vacas · P3');
    expect(contenedor.textContent).toContain('200 cab hoy');
  });

  it('el embudo con sus porcentajes', async () => {
    await montar();
    const embudo = contenedor.querySelector('[aria-label="Embudo"]');
    expect(embudo.textContent).toContain('Servidas');
    expect(embudo.textContent).toContain('83 %');
  });

  it('lo que se cargó: solo las etapas con cargas, con el dato inicial marcado', async () => {
    await montar();
    expect(cargada('INICIO').textContent).toContain('Entore con toros · 200 cab.');
    expect(cargada('DIAGNOSTICO').textContent).toContain('dato inicial');
    expect(cargada('FIN_SERVICIO')).toBeNull();
  });

  it('anular una carga, solo con el permiso de anular', async () => {
    await montar();
    expect(boton('Anular')).toBeUndefined();
    act(() => root.unmount());
    root = createRoot(contenedor);
    permisos.lista = ['pecuaria:VER', 'pecuaria:CREAR', 'pecuaria:ANULAR'];
    api.anularCargaProceso.mockResolvedValue({ data: {} });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await montar();
    await act(async () => boton('Anular', cargada('INICIO')).click());
    expect(api.anularCargaProceso).toHaveBeenCalledWith(7, 'g1');
  });
});

describe('el menú "Más opciones"', () => {
  it('renombrar', async () => {
    api.editarProceso.mockResolvedValue({ data: { id: 7, nombre: 'Vacas EJ' } });
    await montar();
    abrirMenu();
    act(() => boton('Renombrar').click());
    const input = contenedor.querySelector('input[aria-label="Nombre del proceso"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    act(() => {
      setter.call(input, 'Vacas EJ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.form.requestSubmit());
    expect(api.editarProceso).toHaveBeenCalledWith(7, { nombre: 'Vacas EJ' });
  });

  it('cerrar el proceso (con nota); anularlo solo con el permiso de anular', async () => {
    api.cerrarProceso.mockResolvedValue({ data: {} });
    vi.spyOn(window, 'prompt').mockReturnValue('Se vendió todo');
    await montar();
    abrirMenu();
    expect(contenedor.querySelector('[role="menu"]').textContent).toContain('Más opciones');
    expect(boton('Anular el proceso')).toBeUndefined();
    await act(async () => boton('Cerrar el proceso').click());
    expect(api.cerrarProceso).toHaveBeenCalledWith(7, { nota: 'Se vendió todo' });
  });

  it('sumar eventos sueltos: la lista con la etapa que toman, y "Sumar"', async () => {
    api.getSueltos.mockResolvedValue({ data: [{ id: 31, fecha: '2026-11-14', tipo: { clave: 'ECOGRAFIA', nombre: 'Ecografía' }, lote: { id: 1, nombre: 'Vacas' }, cabezas: 50, texto: '40 preñadas · 10 vacías', etapa: 'DIAGNOSTICO' }] });
    api.asociarSueltos.mockResolvedValue({ data: {} });
    await montar();
    abrirMenu();
    await act(async () => boton('Sumar eventos sueltos').click());
    const caja = contenedor.querySelector('[aria-label="Eventos sueltos"]');
    expect(caja.textContent).toContain('como diagnóstico');
    act(() => caja.querySelector('input[type="checkbox"]').click());
    await act(async () => boton('Sumar al proceso', caja).click());
    expect(api.asociarSueltos).toHaveBeenCalledWith(7, [31]);
  });
});

describe('toros y tandas en la ficha (fase 6)', () => {
  const TOROS = [
    { id: 1, toroId: 14, identificacion: 'T-014', raza: 'Angus', potrero: { id: 8, nombre: 'P8' }, desde: '2026-12-01', hasta: null },
    { id: 2, toroId: 22, identificacion: 'T-022', raza: 'Angus', potrero: { id: 8, nombre: 'P8' }, desde: '2026-12-01', hasta: '2027-03-01' },
  ];

  it('los toros: los que están (dónde y desde cuándo) y los que salieron', async () => {
    await montar({ ...FICHA, toros: TOROS });
    const lista = contenedor.querySelector('[aria-label="Toros del proceso"]');
    expect(lista.querySelector('[data-toro="T-014"]').textContent).toContain('en P8 desde 01/12/2026');
    expect(lista.querySelector('[data-toro="T-022"]').textContent).toContain('salió el 01/03/2027');
    expect(contenedor.textContent).toContain('1 en el proceso');
  });

  it('"Más opciones": sumar otra tanda y los toros', async () => {
    await montar();
    abrirMenu();
    const enlaces = Object.fromEntries([...contenedor.querySelectorAll('[role="menu"] a')].map((a) => [a.textContent, a.getAttribute('href')]));
    expect(enlaces['Sumar otra tanda']).toBe('/pecuaria/procesos/7/tanda');
    expect(enlaces['Toros: sacar o traer']).toBe('/pecuaria/procesos/7/etapa/TOROS');
  });
});

describe('bajas y procesos enganchados (fase 8)', () => {
  it('"Registrar una baja (muerte)" y los abortos van primero en Más opciones', async () => {
    await montar();
    abrirMenu();
    const enlaces = [...contenedor.querySelectorAll('[role="menu"] a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(enlaces.slice(0, 2)).toEqual([
      ['Registrar una baja (muerte)', '/pecuaria/procesos/7/etapa/BAJA'],
      ['Registrar abortos', '/pecuaria/procesos/7/etapa/ABORTO'],
    ]);
  });

  it('las bajas salen debajo del embudo, solo si hubo', async () => {
    await montar();
    expect(contenedor.querySelector('[data-testid="bajas"]')).toBeNull();
    act(() => root.unmount());
    root = createRoot(contenedor);
    await montar({ ...FICHA, embudo: { ...FICHA.embudo, muertesMadres: 2, muertesCrias: 1 } });
    expect(contenedor.querySelector('[data-testid="bajas"]').textContent).toBe('Bajas: 2 vacas muertas · 1 cría muerta');
  });

  it('de dónde viene y qué procesos siguen, con su enlace', async () => {
    await montar({
      ...FICHA,
      anterior: { id: 3, nombre: 'Entore 2025-26 EJ', estado: 'CERRADO' },
      siguientes: [{ id: 9, nombre: 'Inseminación vacías EJ', estado: 'ABIERTO', fechaInicio: '2027-04-10' }],
    });
    const caja = contenedor.querySelector('section[aria-label="Procesos enganchados"]');
    expect(caja.textContent).toContain('Viene de Entore 2025-26 EJ');
    expect([...caja.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/pecuaria/procesos/3', '/pecuaria/procesos/9']);
    expect(caja.textContent).toContain('desde el 10/04/2027');
  });

  it('las vacías para volver a servir: "Empezar con ellas" lleva a Nuevo proceso con este de origen', async () => {
    await montar({ ...FICHA, paraEnganchar: [{ loteId: 5, lote: 'Vacas · vacías', cabezas: 35 }] });
    const aviso = contenedor.querySelector('[data-testid="para-enganchar"]');
    expect(aviso.textContent).toContain('35 vacías para volver a servir (Vacas · vacías)');
    expect(aviso.querySelector('a').getAttribute('href')).toBe('/pecuaria/procesos/nuevo?desde=7');
  });
});
