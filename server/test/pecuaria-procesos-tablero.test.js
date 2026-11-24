// El tablero de Procesos (24/11): cada grupo de un proceso en su sección
// (En servicio / Reentore / Preñadas / Con cría al pie). La ecografía reparte
// en el momento: las preñadas a Preñadas, las vacías a Reentore.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { esReentore, gruposDelProceso } from '../src/pecuaria/procesos.tablero.js';
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

  it('reparte por estado: servidas, vacías (para reentore o sin decidir), preñadas y paridas con sus terneros', () => {
    const grupos = gruposDelProceso({
      fechaInicio: '2025-08-01',
      items,
      lotes: [l(1, 'VIENTRES', 10, 'P1'), l(2, 'PRENADAS', 125, 'P1'), l(3, 'VACIAS', 35, 'P8', 'REENTORE'), l(4, 'VACIAS', 5, 'P2'), l(5, 'PARIDAS', 40, 'P1'), l(6, 'CRIAS', 21, 'P1'), l(7, 'CRIAS', 19, 'P1'), l(8, 'LIBRES', 3, 'P9')],
    });
    expect(grupos.map((g) => [g.seccion, g.tipo, g.cabezas])).toEqual([
      ['servicio', 'VIENTRES', 10],
      ['reentore', 'VACIAS_REENTORE', 35],
      ['reentore', 'VACIAS_A_DECIDIR', 5],
      ['prenadas', 'PRENADAS', 125],
      ['cria', 'PARIDAS', 40],
    ]);
    const prenadas = grupos.find((g) => g.tipo === 'PRENADAS');
    // La barra corre desde la ecografía hasta la parición.
    expect(prenadas).toMatchObject({ desde: '2025-12-01', proxima: { etapa: 'PARICION', fecha: '2026-05-10' }, potreros: ['P1'] });
    expect(grupos.find((g) => g.tipo === 'PARIDAS')).toMatchObject({ terneros: 40, proxima: { etapa: 'DESTETE' } });
  });

  it('los vientres de un reentore van a Reentore; los lotes en 0 no cuentan', () => {
    const grupos = gruposDelProceso({ reentore: true, fechaInicio: '2025-12-10', lotes: [l(1, 'VIENTRES', 35, 'P8'), l(2, 'SIN_SERVIR', 0, 'P8')] });
    expect(grupos).toEqual([expect.objectContaining({ seccion: 'reentore', tipo: 'VIENTRES', cabezas: 35, loteIds: [1], proxima: null })]);
  });

  it('esReentore: la marca, o se deduce (viene de otro y no es el entore de unas paridas)', () => {
    expect(esReentore({ datos: { reentore: true } })).toBe(true);
    expect(esReentore({ procesoAnteriorId: 4, datos: {} })).toBe(true);
    expect(esReentore({ procesoAnteriorId: 4, datos: { conCria: [{ procesoId: 4, mes: '2026-05' }] } })).toBe(false);
    expect(esReentore({ procesoAnteriorId: null, datos: {} })).toBe(false);
  });
});

describe('el tablero en la lista de procesos, paso a paso', () => {
  it('entore → ecografía → vacías a reentore → inseminación de las vacías → parición → destete', async () => {
    const base = await prepararCampo();
    const { agent, campo } = base;
    if (!base.cat['Vacas de cría']) base.cat['Vacas de cría'] = (await prisma.categoria.create({ data: { nombre: 'Vacas de cría', sexo: 'HEMBRA' } })).id;
    const p1 = await base.potrero('P1', { hectareas: 120, usoNombre: 'Campo natural', fecha: '2025-07-01', lotes: [['Vacas', 'Vacas de cría', 200, 430]] });
    const p8 = await base.potrero('P8', { hectareas: 60, usoNombre: 'Campo natural', fecha: '2025-07-01' });
    const p9 = await base.potrero('P9', { hectareas: 50, usoNombre: 'Campo natural', fecha: '2025-07-01' });
    const etapa = (id, clave, body) => agent.post(`${API}/procesos/${id}/etapas/${clave}`).send(body).expect(201);
    const crear = async (body) => (await agent.post(`${API}/procesos`).send(body).expect(201)).body.proceso;
    // El lote de un proceso en ese estado (las preñadas pueden quedar en el lote original).
    const loteId = async (procesoId, rol, nombre) =>
      (await prisma.procesoLote.findFirst({ where: { procesoId, rol, hasta: null, lote: { activo: true, ...(nombre && { nombre: { startsWith: nombre } }) } } })).loteId;
    // Lo que muestra el tablero: "sección tipo proceso: cabezas".
    const tablero = async () =>
      (await agent.get(`${API}/campos/${campo.id}/procesos`).expect(200)).body
        .flatMap((p) => p.grupos.map((g) => `${g.seccion} ${g.tipo} ${p.nombre}: ${g.cabezas}${g.terneros ? ` +${g.terneros}` : ''}`))
        .sort();

    const entore = await crear({ fecha: '2025-08-01', modalidad: 'TOROS', nombre: 'Entore', lineas: [{ loteId: p1.lote.Vacas.id }] });
    expect(await tablero()).toEqual(['servicio VIENTRES Entore: 200']);

    await etapa(entore.id, 'FIN_SERVICIO', { fecha: '2025-11-01' });
    await etapa(entore.id, 'DIAGNOSTICO', { fecha: '2025-12-01', lineas: [{ loteId: p1.lote.Vacas.id, prenadas: { sin: 165 }, vacias: 35 }] });
    // La ecografía reparte: 165 a Preñadas, 35 a Reentore (todavía sin decidir).
    expect(await tablero()).toEqual(['prenadas PRENADAS Entore: 165', 'reentore VACIAS_A_DECIDIR Entore: 35']);

    const vacias = await loteId(entore.id, 'VACIAS');
    await etapa(entore.id, 'DECISION', { fecha: '2025-12-05', lineas: [{ loteId: vacias, destino: { reentore: true, potreroId: p8.potrero.id } }] });
    expect(await tablero()).toEqual(['prenadas PRENADAS Entore: 165', 'reentore VACIAS_REENTORE Entore: 35']);

    // Empieza el reentore: las vacías dejan el entore y quedan en Reentore, en su proceso.
    const insem = await crear({ fecha: '2025-12-10', modalidad: 'IATF', nombre: 'Reentore vacías', lineas: [{ loteId: vacias }] });
    expect((await prisma.proceso.findUnique({ where: { id: insem.id } })).datos).toMatchObject({ reentore: true });
    expect(await tablero()).toEqual(['prenadas PRENADAS Entore: 165', 'reentore VIENTRES Reentore vacías: 35']);

    // Parición de 40: pasan a Con cría al pie con sus terneros.
    await etapa(entore.id, 'PARICION', { fecha: '2026-05-10', lineas: [{ loteId: await loteId(entore.id, 'PRENADAS'), madres: 40, machos: 21, hembras: 19 }] });
    expect(await tablero()).toEqual(['cria PARIDAS Entore: 40 +40', 'prenadas PRENADAS Entore: 125', 'reentore VIENTRES Reentore vacías: 35']);

    // Destete: las madres salen del tablero.
    await etapa(entore.id, 'DESTETE', {
      fecha: '2026-11-10',
      lineas: [
        { loteId: await loteId(entore.id, 'CRIAS', 'Terneros'), destinoPotreroId: p9.potrero.id },
        { loteId: await loteId(entore.id, 'CRIAS', 'Terneras'), destinoPotreroId: p9.potrero.id },
      ],
    });
    expect(await tablero()).toEqual(['prenadas PRENADAS Entore: 125', 'reentore VIENTRES Reentore vacías: 35']);
  });
});
