// Procesos con eventos sugeridos, fase 6 (docs/PECUARIA.md §9): inicio con
// toros uno por uno, otra tanda, toros que salen y entran, fin del entore con
// la salida de los toros y ecografía en dos días. En cada paso, el stock se
// conserva: las cabezas por categoría de la estancia no cambian (no hay
// nacimientos ni bajas) y cada potrero tiene lo que se movió.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { fotoActual } from '../src/pecuaria/lotes.js';
import { useTestDatabase } from './helpers.js';
import { auditoria, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

// Estancia Ejemplo (EJ), ficticia:
//   P1: Vacas = 200 Vacas de cría   P5: Vacas 2 = 50 Vacas de cría
//   P3: Toros = 4 Toros (T-014 y T-022 son dos de ellos)   P8: vacío
// (con stock desde el 01/07, así se pueden cargar las fechas del ejemplo)
async function preparar() {
  const base = await prepararCampo();
  for (const [nombre, sexo] of [
    ['Vacas de cría', 'HEMBRA'],
    ['Toros', 'MACHO'],
  ]) {
    if (!base.cat[nombre]) base.cat[nombre] = (await prisma.categoria.create({ data: { nombre, sexo } })).id;
  }
  const p1 = await base.potrero('P1', { hectareas: 120, usoNombre: 'Campo natural', fecha: '2026-07-01', lotes: [['Vacas', 'Vacas de cría', 200, 430]] });
  const p5 = await base.potrero('P5', { hectareas: 40, usoNombre: 'Campo natural', fecha: '2026-07-01', lotes: [['Vacas 2', 'Vacas de cría', 50, 420]] });
  const p3 = await base.potrero('P3', { hectareas: 20, usoNombre: 'Campo natural', fecha: '2026-07-01', lotes: [['Toros', 'Toros', 4, 800]] });
  const p8 = await base.potrero('P8', { hectareas: 60, usoNombre: 'Campo natural', fecha: '2026-07-01' });
  const toros = {};
  for (const id of ['T-014', 'T-022']) {
    toros[id] = (await base.agent.post(`${API}/campos/${base.campo.id}/toros`).send({ identificacion: id, raza: 'Angus', loteId: p3.lote.Toros.id }).expect(201)).body;
  }
  return { ...base, P1: p1.potrero, P5: p5.potrero, P3: p3.potrero, P8: p8.potrero, Vacas: p1.lote.Vacas, Vacas2: p5.lote['Vacas 2'], Toros: p3.lote.Toros, toros };
}

// El stock de la estancia: por potrero y categoría, y el total por categoría.
async function stock(campoId) {
  const potreros = await prisma.potrero.findMany({ where: { campoId }, select: { id: true, nombre: true } });
  const nombres = Object.fromEntries((await prisma.categoria.findMany()).map((c) => [c.id, c.nombre]));
  const porPotrero = {};
  const porCategoria = {};
  for (const p of potreros) {
    const foto = await fotoActual(prisma, p.id);
    for (const l of foto?.lineas ?? []) {
      if (!l.cabezas) continue;
      const cat = nombres[l.categoriaId];
      porPotrero[`${p.nombre} ${cat}`] = (porPotrero[`${p.nombre} ${cat}`] ?? 0) + l.cabezas;
      porCategoria[cat] = (porCategoria[cat] ?? 0) + l.cabezas;
    }
  }
  return { porPotrero, porCategoria };
}
const SIEMPRE = { 'Vacas de cría': 250, Toros: 4 };

// Las cabezas de hoy de un lote (por nombre), en su potrero.
async function cabezasDe(nombre) {
  const lote = await prisma.lote.findFirst({ where: { nombre } });
  if (!lote) return null;
  const linea = (await fotoActual(prisma, lote.potreroId))?.lineas.find((l) => l.loteId === lote.id);
  return { cabezas: linea?.cabezas ?? 0, activo: lote.activo, potreroId: lote.potreroId, id: lote.id };
}

const etapa = async (agent, id, clave, body, esperado = 201) => (await agent.post(`${API}/procesos/${id}/etapas/${clave}`).send(body).expect(esperado)).body;
const ficha = async (agent, id) => (await agent.get(`${API}/procesos/${id}`).expect(200)).body;

async function empezar(base) {
  const { agent, Vacas, toros } = base;
  const { proceso } = (
    await agent
      .post(`${API}/procesos`)
      .send({ fecha: '2026-08-01', modalidad: 'TOROS', nombre: 'Entore EJ', lineas: [{ loteId: Vacas.id }], asignarToros: [{ toroId: toros['T-014'].id }, { toroId: toros['T-022'].id }] })
      .expect(201)
  ).body;
  return proceso;
}

describe('inicio con los toros uno por uno', () => {
  it('los toros pasan del lote de toros a una parte en el potrero de las vacas; el stock se conserva', async () => {
    const base = await preparar();
    const antes = await stock(base.campo.id);
    expect(antes.porCategoria).toEqual(SIEMPRE);
    const proceso = await empezar(base);
    const despues = await stock(base.campo.id);
    expect(despues.porCategoria).toEqual(SIEMPRE);
    expect(despues.porPotrero).toMatchObject({ 'P1 Vacas de cría': 200, 'P1 Toros': 2, 'P3 Toros': 2 });

    const f = await ficha(base.agent, proceso.id);
    expect(f.toros.map((t) => [t.identificacion, t.potrero.nombre, t.desde, t.hasta])).toEqual([
      ['T-014', 'P1', '2026-08-01', null],
      ['T-022', 'P1', '2026-08-01', null],
    ]);
    expect(f.proceso.datos.toros).toBe(2);
    const t014 = await prisma.toro.findUnique({ where: { id: base.toros['T-014'].id }, include: { lote: true } });
    expect(t014.lote.potreroId).toBe(base.P1.id);
    // Un toro que ya está en un proceso no entra a otro.
    const otro = await base.agent
      .post(`${API}/procesos`)
      .send({ fecha: '2026-08-02', modalidad: 'TOROS', lineas: [{ loteId: base.Vacas2.id }], asignarToros: [{ toroId: base.toros['T-014'].id }] })
      .expect(409);
    expect(otro.body.errors[0]).toMatch(/T-014 ya está en el proceso "Entore EJ"/);
  });

  it('la vista previa muestra los movimientos de los toros sin guardar nada', async () => {
    const base = await preparar();
    const previa = (await base.agent.post(`${API}/procesos/vista-previa`).send({ fecha: '2026-08-01', modalidad: 'TOROS', lineas: [{ loteId: base.Vacas.id }], asignarToros: [{ toroId: base.toros['T-014'].id }] }).expect(200)).body;
    expect(JSON.stringify(previa)).toMatch(/Toro T-014/);
    expect(await prisma.procesoToro.count()).toBe(0);
    expect((await stock(base.campo.id)).porPotrero['P3 Toros']).toBe(4);
  });
});

describe('el servicio del ejemplo, paso a paso', () => {
  it('tanda, toros, fin del entore y ecografía en dos días: el stock cuadra en cada paso', async () => {
    const base = await preparar();
    const { agent, campo } = base;
    const proceso = await empezar(base);
    const cuadra = async () => expect((await stock(campo.id)).porCategoria).toEqual(SIEMPRE);

    // Otra tanda: las 50 de P5 entran al servicio el 05/08.
    const tanda = await etapa(agent, proceso.id, 'TANDA', { fecha: '2026-08-05', lineas: [{ loteId: base.Vacas2.id }] });
    expect(tanda.oracion).toMatch(/Anotaste otra tanda: 1 lote \(50 cabezas\)/);
    let f = await ficha(agent, proceso.id);
    expect(f.embudo.servidas).toBe(250);
    expect(f.lotes.find((l) => l.nombre === 'Vacas 2')).toMatchObject({ rol: 'VIENTRES', activo: true });
    await cuadra();

    // Sale T-022 a P3 (vuelve al lote de toros).
    await etapa(agent, proceso.id, 'TOROS', { fecha: '2026-08-10', salen: [{ toroId: base.toros['T-022'].id, potreroId: base.P3.id }] });
    expect((await stock(campo.id)).porPotrero).toMatchObject({ 'P1 Toros': 1, 'P3 Toros': 3 });
    await cuadra();

    // Fin del entore el 01/11 con la salida de T-014: la parte de P1 se cierra.
    const fin = await etapa(agent, proceso.id, 'FIN_SERVICIO', { fecha: '2026-11-01', salenToros: [{ toroId: base.toros['T-014'].id, potreroId: base.P3.id }] });
    expect(fin.pasos.map((p) => p.texto).join(' ')).toMatch(/Toro T-014/);
    const s = await stock(campo.id);
    expect(s.porPotrero['P1 Toros']).toBeUndefined();
    expect(s.porPotrero['P3 Toros']).toBe(4);
    await cuadra();
    f = await ficha(agent, proceso.id);
    expect(f.toros.every((t) => t.hasta)).toBe(true);
    expect(f.cronograma.find((i) => i.clave === 'FIN_SERVICIO')).toMatchObject({ estado: 'HECHA', real: '2026-11-01' });

    // Ecografía, día 1: 85 preñadas y 15 vacías de las 200 de P1.
    await etapa(agent, proceso.id, 'DIAGNOSTICO', { fecha: '2026-11-20', lineas: [{ loteId: base.Vacas.id, prenadas: { sin: 85 }, vacias: 15 }] });
    expect(await cabezasDe('Vacas')).toMatchObject({ cabezas: 100, activo: true });
    expect(await cabezasDe('Vacas · preñadas')).toMatchObject({ cabezas: 85 });
    expect(await cabezasDe('Vacas · vacías')).toMatchObject({ cabezas: 15 });
    await cuadra();
    f = await ficha(agent, proceso.id);
    expect(f.cronograma.find((i) => i.clave === 'DIAGNOSTICO')).toMatchObject({ avance: 'faltan 150 por ecografiar' });
    // La categoría no cambia: todas siguen siendo vacas de cría (el estado va aparte).
    expect(f.lotes.filter((l) => l.activo).every((l) => l.categoria === 'Vacas de cría')).toBe(true);

    // Día 2: 80 preñadas y 20 vacías de las 100 que quedaban: se suman a las de ayer.
    await etapa(agent, proceso.id, 'DIAGNOSTICO', { fecha: '2026-11-21', lineas: [{ loteId: base.Vacas.id, prenadas: { sin: 80 }, vacias: 20 }] });
    expect(await cabezasDe('Vacas · preñadas')).toMatchObject({ cabezas: 165 });
    expect(await cabezasDe('Vacas · vacías')).toMatchObject({ cabezas: 35 });
    expect((await cabezasDe('Vacas')).activo).toBe(false);
    expect(await prisma.lote.count({ where: { nombre: { startsWith: 'Vacas ·' } } })).toBe(2);
    await cuadra();
    f = await ficha(agent, proceso.id);
    expect(f.embudo).toMatchObject({ servidas: 250, prenadas: 165, vacias: 35 });
    expect(f.lotes.find((l) => l.nombre === 'Vacas · preñadas')).toMatchObject({ rol: 'PRENADAS', cabezas: 165 });
    expect(f.lotes.find((l) => l.nombre === 'Vacas · vacías')).toMatchObject({ rol: 'VACIAS', cabezas: 35 });
    // Falta la tanda de P5.
    expect(f.cronograma.find((i) => i.clave === 'DIAGNOSTICO')).toMatchObject({ avance: 'faltan 50 por ecografiar' });

    // Las 35 vacías van a P8 para volver a servir.
    await etapa(agent, proceso.id, 'DECISION', { fecha: '2026-11-22', lineas: [{ loteId: (await cabezasDe('Vacas · vacías')).id, destino: { reentore: true, potreroId: base.P8.id } }] });
    expect((await stock(campo.id)).porPotrero).toMatchObject({ 'P1 Vacas de cría': 165, 'P8 Vacas de cría': 35, 'P5 Vacas de cría': 50 });
    await cuadra();
  });
});

describe('toros y tandas: reglas y anular', () => {
  it('traer otro toro después y sacarlo; un toro de baja o de otra estancia no entra', async () => {
    const base = await preparar();
    const proceso = await empezar(base);
    const otro = (await base.agent.post(`${API}/campos/${base.campo.id}/toros`).send({ identificacion: 'T-030', loteId: base.Toros.id }).expect(201)).body;
    await etapa(base.agent, proceso.id, 'TOROS', { fecha: '2026-08-15', entran: [{ toroId: otro.id, potreroId: base.P1.id }] });
    expect((await stock(base.campo.id)).porPotrero).toMatchObject({ 'P1 Toros': 3, 'P3 Toros': 1 });
    const baja = (await base.agent.post(`${API}/campos/${base.campo.id}/toros`).send({ identificacion: 'T-040' }).expect(201)).body;
    await base.agent.patch(`${API}/toros/${baja.id}`).send({ activo: false }).expect(200);
    const r = await etapa(base.agent, proceso.id, 'TOROS', { fecha: '2026-08-15', entran: [{ toroId: baja.id, potreroId: base.P1.id }] }, 400);
    expect(r.errors[0]).toMatch(/T-040 está dado de baja/);
    const sinPotrero = await etapa(base.agent, proceso.id, 'TOROS', { fecha: '2026-08-16', salen: [{ toroId: otro.id }] }, 400);
    expect(sinPotrero.errors[0]).toMatch(/Elegí a qué potrero va el toro T-030/);
    // Un toro sin lote se anota, pero el stock no cambia (con aviso).
    const suelto = (await base.agent.post(`${API}/campos/${base.campo.id}/toros`).send({ identificacion: 'T-050' }).expect(201)).body;
    const previa = (await base.agent.post(`${API}/procesos/${proceso.id}/etapas/TOROS/vista-previa`).send({ fecha: '2026-08-16', entran: [{ toroId: suelto.id, potreroId: base.P1.id }] }).expect(200)).body;
    expect(previa.avisos.join(' ')).toMatch(/T-050 no está en ningún lote de toros/);
    await etapa(base.agent, proceso.id, 'TOROS', {}, 400);
  });

  it('anular el fin del entore: los toros vuelven al proceso y al potrero de las vacas', async () => {
    const base = await preparar();
    const proceso = await empezar(base);
    const fin = await etapa(base.agent, proceso.id, 'FIN_SERVICIO', { fecha: '2026-11-01', salenToros: [{ toroId: base.toros['T-014'].id, potreroId: base.P3.id }, { toroId: base.toros['T-022'].id, potreroId: base.P3.id }] });
    expect((await stock(base.campo.id)).porPotrero['P3 Toros']).toBe(4);
    // Anular pide ANULAR: Alice (prepararCampo) tiene todo Pecuaria.
    await base.agent.post(`${API}/procesos/${proceso.id}/cargas/${fin.grupoId}/anular`).expect(200);
    const s = await stock(base.campo.id);
    expect(s.porPotrero).toMatchObject({ 'P1 Toros': 2, 'P3 Toros': 2 });
    expect(s.porCategoria).toEqual(SIEMPRE);
    const f = await ficha(base.agent, proceso.id);
    expect(f.toros.every((t) => t.hasta === null)).toBe(true);
    const t014 = await prisma.toro.findUnique({ where: { id: base.toros['T-014'].id }, include: { lote: true } });
    expect(t014.lote).toMatchObject({ potreroId: base.P1.id, activo: true });
  });

  it('anular una tanda: el lote sale del proceso y el stock queda como estaba', async () => {
    const base = await preparar();
    const proceso = await empezar(base);
    const tanda = await etapa(base.agent, proceso.id, 'TANDA', { fecha: '2026-08-05', lineas: [{ loteId: base.Vacas2.id, reparto: [{ potreroId: base.P8.id, cabezas: 20 }] }] });
    expect((await stock(base.campo.id)).porPotrero).toMatchObject({ 'P5 Vacas de cría': 30, 'P8 Vacas de cría': 20 });
    await base.agent.post(`${API}/procesos/${proceso.id}/cargas/${tanda.grupoId}/anular`).expect(200);
    const s = await stock(base.campo.id);
    expect(s.porPotrero['P5 Vacas de cría']).toBe(50);
    expect(s.porPotrero['P8 Vacas de cría']).toBeUndefined();
    expect(await prisma.procesoLote.count({ where: { procesoId: proceso.id, loteId: base.Vacas2.id } })).toBe(0);
    expect((await ficha(base.agent, proceso.id)).embudo.servidas).toBe(200);
  });

  it('una tanda: un lote de machos no; más cabezas de un lote ya servido, sí (en un entore)', async () => {
    const base = await preparar();
    const proceso = await empezar(base);
    const machos = await etapa(base.agent, proceso.id, 'TANDA', { fecha: '2026-08-05', lineas: [{ loteId: base.Toros.id }] }, 400);
    expect(machos.errors[0]).toMatch(/un servicio es para hembras/);
    await etapa(base.agent, proceso.id, 'TANDA', { fecha: '2026-08-06', lineas: [{ loteId: base.Vacas.id, cabezas: 10 }] });
    expect((await ficha(base.agent, proceso.id)).embudo.servidas).toBe(210);
    const [fila] = await auditoria('PROCESO_ETAPA');
    expect(fila.detalle).toMatchObject({ etapa: 'TANDA' });
  });
});
