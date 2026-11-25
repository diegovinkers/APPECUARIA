// @vitest-environment jsdom
// Cargar una etapa de un proceso: el diagnóstico (preñadas por mes y vacías,
// después quiénes se van y a dónde, y revisar) y decidir lo de las vacías.
// Reglas del campo (25/11): al separar, una de las partes cambia de potrero;
// las vacías de una IATF van a entore o a engorde, las de un entore a engorde.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getProceso: vi.fn(), getCategorias: vi.fn(), vistaPreviaEtapa: vi.fn(), registrarEtapa: vi.fn(), getToros: vi.fn(), getCausas: vi.fn() }));
vi.mock('../../api/pecuaria', () => api);
vi.mock('../../hooks/usePotreros', () => ({
  default: () => ({ potreros: [{ id: 8, nombre: 'P8' }, { id: 12, nombre: 'P12' }, { id: 13, nombre: 'P13' }], errors: [] }),
}));

const { default: ProcesoEtapaPage } = await import('./ProcesoEtapaPage.jsx');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOTE_V = { loteId: 1, nombre: 'Lote V', potrero: { id: 8, nombre: 'P8' }, categoria: 'Vaquillonas', categoriaId: 3, cabezas: 50, activo: true, sugeridas: { PRENADA: 4, VACIA: 5 } };
const ficha = (lotes, modalidad = 'TOROS') => ({
  proceso: { id: 7, nombre: 'Servicio 2026-27 · Vaquillonas', campoId: 1, estado: 'ABIERTO', campo: { id: 1, nombre: 'EJ' }, datos: { modalidad } },
  meses: ['2027-10', '2027-11', '2027-12'],
  etapas: [{ clave: 'DIAGNOSTICO', cargas: [] }],
  lotes,
});

function Donde() {
  const l = useLocation();
  return <p data-testid="donde">{l.pathname}</p>;
}

let contenedor;
let root;
beforeEach(() => {
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  api.getCategorias.mockResolvedValue({
    data: [
      { id: 3, nombre: 'Vaquillonas', activo: true },
      { id: 4, nombre: 'Vaquillonas preñadas', activo: true },
      { id: 5, nombre: 'Vaquillonas invernar', activo: true },
    ],
  });
  api.vistaPreviaEtapa.mockResolvedValue({ data: { oracion: 'Vas a anotar el diagnóstico de 50 cabezas', pasos: [{ texto: '18 → P12, lote Lote V · preñadas oct' }], avisos: [] } });
  api.registrarEtapa.mockResolvedValue({ data: { oracion: 'Anotaste el diagnóstico' } });
});
afterEach(() => {
  act(() => root.unmount());
  contenedor.remove();
  vi.clearAllMocks();
});

async function montar(etapa) {
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[`/pecuaria/procesos/7/etapa/${etapa}`]}>
        <Routes>
          <Route path="/pecuaria/procesos/:id/etapa/:etapa" element={<ProcesoEtapaPage />} />
          <Route path="*" element={<Donde />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}
const boton = (t) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
// Un botón de opción (título y detalle), por el título.
const opcion = (t) => [...contenedor.querySelectorAll('button')].find((b) => b.querySelector('span')?.textContent === t);
const click = async (el) => act(async () => el.click());
const escribir = async (el, valor) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const elegir = async (el, valor) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const input = (aria) => contenedor.querySelector(`input[aria-label="${aria}"]`);
const select = (aria) => contenedor.querySelector(`select[aria-label="${aria}"]`);

describe('el diagnóstico (reglas del campo)', () => {
  // Hasta el paso Destino, con lo cargado del lote V (50 en P8).
  async function hastaDestino({ modalidad = 'TOROS', oct = '', nov = '', sin = '', vacias = '' } = {}) {
    api.getProceso.mockResolvedValue({ data: ficha([{ ...LOTE_V, rol: 'VIENTRES' }], modalidad) });
    await montar('DIAGNOSTICO');
    await click(boton('Seguir'));
    if (oct) await escribir(input('Lote V: preñadas oct'), oct);
    if (nov) await escribir(input('Lote V: preñadas nov'), nov);
    if (sin) await escribir(input('Lote V: preñadas sin mes'), sin);
    if (vacias) await escribir(input('Lote V: vacías'), vacias);
    await click(boton('Seguir'));
  }
  const grupoQueSeVa = (t) => [...contenedor.querySelectorAll('[aria-label="Lote V: quiénes se van"] button')].find((b) => b.textContent === t);

  it('entore: se van las vacías (a engorde, con su categoría); las preñadas se quedan → revisar → confirmar', async () => {
    await hastaDestino({ sin: '40', vacias: '10' });
    // Pregunta quiénes se van; arranca en las vacías.
    expect(grupoQueSeVa('Las vacías').getAttribute('aria-pressed')).toBe('true');
    expect(contenedor.textContent).toContain('Van a engorde: las vacías de un entore no se vuelven a servir.');
    expect(contenedor.querySelector('[aria-label="Lote V: qué pasa con las vacías"]')).toBeNull();
    // Sin el potrero de las vacías no se sigue.
    expect(boton('Revisar').disabled).toBe(true);
    expect(contenedor.querySelector('[data-testid="falta"]').textContent).toBe('Elegí a qué potrero van las vacías');
    await elegir(select('Lote V · Vacías: a dónde'), '12');
    expect(select('Lote V · Vacías: categoría').value).toBe('5');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'DIAGNOSTICO', {
      fecha: expect.any(String),
      metodo: 'ECOGRAFIA',
      lineas: [{ loteId: 1, prenadas: { sin: 40 }, vacias: 10 }],
      decision: [
        {
          loteId: 1,
          grupos: [
            { clave: 'sin', destino: { potreroId: 8 } },
            { clave: 'vacias', destino: { invernada: true, potreroId: 12 }, categoriaId: 5 },
          ],
        },
      ],
    });
    await click(boton('Confirmar'));
    expect(api.registrarEtapa).toHaveBeenCalledTimes(1);
    expect(contenedor.querySelector('[data-testid="donde"]').textContent).toBe('/pecuaria/procesos/7');
  });

  it('IATF: las vacías a entore con toros o a engorde; se pueden ir las preñadas', async () => {
    await hastaDestino({ modalidad: 'IATF', sin: '40', vacias: '10' });
    expect(boton('Revisar').disabled).toBe(true);
    expect(contenedor.querySelector('[data-testid="falta"]').textContent).toMatch(/entore con toros o engorde/);
    await click(opcion('Entore con toros'));
    await click(grupoQueSeVa('Las preñadas'));
    expect(contenedor.textContent).toContain('Se quedan en P8.');
    await elegir(select('Lote V · Preñadas: a dónde'), '12');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'DIAGNOSTICO', expect.objectContaining({
      decision: [{ loteId: 1, grupos: [{ clave: 'sin', destino: { potreroId: 12 } }, { clave: 'vacias', destino: { reentore: true, potreroId: 8 } }] }],
    }));
  });

  it('las dos: a potreros distintos (al mismo, no se sigue)', async () => {
    await hastaDestino({ sin: '40', vacias: '10' });
    await click(grupoQueSeVa('Las dos'));
    await elegir(select('Lote V · Preñadas: a dónde'), '12');
    await elegir(select('Lote V · Vacías: a dónde'), '12');
    expect(contenedor.querySelector('[data-testid="falta"]').textContent).toBe('Las vacías y las preñadas no pueden quedar en el mismo potrero');
    expect(boton('Revisar').disabled).toBe(true);
  });

  it('preñadas de varios meses: "¿Las separás por mes?"; sí = cada mes a su potrero', async () => {
    await hastaDestino({ oct: '18', nov: '22', vacias: '10' });
    expect(contenedor.textContent).toContain('¿Las separás por mes?');
    await click(boton('Sí, un lote por mes'));
    await elegir(select('Lote V · Vacías: a dónde'), '12');
    // Los dos meses en P8 (se quedan): no, tienen que estar separados.
    expect(contenedor.querySelector('[data-testid="falta"]').textContent).toMatch(/no pueden quedar en el mismo potrero/);
    await elegir(select('Lote V · Preñadas nov: a dónde'), '13');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'DIAGNOSTICO', expect.objectContaining({
      decision: [
        {
          loteId: 1,
          grupos: [
            { clave: '2027-10', destino: { potreroId: 8 } },
            { clave: '2027-11', destino: { potreroId: 13 } },
            { clave: 'vacias', destino: { invernada: true, potreroId: 12 }, categoriaId: 5 },
          ],
        },
      ],
    }));
  });

  it('ecografía de una parte: las sin ecografiar se quedan; preñadas y vacías se van, cada una a su potrero', async () => {
    await hastaDestino({ sin: '30', vacias: '5' });
    expect(contenedor.querySelector('[data-testid="sin-ecografiar"]').textContent).toBe('Las 15 sin ecografiar se quedan en P8: las ecografiadas van a otros potreros.');
    expect(contenedor.querySelector('[aria-label="Lote V: quiénes se van"]')).toBeNull();
    await elegir(select('Lote V · Vacías: a dónde'), '12');
    expect(contenedor.querySelector('[data-testid="falta"]').textContent).toBe('Elegí a qué potrero van las preñadas');
    await elegir(select('Lote V · Preñadas: a dónde'), '13');
    expect(contenedor.querySelector('[data-testid="falta"]')).toBeNull();
    expect(boton('Revisar').disabled).toBe(false);
  });
});

describe('decidir lo de las vacías (lo cargado antes de las reglas del campo)', () => {
  const VACIAS = { ...LOTE_V, cabezas: 10, rol: 'VACIAS', destino: null };

  it('de una IATF: entore con toros (una vez) o engorde, con el potrero', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([VACIAS], 'IATF') });
    await montar('DECISION');
    expect(contenedor.textContent).toContain('Lote V');
    await click(boton('Seguir'));
    const opciones = [...select('Lote V · Vacías: qué se hace').options].map((o) => o.value);
    expect(opciones).toEqual(['', 'ENTORE', 'ENGORDE']);
    await elegir(select('Lote V · Vacías: qué se hace'), 'ENTORE');
    await elegir(select('Lote V · Vacías: a qué potrero'), '12');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'DECISION', {
      fecha: expect.any(String),
      lineas: [{ loteId: 1, destino: { reentore: true, potreroId: 12 } }],
    });
  });

  it('de un entore: solo engorde, con su categoría', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([VACIAS]) });
    await montar('DECISION');
    await click(boton('Seguir'));
    expect([...select('Lote V · Vacías: qué se hace').options].map((o) => o.value)).toEqual(['', 'ENGORDE']);
    await elegir(select('Lote V · Vacías: qué se hace'), 'ENGORDE');
    await elegir(select('Lote V · Vacías: categoría'), '5');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'DECISION', {
      fecha: expect.any(String),
      lineas: [{ loteId: 1, destino: { invernada: true }, categoriaId: 5 }],
    });
  });
});

describe('IATF por días', () => {
  const SIN = { ...LOTE_V, cabezas: 20, rol: 'SIN_SERVIR' };

  it('otro día de una parte: un grupo se va (las inseminadas o las sin inseminar), a otro potrero', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([SIN], 'IATF') });
    await montar('INSEMINACION');
    await click(boton('Seguir'));
    expect(contenedor.textContent).toContain('Lote V: en P8 hay 20 sin inseminar');
    expect(boton('Revisar').disabled).toBe(true);
    await escribir(input('¿Cuántas se inseminaron hoy? (Lote V)'), '15');
    // Sin el potrero no se sigue: no pueden quedar juntas.
    expect(boton('Revisar').disabled).toBe(true);
    expect(select('Lote V: a qué potrero').options[0].textContent).toBe('Elegí el potrero…');
    await click(opcion('Las 5 sin inseminar'));
    await elegir(select('Lote V: a qué potrero'), '12');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'INSEMINACION', { fecha: expect.any(String), lineas: [{ loteId: 1, cabezas: '15', sinInseminarA: 12 }] });
  });

  it('otro día con todas: se pueden quedar', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([SIN], 'IATF') });
    await montar('INSEMINACION');
    await click(boton('Seguir'));
    await escribir(input('¿Cuántas se inseminaron hoy? (Lote V)'), '20');
    expect(contenedor.querySelector('[aria-label="Lote V: qué grupo se va"]')).toBeNull();
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'INSEMINACION', { fecha: expect.any(String), lineas: [{ loteId: 1, cabezas: '20' }] });
  });

  it('terminar: salen del proceso o las dejo para otro día (no se anota); ya no hay repaso con toro', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([SIN], 'IATF') });
    await montar('FIN_INSEMINACION');
    await click(boton('Seguir'));
    const opciones = [...contenedor.querySelectorAll('[aria-label="Lote V: qué pasa con las sin inseminar"] button')].map((b) => b.querySelector('span').textContent);
    expect(opciones).toEqual(['Salen del proceso', 'Las dejo para otro día']);
    await click(opcion('Las dejo para otro día'));
    expect(contenedor.textContent).toContain('No hay nada para anotar');
    expect(boton('Revisar').disabled).toBe(true);
    await click(opcion('Salen del proceso'));
    await elegir(select('Lote V: a qué potrero'), '12');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'FIN_INSEMINACION', { fecha: expect.any(String), lineas: [{ loteId: 1, destino: 'SALEN', potreroId: 12 }] });
  });
});

describe('la parición', () => {
  it('por lote: madres, terneros (sin el sexo), nacidos muertos y madres muertas; la madre no cambia de categoría (fase 7)', async () => {
    api.getProceso.mockResolvedValue({
      data: ficha([{ ...LOTE_V, nombre: 'Lote P', cabezas: 18, rol: 'PRENADAS', sugeridas: { PARIDA: 3 } }]),
    });
    api.getCategorias.mockResolvedValue({ data: [{ id: 3, nombre: 'Vaquillonas preñadas' }, { id: 6, nombre: 'Vaquillonas paridas' }] });
    await montar('PARICION');
    await click(boton('Seguir'));
    await escribir(input('Lote P: madres que parieron'), '6');
    // 24/11: un solo número de terneros, sin machos ni hembras.
    expect(input('Lote P: terneras (hembras) vivas')).toBeNull();
    await escribir(input('Lote P: terneros vivos'), '5');
    await escribir(input('Lote P: nacidos muertos'), '1');
    // No se elige la categoría de las madres: sigue la del lote.
    expect(select('Lote P: las madres pasan a')).toBeNull();
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'PARICION', {
      fecha: expect.any(String),
      lineas: [{ loteId: 1, madres: '6', terneros: '5', muertos: '1' }],
    });
  });

  it('las paridas y sus crías pueden ir a otro potrero; las caravanas no se cargan acá (24/11)', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([{ ...LOTE_V, nombre: 'Lote P', cabezas: 18, rol: 'PRENADAS' }]) });
    await montar('PARICION');
    await click(boton('Seguir'));
    expect(select('Lote P: a qué potrero van las paridas').value).toBe('');
    await escribir(input('Lote P: madres que parieron'), '4');
    await escribir(input('Lote P: terneros vivos'), '4');
    await elegir(select('Lote P: a qué potrero van las paridas'), '12');
    expect(input('Lote P: caravanas')).toBeNull();
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'PARICION', {
      fecha: expect.any(String),
      lineas: [{ loteId: 1, madres: '4', terneros: '4', potreroId: 12 }],
    });
  });

  it('en un aborto las que abortaron van a engorde (arranca marcado), a otro potrero (R7)', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([{ ...LOTE_V, nombre: 'Lote P', cabezas: 18, rol: 'PRENADAS' }]) });
    await montar('ABORTO');
    await click(boton('Seguir'));
    await escribir(contenedor.querySelector('input[inputmode="numeric"]'), '2');
    expect(contenedor.querySelector('[data-testid="a-vacias"] input').checked).toBe(true);
    expect(contenedor.querySelector('[data-testid="a-vacias"]').textContent).toMatch(/engorde/);
    // Abortó una parte: no se pueden quedar con las preñadas.
    expect(boton('Revisar').disabled).toBe(true);
    await elegir(select('Lote P: a qué potrero van a engorde'), '12');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'ABORTO', { fecha: expect.any(String), aVacias: true, lineas: [{ loteId: 1, cabezas: '2', potreroId: 12 }] });
  });

  it('fin de la parición: las falladas a engorde; con paridas en el potrero, a otro', async () => {
    api.getProceso.mockResolvedValue({
      data: {
        ...ficha([
          { ...LOTE_V, nombre: 'Lote P', cabezas: 3, rol: 'PRENADAS' },
          { ...LOTE_V, loteId: 2, nombre: 'Lote P · paridas oct', cabezas: 15, rol: 'PARIDAS' },
        ]),
        etapas: [{ clave: 'FIN_PARICION', cargas: [] }],
      },
    });
    await montar('FIN_PARICION');
    await click(boton('Seguir'));
    expect(contenedor.textContent).toContain('van a engorde');
    expect(boton('Revisar').disabled).toBe(true);
    await elegir(select('Lote P: a qué potrero van a engorde'), '12');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'FIN_PARICION', { fecha: expect.any(String), lineas: [{ loteId: 1, potreroId: 12 }] });
  });

  it('la parición muestra vacas y terneros por potrero (R8)', async () => {
    api.getProceso.mockResolvedValue({
      data: { ...ficha([{ ...LOTE_V, nombre: 'Lote P', cabezas: 18, rol: 'PRENADAS' }]), porPotrero: [{ potreroId: 8, texto: 'P8: 40 vacas (25 paridas · 15 preñadas) · 24 terneros' }] },
    });
    await montar('PARICION');
    await click(boton('Seguir'));
    expect(contenedor.querySelector('[aria-label="Por potrero"]').textContent).toBe('P8: 40 vacas (25 paridas · 15 preñadas) · 24 terneros');
  });

  it('un aborto sin pasarlas a vacías', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([{ ...LOTE_V, nombre: 'Lote P', cabezas: 18, rol: 'PRENADAS' }]) });
    await montar('ABORTO');
    await click(boton('Seguir'));
    await escribir(contenedor.querySelector('input[inputmode="numeric"]'), '2');
    await click(contenedor.querySelector('[data-testid="a-vacias"] input'));
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'ABORTO', { fecha: expect.any(String), lineas: [{ loteId: 1, cabezas: '2' }] });
  });
});

describe('el destete', () => {
  it('cada lote de crías a un potrero, con la categoría al llegar y el peso; las vacas se quedan', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([{ ...LOTE_V, loteId: 9, nombre: 'Lote Q · terneros oct', cabezas: 10, rol: 'CRIAS' }]) });
    api.getCategorias.mockResolvedValue({ data: [{ id: 7, nombre: 'Terneros chicos' }, { id: 8, nombre: 'Terneros' }] });
    await montar('DESTETE');
    await click(boton('Seguir'));
    await elegir(select('Lote Q · terneros oct: a qué potrero'), '12');
    await elegir(select('Lote Q · terneros oct: categoría al llegar'), '8');
    await escribir(input('Lote Q · terneros oct: peso promedio'), '180');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'DESTETE', {
      fecha: expect.any(String),
      lineas: [{ loteId: 9, destinoPotreroId: 12, categoriaId: 8, pesoPromedioKg: '180' }],
    });
  });

  it('las vacas también tienen destino; terneros y vacas no van al mismo potrero (R9)', async () => {
    api.getProceso.mockResolvedValue({ data: ficha([{ ...LOTE_V, loteId: 9, nombre: 'Terneros/as oct-2027', cabezas: 10, rol: 'CRIAS' }]) });
    api.getCategorias.mockResolvedValue({ data: [{ id: 3, nombre: 'Vacas de cría' }] });
    await montar('DESTETE');
    await click(boton('Seguir'));
    await elegir(select('Terneros/as oct-2027: a qué potrero'), '12');
    await elegir(select('Terneros/as oct-2027: a qué potrero van las vacas'), '12');
    expect(contenedor.textContent).toContain('Los terneros y las vacas no pueden quedar en el mismo potrero');
    expect(boton('Revisar').disabled).toBe(true);
    await elegir(select('Terneros/as oct-2027: a qué potrero van las vacas'), '');
    await elegir(select('Terneros/as oct-2027: a qué potrero'), '12');
    expect(boton('Revisar').disabled).toBe(false);
    await elegir(select('Terneros/as oct-2027: categoría de las vacas'), '3');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'DESTETE', {
      fecha: expect.any(String),
      lineas: [{ loteId: 9, destinoPotreroId: 12, categoriaMadresId: 3 }],
    });
  });
});

describe('los toros (fase 6)', () => {
  const DENTRO = [
    { id: 1, toroId: 14, identificacion: 'T-014', potrero: { id: 8, nombre: 'P8' }, desde: '2026-08-01', hasta: null },
    { id: 2, toroId: 22, identificacion: 'T-022', potrero: { id: 8, nombre: 'P8' }, desde: '2026-08-01', hasta: null },
  ];
  const conToros = (extra = {}) => ({ ...ficha([{ ...LOTE_V, rol: 'VIENTRES' }]), etapas: [{ clave: 'FIN_SERVICIO', cargas: [] }], toros: DENTRO, ...extra });

  it('fin del entore: salen todos los toros (todos a un potrero) y van en salenToros', async () => {
    api.getProceso.mockResolvedValue({ data: conToros() });
    await montar('FIN_SERVICIO');
    await click(boton('Seguir'));
    const lista = contenedor.querySelector('fieldset[aria-label="Salen los toros"]');
    expect([...lista.querySelectorAll('input[type="checkbox"]')].every((c) => c.checked)).toBe(true);
    // Sin el potrero no se puede seguir.
    expect(boton('Revisar').disabled).toBe(true);
    await elegir(select('Salen los toros: todos al potrero'), '12');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'FIN_SERVICIO', expect.objectContaining({
      salenToros: [
        { toroId: 14, potreroId: 12 },
        { toroId: 22, potreroId: 12 },
      ],
    }));
  });

  it('la etapa Toros: sacar uno y traer otro de la estancia, cada uno a su potrero', async () => {
    api.getProceso.mockResolvedValue({ data: conToros() });
    api.getToros.mockResolvedValue({
      data: [
        { id: 30, identificacion: 'T-030', activo: true, lote: { potrero: { nombre: 'P3' } }, enProceso: null },
        { id: 14, identificacion: 'T-014', activo: true, lote: null, enProceso: { proceso: { id: 7, nombre: 'Este' } } },
      ],
    });
    api.vistaPreviaEtapa.mockResolvedValue({ data: { oracion: 'Vas a anotar los toros', pasos: [], avisos: [] } });
    await montar('TOROS');
    expect(api.getToros).toHaveBeenCalledWith(1);
    const sacar = contenedor.querySelector('fieldset[aria-label="Sacar del proceso"]');
    const traer = contenedor.querySelector('fieldset[aria-label="Traer (el mismo u otro)"]');
    // No arranca con nada elegido; los que están en un proceso no se ofrecen para traer.
    expect(boton('Revisar').disabled).toBe(true);
    expect([...traer.querySelectorAll('[data-toro]')].map((li) => li.getAttribute('data-toro'))).toEqual(['T-030']);
    await click(sacar.querySelector('[data-toro="T-022"] input'));
    await elegir(select('Potrero del toro T-022'), '12');
    await click(traer.querySelector('[data-toro="T-030"] input'));
    // Al traer, arranca en el potrero de las vacas.
    expect(select('Potrero del toro T-030').value).toBe('8');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'TOROS', expect.objectContaining({ salen: [{ toroId: 22, potreroId: 12 }], entran: [{ toroId: 30, potreroId: 8 }] }));
  });
});

describe('la baja (fase 8)', () => {
  it('se elige el lote (ninguno de entrada), cuántas murieron y la causa (solo las de Muerte)', async () => {
    api.getProceso.mockResolvedValue({
      data: ficha([
        { ...LOTE_V, nombre: 'Vacas', cabezas: 165, rol: 'PRENADAS' },
        { ...LOTE_V, loteId: 9, nombre: 'Terneros may-2026', cabezas: 21, rol: 'CRIAS' },
      ]),
    });
    api.getCausas.mockResolvedValue({
      data: [
        { id: 1, codigo: 'CA-001', nombre: 'Enfermedad', activo: true, tipos: [{ id: 3, clave: 'MUERTE' }] },
        { id: 2, codigo: 'VE-001', nombre: 'Venta', activo: true, tipos: [{ id: 4, clave: 'VENTA' }] },
      ],
    });
    api.vistaPreviaEtapa.mockResolvedValue({ data: { oracion: 'Vas a anotar la baja', pasos: [], avisos: [] } });
    await montar('BAJA');
    const casillas = [...contenedor.querySelectorAll('section[aria-label="A quién"] input[type="checkbox"]')];
    expect(casillas.map((c) => c.checked)).toEqual([false, false]);
    expect(boton('Seguir').disabled).toBe(true);
    await click(casillas[1]);
    await click(boton('Seguir'));
    expect([...select('Causa de la muerte').options].map((o) => o.textContent)).toEqual(['Elegí la causa…', 'CA-001 · Enfermedad']);
    expect(boton('Revisar').disabled).toBe(true);
    await escribir(input('Terneros may-2026: cuántas murieron'), '1');
    await elegir(select('Causa de la muerte'), '1');
    await click(boton('Revisar'));
    expect(api.vistaPreviaEtapa).toHaveBeenCalledWith('7', 'BAJA', { fecha: expect.any(String), lineas: [{ loteId: 9, cabezas: '1', causaId: 1 }] });
  });
});
