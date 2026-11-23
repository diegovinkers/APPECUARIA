// Procesos con eventos sugeridos, fase 8 (docs/PECUARIA.md §9): el ejemplo
// de control de punta a punta, con bajas y procesos enganchados. Las fechas
// del ejemplo (2026-2028) se corren al pasado, porque no se cargan fechas
// futuras: inicio 01/08/2025, 200 vacas, toros T-014 y T-022; fin del
// entore 01/11/2025; ecografía en dos días (85+15 y 80+20); las 35 vacías a
// P8 con una inseminación enganchada; parición con una tanda de 21 machos y
// 19 hembras; nuevo entore de las paridas (enganchado); baja de 1 ternero y
// destete de 39. El stock cuadra en cada paso.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { fotoActual } from '../src/pecuaria/lotes.js';
import { useTestDatabase } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

// Estancia Ejemplo (EJ), ficticia, con stock desde el 01/07/2025:
//   P1: Vacas = 200 Vacas de cría   P3: Toros = 4 Toros (T-014 y T-022)   P8 y P9: vacíos
async function preparar() {
  const base = await prepararCampo();
  for (const [nombre, sexo] of [
    ['Vacas de cría', 'HEMBRA'],
    ['Toros', 'MACHO'],
  ]) {
    if (!base.cat[nombre]) base.cat[nombre] = (await prisma.categoria.create({ data: { nombre, sexo } })).id;
  }
  const p1 = await base.potrero('P1', { hectareas: 120, usoNombre: 'Campo natural', fecha: '2025-07-01', lotes: [['Vacas', 'Vacas de cría', 200, 430]] });
  const p3 = await base.potrero('P3', { hectareas: 20, usoNombre: 'Campo natural', fecha: '2025-07-01', lotes: [['Toros', 'Toros', 4, 800]] });
  const p8 = await base.potrero('P8', { hectareas: 60, usoNombre: 'Campo natural', fecha: '2025-07-01' });
  const p9 = await base.potrero('P9', { hectareas: 50, usoNombre: 'Campo natural', fecha: '2025-07-01' });
  const toros = {};
  for (const id of ['T-014', 'T-022']) {
    toros[id] = (await base.agent.post(`${API}/campos/${base.campo.id}/toros`).send({ identificacion: id, raza: 'Angus', loteId: p3.lote.Toros.id }).expect(201)).body;
  }
  const causa = await prisma.causaMovimiento.findFirst({ where: { tipos: { some: { tipo: { clave: 'MUERTE' } } }, activo: true }, orderBy: { codigo: 'asc' } });
  return { ...base, toros, causa, Vacas: p1.lote.Vacas, P1: p1.potrero, P3: p3.potrero, P8: p8.potrero, P9: p9.potrero };
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
const crear = async (agent, body) => (await agent.post(`${API}/procesos`).send(body).expect(201)).body.proceso;

describe('el ejemplo de punta a punta (fase 8)', () => {
  it('entore → ecografía en dos días → vacías a una inseminación enganchada → parición → nuevo entore → baja → destete', async () => {
    const base = await preparar();
    const { agent, campo, toros, causa, P1, P3, P8, P9 } = base;
    const VACAS = 200;
    const cuadra = async (extra = {}) => expect((await stock(campo.id)).porCategoria).toEqual({ 'Vacas de cría': VACAS, Toros: 4, ...extra });

    // 1. Inicio con los dos toros (van con las vacas a P1).
    const entore = await crear(agent, {
      fecha: '2025-08-01',
      modalidad: 'TOROS',
      nombre: 'Entore 2025-26 EJ',
      lineas: [{ loteId: base.Vacas.id }],
      asignarToros: [{ toroId: toros['T-014'].id }, { toroId: toros['T-022'].id }],
    });
    await cuadra();
    expect((await stock(campo.id)).porPotrero).toMatchObject({ 'P1 Toros': 2, 'P3 Toros': 2 });
    let f = await ficha(agent, entore.id);
    expect(f.proxima).toMatchObject({ etapa: 'FIN_SERVICIO', fecha: '2025-10-30' });

    // 2. Fin del entore: salen los toros a P3. La ecografía, 30 días después.
    await etapa(agent, entore.id, 'FIN_SERVICIO', {
      fecha: '2025-11-01',
      salenToros: [
        { toroId: toros['T-014'].id, potreroId: P3.id },
        { toroId: toros['T-022'].id, potreroId: P3.id },
      ],
    });
    await cuadra();
    expect((await stock(campo.id)).porPotrero).toMatchObject({ 'P3 Toros': 4 });
    f = await ficha(agent, entore.id);
    expect(f.cronograma.find((i) => i.clave === 'DIAGNOSTICO')).toMatchObject({ fecha: '2025-12-01' });

    // 3. Ecografía en dos días: 85+15 y 80+20 → 165 preñadas y 35 vacías.
    await etapa(agent, entore.id, 'DIAGNOSTICO', { fecha: '2025-12-01', lineas: [{ loteId: base.Vacas.id, prenadas: { sin: 85 }, vacias: 15 }] });
    await etapa(agent, entore.id, 'DIAGNOSTICO', { fecha: '2025-12-02', lineas: [{ loteId: base.Vacas.id, prenadas: { sin: 80 }, vacias: 20 }] });
    const prenadas = await lote('Vacas · preñadas');
    const vacias = await lote('Vacas · vacías');
    expect([prenadas.cabezas, vacias.cabezas]).toEqual([165, 35]);
    await cuadra();

    // 4. Las 35 vacías a P8 para volver a servir; la ficha ofrece engancharlas.
    await etapa(agent, entore.id, 'DECISION', { fecha: '2025-12-05', lineas: [{ loteId: vacias.id, destino: { reentore: true, potreroId: P8.id } }] });
    f = await ficha(agent, entore.id);
    expect(f.paraEnganchar).toEqual([{ loteId: vacias.id, lote: 'Vacas · vacías', cabezas: 35 }]);
    const insem = await crear(agent, { fecha: '2025-12-10', modalidad: 'IATF', nombre: 'Inseminación vacías EJ', lineas: [{ loteId: vacias.id }] });
    expect((await ficha(agent, insem.id)).anterior).toMatchObject({ id: entore.id, nombre: 'Entore 2025-26 EJ' });
    f = await ficha(agent, entore.id);
    expect(f.paraEnganchar).toEqual([]);
    expect(f.siguientes.map((s) => s.nombre)).toEqual(['Inseminación vacías EJ']);
    expect((await stock(campo.id)).porPotrero).toMatchObject({ 'P1 Vacas de cría': 165, 'P8 Vacas de cría': 35 });
    await cuadra();

    // 5. Parición: una tanda de 40 madres, 21 machos y 19 hembras.
    await etapa(agent, entore.id, 'PARICION', { fecha: '2026-05-10', lineas: [{ loteId: prenadas.id, madres: 40, machos: 21, hembras: 19 }] });
    const terneros = await lote('Terneros may-2026');
    const terneras = await lote('Terneras may-2026');
    expect([terneros.cabezas, terneras.cabezas]).toEqual([21, 19]);
    const CRIAS = { 'Terneros chicos': 21, 'Terneras chicas': 19 };
    await cuadra(CRIAS);
    f = await ficha(agent, entore.id);
    expect(f.cronograma.find((i) => i.clave === 'NUEVO_ENTORE:2026-05')).toMatchObject({ fecha: '2026-07-19' });
    expect(f.cronograma.find((i) => i.clave === 'DESTETE:2026-05')).toMatchObject({ fecha: '2026-11-10' });

    // 6. Nuevo entore de las paridas, con ternero al pie (enganchado).
    const paridas = await lote('Vacas · paridas may');
    const nuevo = await crear(agent, { fecha: '2026-07-20', modalidad: 'TOROS', nombre: 'Entore 2026-27 EJ', lineas: [{ loteId: paridas.id }] });
    f = await ficha(agent, entore.id);
    expect(f.cronograma.find((i) => i.clave === 'NUEVO_ENTORE:2026-05')).toMatchObject({ estado: 'HECHA', real: '2026-07-20' });
    expect(f.siguientes.map((s) => s.nombre)).toEqual(['Inseminación vacías EJ', 'Entore 2026-27 EJ']);
    expect((await ficha(agent, nuevo.id)).anterior).toMatchObject({ id: entore.id });
    await cuadra(CRIAS);

    // 7. Baja de un ternero (desde Más opciones): 20 machos.
    const baja = await etapa(agent, entore.id, 'BAJA', { fecha: '2026-09-01', lineas: [{ loteId: terneros.id, cabezas: 1, causaId: causa.id }] });
    expect(await lote('Terneros may-2026')).toMatchObject({ cabezas: 20 });
    expect(baja.ficha.embudo).toMatchObject({ muertesCrias: 1, muertesMadres: 0 });
    expect(baja.ficha.etapas.find((e) => e.clave === 'BAJA').cargas[0].lineas[0].texto).toMatch(/^1 cría muerta/);
    await cuadra({ 'Terneros chicos': 20, 'Terneras chicas': 19 });

    // 8. Destete: 39 terneros a P9; las madres dejan el entore viejo y siguen en el nuevo.
    const destete = await etapa(agent, entore.id, 'DESTETE', {
      fecha: '2026-11-10',
      lineas: [
        { loteId: terneros.id, destinoPotreroId: P9.id },
        { loteId: terneras.id, destinoPotreroId: P9.id },
      ],
    });
    expect(destete.ficha.embudo).toMatchObject({ servidas: 200, prenadas: 165, vacias: 35, paridas: 40, ternerosVivos: 40, muertesCrias: 1, destetados: 39 });
    expect((await stock(campo.id)).porPotrero).toMatchObject({ 'P9 Terneros chicos': 20, 'P9 Terneras chicas': 19, 'P1 Vacas de cría': 165, 'P8 Vacas de cría': 35 });
    await cuadra({ 'Terneros chicos': 20, 'Terneras chicas': 19 });
    expect(await prisma.procesoLote.findFirst({ where: { procesoId: entore.id, loteId: paridas.id } })).toMatchObject({ rol: 'LIBRES' });
    expect(await prisma.procesoLote.findFirst({ where: { procesoId: nuevo.id, loteId: paridas.id } })).toMatchObject({ rol: 'VIENTRES', hasta: null });
    expect(P1.id).toBeTruthy();
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
