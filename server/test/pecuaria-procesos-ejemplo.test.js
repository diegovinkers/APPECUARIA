// Procesos de punta a punta, con las reglas del campo (25/11,
// docs/superpowers/prompts/2026-11-25-procesos-reglas-del-campo.md): IATF →
// ecografía → entore una sola vez → engorde. Las fechas van en el pasado
// (no se cargan fechas futuras). 103 vacas en P1:
//   IATF de 80 (a P8) → otro día las 23 (a P9) → ecografía de las 80 (60
//   preñadas se quedan, 20 vacías a P10 para el entore) con las 23 sin
//   ecografiar → otra ecografía de las 23 (18 preñadas a P8, 5 vacías a P10)
//   → entore con las 25 vacías y el toro T-014 → ecografía del entore (20
//   preñadas, 5 vacías a engorde en P11) → parición de la IATF (70) → fin de
//   la parición (8 falladas a engorde) → destete de los 70 terneros a P12.
// El stock cuadra en cada paso. También las bajas (fase 8).
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { fotoActual } from '../src/pecuaria/lotes.js';
import { useTestDatabase } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

// Estancia Ejemplo (EJ), ficticia, con stock desde el 01/07/2025:
//   P1: Vacas (Vacas de cría)   P3: Toros = 4 Toros (T-014 y T-022)   P8 a P12: vacíos
async function preparar(vacas = 200) {
  const base = await prepararCampo();
  for (const [nombre, sexo] of [
    ['Vacas de cría', 'HEMBRA'],
    ['Toros', 'MACHO'],
  ]) {
    if (!base.cat[nombre]) base.cat[nombre] = (await prisma.categoria.create({ data: { nombre, sexo } })).id;
  }
  const f = '2025-07-01';
  const p1 = await base.potrero('P1', { hectareas: 120, usoNombre: 'Campo natural', fecha: f, lotes: [['Vacas', 'Vacas de cría', vacas, 430]] });
  const p3 = await base.potrero('P3', { hectareas: 20, usoNombre: 'Campo natural', fecha: f, lotes: [['Toros', 'Toros', 4, 800]] });
  const vacio = async (nombre) => (await base.potrero(nombre, { hectareas: 50, usoNombre: 'Campo natural', fecha: f })).potrero;
  const toros = {};
  for (const id of ['T-014', 'T-022']) {
    toros[id] = (await base.agent.post(`${API}/campos/${base.campo.id}/toros`).send({ identificacion: id, raza: 'Angus', loteId: p3.lote.Toros.id }).expect(201)).body;
  }
  const causa = await prisma.causaMovimiento.findFirst({ where: { tipos: { some: { tipo: { clave: 'MUERTE' } } }, activo: true }, orderBy: { codigo: 'asc' } });
  return {
    ...base,
    toros,
    causa,
    Vacas: p1.lote.Vacas,
    P1: p1.potrero,
    P3: p3.potrero,
    P8: await vacio('P8'),
    P9: await vacio('P9'),
    P10: await vacio('P10'),
    P11: await vacio('P11'),
    P12: await vacio('P12'),
  };
}

async function stock(campoId) {
  const potreros = await prisma.potrero.findMany({ where: { campoId }, select: { id: true, nombre: true } });
  const nombres = Object.fromEntries((await prisma.categoria.findMany()).map((c) => [c.id, c.nombre]));
  const porPotrero = {};
  const porCategoria = {};
  for (const p of potreros) {
    for (const l of (await fotoActual(prisma, p.id))?.lineas ?? []) {
      if (!l.cabezas) continue;
      const cat = nombres[l.categoriaId];
      porPotrero[`${p.nombre} ${cat}`] = (porPotrero[`${p.nombre} ${cat}`] ?? 0) + l.cabezas;
      porCategoria[cat] = (porCategoria[cat] ?? 0) + l.cabezas;
    }
  }
  return { porPotrero, porCategoria };
}

async function lote(nombre) {
  const l = await prisma.lote.findFirst({ where: { nombre, activo: true } });
  if (!l) return null;
  const linea = (await fotoActual(prisma, l.potreroId))?.lineas.find((x) => x.loteId === l.id);
  return { id: l.id, cabezas: linea?.cabezas ?? 0, potreroId: l.potreroId };
}

const etapa = async (agent, id, clave, body, esperado = 201) => (await agent.post(`${API}/procesos/${id}/etapas/${clave}`).send(body).expect(esperado)).body;
const ficha = async (agent, id) => (await agent.get(`${API}/procesos/${id}`).expect(200)).body;
const crear = async (agent, body, esperado = 201) => {
  const r = (await agent.post(`${API}/procesos`).send(body).expect(esperado)).body;
  return esperado === 201 ? r.proceso : r;
};
const rol = (procesoId, loteId) => prisma.procesoLote.findUnique({ where: { procesoId_loteId: { procesoId, loteId } } });

describe('el ejemplo de punta a punta (reglas del campo)', () => {
  it('IATF 80 de 103 → otro día → ecografía por partes → vacías a un entore → ecografía del entore → engorde → parición → destete', async () => {
    const base = await preparar(103);
    const { agent, campo, toros, P3, P8, P9, P10, P11, P12 } = base;
    const enPotreros = async () => (await stock(campo.id)).porPotrero;
    // Vacas de cría + Vacas invernar = 103 siempre; los toros, 4.
    const cuadra = async () => {
      const c = (await stock(campo.id)).porCategoria;
      expect((c['Vacas de cría'] ?? 0) + (c['Vacas invernar'] ?? 0)).toBe(103);
      expect(c.Toros).toBe(4);
    };

    // 1. IATF de 80 de las 103: las inseminadas a P8 (las 23 se quedan en P1).
    await crear(agent, { fecha: '2025-08-01', modalidad: 'IATF', nombre: 'IATF EJ', lineas: [{ loteId: base.Vacas.id, cabezas: 80 }] }, 400);
    const iatf = await crear(agent, { fecha: '2025-08-01', modalidad: 'IATF', nombre: 'IATF EJ', lineas: [{ loteId: base.Vacas.id, cabezas: 80, potreroId: P8.id }] });
    const inseminadas = await lote('Vacas · IATF 01/08');
    expect(await enPotreros()).toMatchObject({ 'P1 Vacas de cría': 23, 'P8 Vacas de cría': 80 });
    expect(await rol(iatf.id, base.Vacas.id)).toMatchObject({ rol: 'SIN_SERVIR' });
    await cuadra();

    // 2. Otro día: las 23 (todas), a P9.
    await etapa(agent, iatf.id, 'INSEMINACION', { fecha: '2025-08-10', lineas: [{ loteId: base.Vacas.id, cabezas: 23, potreroId: P9.id }] });
    expect(await enPotreros()).toMatchObject({ 'P8 Vacas de cría': 80, 'P9 Vacas de cría': 23 });
    expect(await rol(iatf.id, base.Vacas.id)).toMatchObject({ rol: 'VIENTRES' });

    // 3. Ecografía de las 80: 60 preñadas se quedan en P8, 20 vacías a P10 para el entore.
    //    Las 23 de P9 quedan sin ecografiar: el diagnóstico está a medias.
    await etapa(agent, iatf.id, 'DIAGNOSTICO', {
      fecha: '2025-09-15',
      lineas: [{ loteId: inseminadas.id, prenadas: { sin: 60 }, vacias: 20 }],
      decision: [{ loteId: inseminadas.id, grupos: [{ clave: 'vacias', destino: { reentore: true, potreroId: P10.id } }] }],
    });
    expect(await enPotreros()).toMatchObject({ 'P8 Vacas de cría': 60, 'P9 Vacas de cría': 23, 'P10 Vacas de cría': 20 });
    let f = await ficha(agent, iatf.id);
    expect(f.etapa).toBe('ESPERA_DIAGNOSTICO');
    expect(f.aMedias).toMatchObject({ cabezas: 23 });
    await cuadra();

    // 4. Otra ecografía, las 23: 18 preñadas con las de P8 y 5 vacías con las de P10.
    await etapa(agent, iatf.id, 'DIAGNOSTICO', {
      fecha: '2025-09-20',
      lineas: [{ loteId: base.Vacas.id, prenadas: { sin: 18 }, vacias: 5 }],
      decision: [
        {
          loteId: base.Vacas.id,
          grupos: [
            { clave: 'sin', destino: { potreroId: P8.id } },
            { clave: 'vacias', destino: { reentore: true, potreroId: P10.id } },
          ],
        },
      ],
    });
    const vacias = await lote('Vacas · vacías');
    expect(await lote('Vacas · IATF 01/08')).toMatchObject({ cabezas: 78, potreroId: P8.id });
    expect(vacias).toMatchObject({ cabezas: 25, potreroId: P10.id });
    f = await ficha(agent, iatf.id);
    expect(f.etapa).toBe('PRENEZ');
    expect(f.embudo).toMatchObject({ servidas: 103, prenadas: 78, vacias: 25 });
    await cuadra();

    // 5. Las 25 vacías a un entore nuevo, con el toro T-014 (una sola vez: R5).
    const entore = await crear(agent, {
      fecha: '2025-10-01',
      modalidad: 'TOROS',
      nombre: 'Entore vacías EJ',
      lineas: [{ loteId: vacias.id }],
      asignarToros: [{ toroId: toros['T-014'].id }],
    });
    expect((await ficha(agent, iatf.id)).enlaces.van.map((e) => e.texto)).toEqual(['25 vacías → entore "Entore vacías EJ" (desde el 01/10)']);
    expect((await ficha(agent, entore.id)).enlaces.vienen.map((e) => e.texto)).toEqual(['25 vienen de la IATF "IATF EJ"']);
    expect(await enPotreros()).toMatchObject({ 'P10 Toros': 1, 'P3 Toros': 3 });
    await cuadra();

    // 6. Fin del entore (el toro vuelve a P3) y ecografía: 20 preñadas, 5 vacías a engorde.
    await etapa(agent, entore.id, 'FIN_SERVICIO', { fecha: '2026-01-01', salenToros: [{ toroId: toros['T-014'].id, potreroId: P3.id }] });
    const ecoEntore = (destino) => ({
      fecha: '2026-02-01',
      lineas: [{ loteId: vacias.id, prenadas: { sin: 20 }, vacias: 5 }],
      decision: [{ loteId: vacias.id, grupos: [{ clave: 'vacias', destino }] }],
    });
    expect((await etapa(agent, entore.id, 'DIAGNOSTICO', ecoEntore({ reentore: true, potreroId: P11.id }), 400)).errors[0]).toMatch(/no se vuelven a servir/);
    await etapa(agent, entore.id, 'DIAGNOSTICO', ecoEntore({ invernada: true, potreroId: P11.id }));
    expect(await enPotreros()).toMatchObject({ 'P10 Vacas de cría': 20, 'P11 Vacas invernar': 5, 'P3 Toros': 4 });
    await cuadra();

    // 7. Parición de la IATF: 70 de las 78, con 70 terneros (conviven con las preñadas).
    await etapa(agent, iatf.id, 'PARICION', { fecha: '2026-05-10', lineas: [{ loteId: inseminadas.id, madres: 70, terneros: 70 }] });
    expect((await ficha(agent, iatf.id)).porPotrero.map((x) => x.texto)).toEqual(['P8: 78 vacas (70 paridas · 8 preñadas) · 70 terneros']);

    // 8. Fin de la parición: las 8 falladas a engorde, a P11.
    await etapa(agent, iatf.id, 'FIN_PARICION', { fecha: '2026-07-01', lineas: [{ loteId: inseminadas.id, potreroId: P11.id }] });
    expect(await enPotreros()).toMatchObject({ 'P8 Vacas de cría': 70, 'P11 Vacas invernar': 13 });
    await cuadra();

    // 9. Destete: los 70 terneros a P12; las vacas se quedan en P8.
    const terneros = await lote('Terneros/as may-2026');
    const destete = await etapa(agent, iatf.id, 'DESTETE', { fecha: '2026-11-10', lineas: [{ loteId: terneros.id, destinoPotreroId: P12.id }] });
    expect(destete.ficha.embudo).toMatchObject({ servidas: 103, prenadas: 78, vacias: 25, paridas: 70, ternerosVivos: 70, destetados: 70 });
    expect(await enPotreros()).toEqual({
      'P8 Vacas de cría': 70,
      'P10 Vacas de cría': 20,
      'P11 Vacas invernar': 13,
      'P12 Terneros/as': 70,
      'P3 Toros': 4,
    });
    await cuadra();
  });
});

describe('bajas (fase 8)', () => {
  async function conServicio() {
    const base = await preparar();
    const proceso = await crear(base.agent, { fecha: '2025-08-01', modalidad: 'TOROS', lineas: [{ loteId: base.Vacas.id }] });
    return { ...base, proceso };
  }

  it('la muerte de una vaca sale del stock con su causa, cuenta en el embudo y se anula con la carga', async () => {
    const { agent, proceso, campo, causa, Vacas } = await conServicio();
    const r = await etapa(agent, proceso.id, 'BAJA', { fecha: '2025-09-01', lineas: [{ loteId: Vacas.id, cabezas: 2, causaId: causa.id }] });
    expect((await stock(campo.id)).porCategoria['Vacas de cría']).toBe(198);
    expect(r.ficha.embudo.muertesMadres).toBe(2);
    const m = await prisma.movimiento.findFirst({ where: { procesoId: proceso.id, modo: 'SALIDA' }, include: { tipo: true } });
    expect(m).toMatchObject({ cabezas: 2, causaId: causa.id });
    expect(m.tipo.clave).toBe('MUERTE');
    // Una muerte de un proceso no se revierte desde Registro.
    await agent.post(`${API}/movimientos/${m.id}/revertir`).expect(400);
    const grupo = r.ficha.etapas.find((e) => e.clave === 'BAJA').cargas[0].grupoId;
    await agent.post(`${API}/procesos/${proceso.id}/cargas/${grupo}/anular`).expect(200);
    expect((await stock(campo.id)).porCategoria['Vacas de cría']).toBe(200);
    expect((await ficha(agent, proceso.id)).embudo.muertesMadres).toBe(0);
  });

  it('pide la causa y cuántas; no más que las del lote; el lote tiene que estar en el proceso', async () => {
    const { agent, proceso, causa, Vacas, toros } = await conServicio();
    expect((await etapa(agent, proceso.id, 'BAJA', { fecha: '2025-09-01', lineas: [{ loteId: Vacas.id, cabezas: 1 }] }, 400)).errors[0]).toMatch(/causa/);
    expect((await etapa(agent, proceso.id, 'BAJA', { fecha: '2025-09-01', lineas: [{ loteId: Vacas.id, causaId: causa.id }] }, 400)).errors[0]).toMatch(/cuántas murieron/);
    expect((await etapa(agent, proceso.id, 'BAJA', { fecha: '2025-09-01', lineas: [{ loteId: Vacas.id, cabezas: 201, causaId: causa.id }] }, 400)).errors[0]).toMatch(/tiene 200/);
    const t = await prisma.toro.findUnique({ where: { id: toros['T-014'].id } });
    expect((await etapa(agent, proceso.id, 'BAJA', { fecha: '2025-09-01', lineas: [{ loteId: t.loteId, cabezas: 1, causaId: causa.id }] }, 400)).errors[0]).toMatch(/no es parte del proceso/);
  });
});
