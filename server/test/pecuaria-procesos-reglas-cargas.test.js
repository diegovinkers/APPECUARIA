// Procesos con las reglas del campo (25/11), fase 2: las cargas.
//   R1/R2 al separar, una de las partes cambia de potrero (IATF)
//   R3    terminar la inseminación: sin repaso con toro
//   R4    ecografía: se decide y se separa en el momento; por partes
//   R5    nunca dos entores seguidos
//   R6    vacías de una IATF a un entore en curso: avisos en los dos
//   R7    abortos y falladas a engorde
//   R8    vacas y terneros por potrero (ficha)
//   R9    destete: vacas y terneros, cada uno con su destino
//   R10   avisos por mezcla en las vistas previas
// Datos ficticios (Estancia Ejemplo). Las fechas van en el pasado.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { fotoActual } from '../src/pecuaria/lotes.js';
import { useTestDatabase } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

// P1: Vacas = 103 Vacas de cría · P2: Rodeo = 50 Vacas de cría · P10: Novillos = 30 · P8, P9, P11, P12 vacíos.
async function preparar() {
  const base = await prepararCampo();
  if (!base.cat['Vacas de cría']) base.cat['Vacas de cría'] = (await prisma.categoria.create({ data: { nombre: 'Vacas de cría', sexo: 'HEMBRA' } })).id;
  const f = '2025-07-01';
  const p1 = await base.potrero('P1', { hectareas: 120, usoNombre: 'Campo natural', fecha: f, lotes: [['Vacas', 'Vacas de cría', 103, 430]] });
  const p2 = await base.potrero('P2', { hectareas: 80, usoNombre: 'Campo natural', fecha: f, lotes: [['Rodeo', 'Vacas de cría', 50, 430]] });
  const p10 = await base.potrero('P10', { hectareas: 40, usoNombre: 'Campo natural', fecha: f, lotes: [['Novillos', 'Novillos', 30, 350]] });
  const vacio = async (nombre) => (await base.potrero(nombre, { hectareas: 50, usoNombre: 'Campo natural', fecha: f })).potrero;
  return { ...base, Vacas: p1.lote.Vacas, Rodeo: p2.lote.Rodeo, P1: p1.potrero, P2: p2.potrero, P10: p10.potrero, P8: await vacio('P8'), P9: await vacio('P9'), P11: await vacio('P11'), P12: await vacio('P12') };
}

async function enPotreros(campoId) {
  const potreros = await prisma.potrero.findMany({ where: { campoId }, select: { id: true, nombre: true } });
  const nombres = Object.fromEntries((await prisma.categoria.findMany()).map((c) => [c.id, c.nombre]));
  const r = {};
  for (const p of potreros) {
    for (const l of (await fotoActual(prisma, p.id))?.lineas ?? []) {
      if (l.cabezas) r[`${p.nombre} ${nombres[l.categoriaId]}`] = (r[`${p.nombre} ${nombres[l.categoriaId]}`] ?? 0) + l.cabezas;
    }
  }
  return r;
}

async function lote(nombre) {
  const l = await prisma.lote.findFirst({ where: { nombre, activo: true } });
  if (!l) return null;
  const linea = (await fotoActual(prisma, l.potreroId))?.lineas.find((x) => x.loteId === l.id);
  return { id: l.id, cabezas: linea?.cabezas ?? 0, potreroId: l.potreroId };
}

const crear = async (agent, body, esperado = 201) => {
  const r = (await agent.post(`${API}/procesos`).send(body).expect(esperado)).body;
  return esperado === 201 ? r.proceso : r;
};
const previaCrear = async (agent, body, esperado = 200) => (await agent.post(`${API}/procesos/vista-previa`).send(body).expect(esperado)).body;
const etapa = async (agent, id, clave, body, esperado = 201) => (await agent.post(`${API}/procesos/${id}/etapas/${clave}`).send(body).expect(esperado)).body;
const previa = async (agent, id, clave, body, esperado = 200) => (await agent.post(`${API}/procesos/${id}/etapas/${clave}/vista-previa`).send(body).expect(esperado)).body;
const ficha = async (agent, id) => (await agent.get(`${API}/procesos/${id}`).expect(200)).body;
const anularUltima = async (agent, id, clave) => {
  const f = await ficha(agent, id);
  const cargas = f.etapas.find((e) => e.clave === clave).cargas.filter((c) => !c.anulada);
  await agent.post(`${API}/procesos/${id}/cargas/${cargas.at(-1).grupoId}/anular`).expect(200);
};
const rol = (procesoId, loteId) => prisma.procesoLote.findUnique({ where: { procesoId_loteId: { procesoId, loteId } } });

describe('R2/R3: arranque de la IATF y las sin inseminar', () => {
  it('con menos inseminadas, una de las partes se va; con todas, se pueden quedar', async () => {
    const { agent, campo, Vacas, P1, P8, P9 } = await preparar();
    const iatf = (extra) => ({ fecha: '2025-08-01', modalidad: 'IATF', nombre: 'IATF EJ', lineas: [{ loteId: Vacas.id, ...extra }] });

    // 80 de 103 sin elegir potrero: error.
    expect((await previaCrear(agent, iatf({ cabezas: 80 }), 400)).errors[0]).toMatch(/se inseminan 80 de 103: las inseminadas y las 23 sin inseminar no pueden quedar en el mismo potrero/);
    // Las 80 a P8, o las 23 a P9: anda. Las dos al mismo: error.
    await previaCrear(agent, iatf({ cabezas: 80, potreroId: P8.id }));
    await previaCrear(agent, iatf({ cabezas: 80, potreroId: P9.id, sinInseminarA: P9.id }), 400);
    // Todas: se quedan.
    expect((await previaCrear(agent, iatf({})))).toMatchObject({ cabezas: 103 });

    // Se van las 23 sin inseminar: las 80 inseminadas quedan en P1.
    const p = await crear(agent, iatf({ cabezas: 80, sinInseminarA: P9.id }));
    expect(await enPotreros(campo.id)).toMatchObject({ 'P1 Vacas de cría': 80, 'P9 Vacas de cría': 23 });
    expect(await lote('Vacas · IATF 01/08')).toMatchObject({ cabezas: 80, potreroId: P1.id });
    expect(await rol(p.id, Vacas.id)).toMatchObject({ rol: 'SIN_SERVIR' });

    // Terminar la inseminación: ya no hay repaso con toro.
    expect((await etapa(agent, p.id, 'FIN_INSEMINACION', { fecha: '2025-08-05', lineas: [{ loteId: Vacas.id, destino: 'REPASO' }] }, 400)).errors[0]).toMatch(/repaso con toro ya no se anota/);

    // Otro día: 10 de las 23, sin elegir potrero, error; las 10 a P8, anda.
    expect((await previa(agent, p.id, 'INSEMINACION', { fecha: '2025-08-05', lineas: [{ loteId: Vacas.id, cabezas: 10 }] }, 400)).errors[0]).toMatch(/no pueden quedar en el mismo potrero/);
    await etapa(agent, p.id, 'INSEMINACION', { fecha: '2025-08-05', lineas: [{ loteId: Vacas.id, cabezas: 10, potreroId: P8.id }] });
    expect(await enPotreros(campo.id)).toMatchObject({ 'P1 Vacas de cría': 80, 'P8 Vacas de cría': 10, 'P9 Vacas de cría': 13 });

    // Las 13 que quedan salen del proceso (se pueden mover).
    await etapa(agent, p.id, 'FIN_INSEMINACION', { fecha: '2025-08-06', lineas: [{ loteId: Vacas.id, destino: 'SALEN' }] });
    expect(await rol(p.id, Vacas.id)).toMatchObject({ rol: 'LIBRES' });
  });
});

describe('R4/R5: ecografía', () => {
  async function conIatf() {
    const base = await preparar();
    const p = await crear(base.agent, { fecha: '2025-08-01', modalidad: 'IATF', nombre: 'IATF EJ', lineas: [{ loteId: base.Vacas.id }] });
    return { ...base, p };
  }
  const diag = (loteId, grupos, extra = {}) => ({ fecha: '2025-09-15', lineas: [{ loteId, prenadas: { sin: 80 }, vacias: 23, ...extra }], decision: grupos ? [{ loteId, grupos }] : undefined });

  it('preñadas y vacías no quedan juntas; anda si se van unas, otras o las dos a potreros distintos', async () => {
    const { agent, campo, p, Vacas, P1, P8, P9 } = await conIatf();
    const vacias = (destino) => ({ clave: 'vacias', destino });
    const prenadas = (potreroId) => ({ clave: 'sin', destino: { potreroId } });

    expect((await previa(agent, p.id, 'DIAGNOSTICO', diag(Vacas.id, null), 400)).errors[0]).toMatch(/Elegí qué pasa con las vacías: entore con toros o engorde/);
    expect((await previa(agent, p.id, 'DIAGNOSTICO', diag(Vacas.id, [vacias({ invernada: true })]), 400)).errors[0]).toMatch(/Preñadas y vacías para engorde no pueden quedar en el mismo potrero/);
    // "Decidir después" ya no va.
    await previa(agent, p.id, 'DIAGNOSTICO', diag(Vacas.id, [vacias({ despues: true, potreroId: P9.id })]), 400);
    // Se van las vacías / se van las preñadas / las dos a potreros distintos.
    await previa(agent, p.id, 'DIAGNOSTICO', diag(Vacas.id, [vacias({ invernada: true, potreroId: P9.id })]));
    await previa(agent, p.id, 'DIAGNOSTICO', diag(Vacas.id, [prenadas(P8.id), vacias({ reentore: true })]));
    await previa(agent, p.id, 'DIAGNOSTICO', diag(Vacas.id, [prenadas(P8.id), vacias({ reentore: true, potreroId: P9.id })]));
    await previa(agent, p.id, 'DIAGNOSTICO', diag(Vacas.id, [prenadas(P8.id), vacias({ reentore: true, potreroId: P8.id })]), 400);

    // Engorde: salen del proceso, con la categoría de invernar.
    await etapa(agent, p.id, 'DIAGNOSTICO', diag(Vacas.id, [vacias({ invernada: true, potreroId: P9.id })]));
    expect(await enPotreros(campo.id)).toMatchObject({ 'P1 Vacas de cría': 80, 'P9 Vacas invernar': 23 });
    const engorde = await lote('Vacas · engorde');
    expect(await rol(p.id, engorde.id)).toMatchObject({ rol: 'LIBRES', destino: 'INVERNADA' });
    expect(await rol(p.id, Vacas.id)).toMatchObject({ rol: 'PRENADAS' });

    // Anular la carga deja todo como estaba.
    await anularUltima(agent, p.id, 'DIAGNOSTICO');
    expect((await enPotreros(campo.id))['P1 Vacas de cría']).toBe(103);
    expect(await rol(p.id, Vacas.id)).toMatchObject({ rol: 'VIENTRES' });
    expect(P1.id).toBeTruthy();
  });

  it('las vacías de un entore van a engorde, no a otro entore; lo viejo da aviso y no se vuelve a servir', async () => {
    const { agent, Rodeo, P9 } = await preparar();
    const entore = await crear(agent, { fecha: '2025-08-01', modalidad: 'TOROS', nombre: 'Entore EJ', lineas: [{ loteId: Rodeo.id }] });
    await etapa(agent, entore.id, 'FIN_SERVICIO', { fecha: '2025-11-01' });
    const body = (destino) => ({ fecha: '2025-12-01', lineas: [{ loteId: Rodeo.id, prenadas: { sin: 40 }, vacias: 10 }], decision: [{ loteId: Rodeo.id, grupos: [{ clave: 'vacias', destino }] }] });
    expect((await previa(agent, entore.id, 'DIAGNOSTICO', body({ reentore: true, potreroId: P9.id }), 400)).errors[0]).toMatch(/Las vacías de un entore van a engorde: no se vuelven a servir/);
    await previa(agent, entore.id, 'DIAGNOSTICO', body({ invernada: true, potreroId: P9.id }));

    // Lo viejo: vacías de un entore marcadas para volver a servir.
    await prisma.procesoLote.update({ where: { procesoId_loteId: { procesoId: entore.id, loteId: Rodeo.id } }, data: { rol: 'VACIAS', destino: 'REENTORE' } });
    expect((await ficha(agent, entore.id)).avisos[0]).toMatch(/50 vacías quedaron para volver a servir, pero son de un entore/);
    expect((await crear(agent, { fecha: '2025-12-05', modalidad: 'TOROS', lineas: [{ loteId: Rodeo.id }] }, 400)).errors[0]).toMatch(/vienen del entore "Entore EJ": van a engorde/);
    // Decidir lo viejo (vacías sin destino): solo engorde.
    await prisma.procesoLote.update({ where: { procesoId_loteId: { procesoId: entore.id, loteId: Rodeo.id } }, data: { destino: null } });
    expect((await previa(agent, entore.id, 'DECISION', { fecha: '2025-12-05', lineas: [{ loteId: Rodeo.id, destino: { reentore: true, potreroId: P9.id } }] }, 400)).errors[0]).toMatch(/no se vuelven a servir/);
  });

  it('vacías de una IATF: a un entore (una vez) en curso, con los avisos en los dos procesos; no a otra IATF', async () => {
    const { agent, p, Vacas, Rodeo, P9 } = await conIatf();
    await etapa(agent, p.id, 'DIAGNOSTICO', diag(Vacas.id, [{ clave: 'vacias', destino: { reentore: true, potreroId: P9.id } }]));
    const vacias = await lote('Vacas · vacías');
    expect(await rol(p.id, vacias.id)).toMatchObject({ rol: 'VACIAS', destino: 'REENTORE' });

    expect((await crear(agent, { fecha: '2025-09-20', modalidad: 'IATF', lineas: [{ loteId: vacias.id }] }, 400)).errors[0]).toMatch(/se vuelven a servir una sola vez, en un entore con toros/);

    const entore = await crear(agent, { fecha: '2025-09-01', modalidad: 'TOROS', nombre: 'Entore EJ', lineas: [{ loteId: Rodeo.id }] });
    await etapa(agent, entore.id, 'TANDA', { fecha: '2025-09-20', lineas: [{ loteId: vacias.id }] });
    expect((await ficha(agent, p.id)).enlaces.van.map((e) => e.texto)).toEqual(['23 vacías → entore "Entore EJ" (desde el 20/09)']);
    expect((await ficha(agent, entore.id)).enlaces.vienen.map((e) => e.texto)).toEqual(['23 vienen de la IATF "IATF EJ"']);
  });

  it('ecografía por partes: preñadas, vacías y sin ecografiar en tres potreros; el diagnóstico queda a medias', async () => {
    const { agent, campo, p, Vacas, P8, P9 } = await conIatf();
    const parte = (fecha, prenadas, vacias, prenadasA) => ({
      fecha,
      lineas: [{ loteId: Vacas.id, prenadas: { sin: prenadas }, vacias }],
      decision: [{ loteId: Vacas.id, grupos: [...(prenadasA ? [{ clave: 'sin', destino: { potreroId: prenadasA } }] : []), { clave: 'vacias', destino: { invernada: true, potreroId: P9.id } }] }],
    });
    // Las preñadas no se pueden quedar con las sin ecografiar.
    expect((await previa(agent, p.id, 'DIAGNOSTICO', parte('2025-09-15', 50, 10, null), 400)).errors[0]).toMatch(/Preñadas y sin ecografiar no pueden quedar/);
    await etapa(agent, p.id, 'DIAGNOSTICO', parte('2025-09-15', 50, 10, P8.id));
    expect(await enPotreros(campo.id)).toMatchObject({ 'P1 Vacas de cría': 43, 'P8 Vacas de cría': 50, 'P9 Vacas invernar': 10 });
    let f = await ficha(agent, p.id);
    expect(f.etapa).toBe('ESPERA_DIAGNOSTICO');
    expect(f.aMedias).toMatchObject({ cabezas: 43, texto: 'Diagnóstico a medias: faltan 43' });

    await etapa(agent, p.id, 'DIAGNOSTICO', parte('2025-09-16', 40, 3, P8.id));
    expect(await enPotreros(campo.id)).toEqual({ 'P8 Vacas de cría': 90, 'P9 Vacas invernar': 13, 'P10 Novillos': 30, 'P2 Vacas de cría': 50 });
    f = await ficha(agent, p.id);
    expect(f.etapa).toBe('PRENEZ');
    expect(f.aMedias).toBeNull();
  });
});

describe('R7/R8/R9: aborto, falladas y destete', () => {
  it('aborto y falladas a engorde; vacas y terneros por potrero; destete con las vacas a otro potrero', async () => {
    const { agent, campo, Vacas, P1, P8, P9, P11 } = await preparar();
    const p = await crear(agent, { fecha: '2025-08-01', modalidad: 'TOROS', nombre: 'Entore EJ', lineas: [{ loteId: Vacas.id }] });
    await etapa(agent, p.id, 'FIN_SERVICIO', { fecha: '2025-11-01' });
    await etapa(agent, p.id, 'DIAGNOSTICO', {
      fecha: '2025-12-01',
      lineas: [{ loteId: Vacas.id, prenadas: { sin: 100 }, vacias: 3 }],
      decision: [{ loteId: Vacas.id, grupos: [{ clave: 'vacias', destino: { invernada: true, potreroId: P9.id } }] }],
    });

    // Aborto: a engorde, a otro potrero.
    expect((await etapa(agent, p.id, 'ABORTO', { fecha: '2026-02-01', aVacias: true, lineas: [{ loteId: Vacas.id, cabezas: 2 }] }, 400)).errors[0]).toMatch(/van a engorde: elegí otro potrero/);
    await etapa(agent, p.id, 'ABORTO', { fecha: '2026-02-01', aVacias: true, potreroId: P9.id, lineas: [{ loteId: Vacas.id, cabezas: 2 }] });
    expect(await enPotreros(campo.id)).toMatchObject({ 'P1 Vacas de cría': 98, 'P9 Vacas invernar': 5 });
    const abortaron = await lote('Vacas · engorde');
    expect(await rol(p.id, abortaron.id)).toMatchObject({ rol: 'LIBRES', destino: 'INVERNADA' });

    // Parición: 60 paridas con 60 terneros en P1. R8.
    await etapa(agent, p.id, 'PARICION', { fecha: '2026-05-10', lineas: [{ loteId: Vacas.id, madres: 60, terneros: 60 }] });
    expect((await ficha(agent, p.id)).porPotrero.map((x) => x.texto)).toEqual(['P1: 98 vacas (60 paridas · 38 preñadas) · 60 terneros']);

    // Fin de la parición: las 38 falladas no se quedan con las paridas; a engorde.
    expect((await etapa(agent, p.id, 'FIN_PARICION', { fecha: '2026-07-01', lineas: [{ loteId: Vacas.id }] }, 400)).errors[0]).toMatch(/no pueden quedar con las (paridas|terneros) del proceso/);
    await etapa(agent, p.id, 'FIN_PARICION', { fecha: '2026-07-01', lineas: [{ loteId: Vacas.id, potreroId: P9.id }] });
    expect(await enPotreros(campo.id)).toMatchObject({ 'P1 Vacas de cría': 60, 'P9 Vacas invernar': 43 });
    // Se sumaron a una parte de engorde que ya estaba en P9: el lote se cierra.
    expect((await rol(p.id, Vacas.id)).hasta).not.toBeNull();
    const engorde = await lote('Vacas · engorde');
    expect(engorde).toMatchObject({ potreroId: P9.id });
    expect(await rol(p.id, engorde.id)).toMatchObject({ rol: 'LIBRES', destino: 'INVERNADA' });

    // Destete: terneros y vacas no van al mismo potrero; las vacas se pueden mover.
    const terneros = await lote('Terneros/as may-2026');
    expect((await etapa(agent, p.id, 'DESTETE', { fecha: '2026-11-10', lineas: [{ loteId: terneros.id, destinoPotreroId: P8.id, madresPotreroId: P8.id }] }, 400)).errors[0]).toMatch(
      /Los terneros y las vacas .* no pueden quedar en el mismo potrero/,
    );
    await etapa(agent, p.id, 'DESTETE', { fecha: '2026-11-10', lineas: [{ loteId: terneros.id, destinoPotreroId: P8.id, madresPotreroId: P11.id }] });
    const despues = await enPotreros(campo.id);
    expect(despues).toMatchObject({ 'P8 Terneros/as': 60, 'P11 Vacas de cría': 60 });
    expect(despues['P1 Vacas de cría']).toBeUndefined();

    // Anular el destete vuelve todo.
    await anularUltima(agent, p.id, 'DESTETE');
    expect(await enPotreros(campo.id)).toMatchObject({ 'P1 Vacas de cría': 60, 'P1 Terneros/as': 60 });
    expect(P1.id).toBeTruthy();
  });
});

describe('R10: avisos por mezcla en la vista previa', () => {
  it('una carga del proceso y un movimiento del "+" avisan si quedan juntos novillos y vacas', async () => {
    const { agent, Vacas, P10 } = await preparar();
    const p = await crear(agent, { fecha: '2025-08-01', modalidad: 'IATF', lineas: [{ loteId: Vacas.id }] });
    const r = await previa(agent, p.id, 'DIAGNOSTICO', {
      fecha: '2025-09-15',
      lineas: [{ loteId: Vacas.id, prenadas: { sin: 80 }, vacias: 23 }],
      decision: [{ loteId: Vacas.id, grupos: [{ clave: 'vacias', destino: { invernada: true, potreroId: P10.id } }] }],
    });
    expect(r.avisos.some((a) => /^En P10 quedan juntos .*Novillos/.test(a))).toBe(true);

    const m = (await agent.post(`${API}/movimientos/vista-previa`).send({ loteOrigenId: Vacas.id, cabezas: 10, destinoPotreroId: P10.id, modo: 'NUEVO', mismoLote: true, fecha: '2025-09-20' }).expect(200)).body;
    expect(m.avisos.some((a) => /^En P10 quedan juntos .*Novillos/.test(a))).toBe(true);
  });
});
