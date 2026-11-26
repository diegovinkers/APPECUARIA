// El tablero de Procesos (24/11): cada grupo de un proceso en su sección
// (Inseminación / Entore / Preñadas / Con cría al pie). La IATF es la primera
// oportunidad y el toro la segunda: lo que viene de una IATF y pasó al toro
// va en Entore, con otro color (deIatf).
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { alToroEnIatf, esReentore, gruposDelProceso } from '../src/pecuaria/procesos.tablero.js';
import { useTestDatabase } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

describe('gruposDelProceso (puro)', () => {
  const items = [
    { etapa: 'FIN_SERVICIO', fecha: '2025-10-30', real: '2025-11-01', estado: 'HECHA' },
    { etapa: 'DIAGNOSTICO', fecha: '2025-12-01', real: '2025-12-01', estado: 'HECHA' },
    { etapa: 'PARICION', fecha: '2026-05-10', hasta: '2026-08-08', real: null, estado: 'PENDIENTE' },
    { etapa: 'DESTETE', fecha: '2026-11-10', real: null, estado: 'PENDIENTE' },
  ];
  const l = (loteId, rol, cabezas, potrero, destino = null) => ({ loteId, rol, cabezas, potrero, destino });
  const resumen = (grupos) => grupos.map((g) => [g.seccion, g.tipo, g.cabezas, g.deIatf]);

  it('un entore: los vientres y sus vacías en Entore; preñadas y paridas con sus terneros', () => {
    const grupos = gruposDelProceso({
      modalidad: 'TOROS',
      fechaInicio: '2025-08-01',
      items,
      lotes: [l(1, 'VIENTRES', 10, 'P1'), l(2, 'PRENADAS', 125, 'P1'), l(3, 'VACIAS', 35, 'P8', 'REENTORE'), l(4, 'VACIAS', 5, 'P2'), l(5, 'PARIDAS', 40, 'P1'), l(6, 'CRIAS', 21, 'P1'), l(7, 'CRIAS', 19, 'P1'), l(8, 'LIBRES', 3, 'P9')],
    });
    expect(resumen(grupos)).toEqual([
      ['entore', 'VIENTRES', 10, false],
      ['entore', 'VACIAS_REENTORE', 35, false],
      ['entore', 'VACIAS_A_DECIDIR', 5, false],
      ['prenadas', 'PRENADAS', 125, false],
      ['cria', 'PARIDAS', 40, false],
    ]);
    // La barra corre desde la ecografía hasta la parición.
    expect(grupos.find((g) => g.tipo === 'PRENADAS')).toMatchObject({ desde: '2025-12-01', proxima: { etapa: 'PARICION', fecha: '2026-05-10' }, potreros: ['P1'] });
    expect(grupos.find((g) => g.tipo === 'PARIDAS')).toMatchObject({ terneros: 40, proxima: { etapa: 'DESTETE' } });
  });

  it('el diagnóstico a medias va en los grupos en servicio (las sin ecografiar), no en los demás', () => {
    const grupos = gruposDelProceso({
      modalidad: 'IATF',
      fechaInicio: '2025-08-01',
      items,
      aMedias: 'Diagnóstico a medias: faltan 23',
      lotes: [l(1, 'VIENTRES', 23, 'P9'), l(2, 'PRENADAS', 60, 'P8')],
    });
    expect(grupos.find((g) => g.tipo === 'VIENTRES').aMedias).toBe('Diagnóstico a medias: faltan 23');
    expect(grupos.find((g) => g.tipo === 'PRENADAS').aMedias).toBeUndefined();
  });

  it('una IATF: los vientres en Inseminación; lo que pasa al toro y las vacías para volver a servir, en Entore con el color', () => {
    const lotes = [l(1, 'VIENTRES', 150, 'P1'), l(2, 'VIENTRES', 50, 'P1'), l(3, 'SIN_SERVIR', 7, 'P1'), l(4, 'VACIAS', 30, 'P8', 'REENTORE'), l(5, 'VACIAS', 4, 'P8')];
    const grupos = gruposDelProceso({ modalidad: 'IATF', alToro: { repasoTodo: false, loteIds: new Set([2]) }, fechaInicio: '2025-08-01', lotes });
    expect(resumen(grupos)).toEqual([
      ['iatf', 'VIENTRES', 157, false],
      ['entore', 'VIENTRES', 50, true],
      ['entore', 'VACIAS_REENTORE', 30, true],
      // Sin decidir: quedan en la sección de su proceso.
      ['iatf', 'VACIAS_A_DECIDIR', 4, false],
    ]);
    // Con un repaso de toros, todos los vientres ya están con el toro (las sin inseminar, no).
    const conRepaso = gruposDelProceso({ modalidad: 'IA', alToro: { repasoTodo: true, loteIds: new Set() }, fechaInicio: '2025-08-01', lotes: lotes.slice(0, 3) });
    expect(resumen(conRepaso)).toEqual([
      ['iatf', 'VIENTRES', 7, false],
      ['entore', 'VIENTRES', 200, true],
    ]);
  });

  it('un entore con las vacías de una IATF: en Entore con el color; los lotes en 0 no cuentan', () => {
    const grupos = gruposDelProceso({ modalidad: 'TOROS', deIatf: true, fechaInicio: '2025-12-10', lotes: [l(1, 'VIENTRES', 35, 'P8'), l(2, 'SIN_SERVIR', 0, 'P8')] });
    expect(grupos).toEqual([expect.objectContaining({ seccion: 'entore', tipo: 'VIENTRES', cabezas: 35, loteIds: [1], deIatf: true, proxima: null })]);
  });

  it('alToroEnIatf: los lotes que fueron al repaso con toro y si hubo repaso (sin las anuladas)', () => {
    const r = alToroEnIatf([
      { etapa: 'FIN_INSEMINACION', loteId: 3, datos: { destino: 'REPASO' } },
      { etapa: 'FIN_INSEMINACION', loteId: 4, datos: { destino: 'SALEN' } },
      { etapa: 'REPASO', loteId: null, datos: {}, anulado: true },
    ]);
    expect([...r.loteIds]).toEqual([3]);
    expect(r.repasoTodo).toBe(false);
  });

  it('esReentore: la marca, o se deduce (viene de otro y no es el entore de unas paridas)', () => {
    expect(esReentore({ datos: { reentore: true } })).toBe(true);
    expect(esReentore({ procesoAnteriorId: 4, datos: {} })).toBe(true);
    expect(esReentore({ procesoAnteriorId: 4, datos: { conCria: [{ procesoId: 4, mes: '2026-05' }] } })).toBe(false);
    expect(esReentore({ procesoAnteriorId: null, datos: {} })).toBe(false);
  });
});

describe('el tablero en la lista de procesos, paso a paso', () => {
  async function preparar() {
    const base = await prepararCampo();
    if (!base.cat['Vacas de cría']) base.cat['Vacas de cría'] = (await prisma.categoria.create({ data: { nombre: 'Vacas de cría', sexo: 'HEMBRA' } })).id;
    const p1 = await base.potrero('P1', { hectareas: 120, usoNombre: 'Campo natural', fecha: '2025-07-01', lotes: [['Vacas', 'Vacas de cría', 200, 430]] });
    const p8 = await base.potrero('P8', { hectareas: 60, usoNombre: 'Campo natural', fecha: '2025-07-01' });
    const p9 = await base.potrero('P9', { hectareas: 50, usoNombre: 'Campo natural', fecha: '2025-07-01' });
    const { agent, campo } = base;
    const etapa = (id, clave, body) => agent.post(`${API}/procesos/${id}/etapas/${clave}`).send(body).expect(201);
    const crear = async (body) => (await agent.post(`${API}/procesos`).send(body).expect(201)).body.proceso;
    // El lote de un proceso en ese estado.
    const loteId = async (procesoId, rol, nombre) =>
      (await prisma.procesoLote.findFirst({ where: { procesoId, rol, hasta: null, lote: { activo: true, ...(nombre && { nombre: { startsWith: nombre } }) } } })).loteId;
    // Lo que muestra el tablero: "sección tipo proceso: cabezas" (* = viene de IATF, va con otro color).
    const tablero = async () =>
      (await agent.get(`${API}/campos/${campo.id}/procesos`).expect(200)).body
        .flatMap((p) => p.grupos.map((g) => `${g.seccion} ${g.tipo} ${p.nombre}: ${g.cabezas}${g.terneros ? ` +${g.terneros}` : ''}${g.deIatf ? ' *' : ''}`))
        .sort();
    return { p1, p8, p9, etapa, crear, loteId, tablero };
  }

  it('entore: Entore → ecografía → preñadas y vacías → parición → destete', async () => {
    const { p1, p9, etapa, crear, loteId, tablero } = await preparar();
    const entore = await crear({ fecha: '2025-08-01', modalidad: 'TOROS', nombre: 'Entore', lineas: [{ loteId: p1.lote.Vacas.id }] });
    expect(await tablero()).toEqual(['entore VIENTRES Entore: 200']);

    await etapa(entore.id, 'FIN_SERVICIO', { fecha: '2025-11-01' });
    // La ecografía reparte: 165 a Preñadas; las vacías (de un entore) van a
    // engorde en el momento y salen del proceso (reglas del campo).
    await etapa(entore.id, 'DIAGNOSTICO', {
      fecha: '2025-12-01',
      lineas: [{ loteId: p1.lote.Vacas.id, prenadas: { sin: 165 }, vacias: 35 }],
      decision: [{ loteId: p1.lote.Vacas.id, grupos: [{ clave: 'vacias', destino: { invernada: true, potreroId: p9.potrero.id } }] }],
    });
    expect(await tablero()).toEqual(['prenadas PRENADAS Entore: 165']);

    await etapa(entore.id, 'PARICION', { fecha: '2026-05-10', lineas: [{ loteId: await loteId(entore.id, 'PRENADAS'), madres: 40, terneros: 40 }] });
    expect(await tablero()).toEqual(['cria PARIDAS Entore: 40 +40', 'prenadas PRENADAS Entore: 125']);

    await etapa(entore.id, 'DESTETE', { fecha: '2026-11-10', lineas: [{ loteId: await loteId(entore.id, 'CRIAS', 'Terneros'), destinoPotreroId: p9.potrero.id }] });
    expect(await tablero()).toEqual(['prenadas PRENADAS Entore: 125']);
  });

  it('IATF: Inseminación → las vacías a un entore, en Entore con el color', async () => {
    const { p1, p8, p9, etapa, crear, loteId, tablero } = await preparar();
    // Las 150 inseminadas van a P8 (no se quedan con las sin inseminar).
    const iatf = await crear({ fecha: '2025-08-01', modalidad: 'IATF', nombre: 'IATF', lineas: [{ loteId: p1.lote.Vacas.id, cabezas: 150, potreroId: p8.potrero.id }] });
    expect(await tablero()).toEqual(['iatf VIENTRES IATF: 200']);

    // Las 50 sin inseminar salen del proceso (ya no hay repaso con toro).
    await etapa(iatf.id, 'FIN_INSEMINACION', { fecha: '2025-08-02', lineas: [{ loteId: await loteId(iatf.id, 'SIN_SERVIR'), destino: 'SALEN' }] });
    expect(await tablero()).toEqual(['iatf VIENTRES IATF: 150']);

    // Ecografía de las inseminadas: 100 preñadas se quedan; las 50 vacías, a
    // P9 para el entore: a Entore con el color.
    const inseminadas = await loteId(iatf.id, 'VIENTRES', 'Vacas · IATF');
    await etapa(iatf.id, 'DIAGNOSTICO', {
      fecha: '2025-09-01',
      lineas: [{ loteId: inseminadas, prenadas: { sin: 100 }, vacias: 50 }],
      decision: [{ loteId: inseminadas, grupos: [{ clave: 'vacias', destino: { reentore: true, potreroId: p9.potrero.id } }] }],
    });
    expect(await tablero()).toEqual(['entore VACIAS_REENTORE IATF: 50 *', 'prenadas PRENADAS IATF: 100']);

    // Al empezar su entore, siguen ahí.
    const vacias = await loteId(iatf.id, 'VACIAS');
    const entore = await crear({ fecha: '2025-09-10', modalidad: 'TOROS', nombre: 'Entore de las vacías', lineas: [{ loteId: vacias }] });
    expect((await prisma.proceso.findUnique({ where: { id: entore.id } })).datos).toMatchObject({ reentore: true });
    expect(await tablero()).toEqual(['entore VIENTRES Entore de las vacías: 50 *', 'prenadas PRENADAS IATF: 100']);
  });
});
