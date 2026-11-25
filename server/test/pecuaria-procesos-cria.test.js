// Procesos con eventos sugeridos, fase 7 (docs/PECUARIA.md §9): parición en
// tandas al lote del mes, la caravana como dato opcional, el nuevo entore de
// las paridas con ternero al pie (la vaca queda en dos procesos) y el
// destete. La categoría de la madre no cambia; el stock se conserva: las
// vacas de cría siempre son 165 y los terneros son los que nacieron.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { fotoActual } from '../src/pecuaria/lotes.js';
import { useTestDatabase } from './helpers.js';
import { hoy, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

// Estancia Ejemplo (EJ), ficticia, con stock desde el 01/07/2026:
//   P1: Vacas = 165 Vacas de cría (preñadas de un entore que ya está pariendo)
//   P3: Toros = 4 Toros (T-014 es uno)   P8 y P9: vacíos
async function preparar() {
  const base = await prepararCampo();
  for (const [nombre, sexo] of [
    ['Vacas de cría', 'HEMBRA'],
    ['Toros', 'MACHO'],
  ]) {
    if (!base.cat[nombre]) base.cat[nombre] = (await prisma.categoria.create({ data: { nombre, sexo } })).id;
  }
  const p1 = await base.potrero('P1', { hectareas: 120, usoNombre: 'Campo natural', fecha: '2026-07-01', lotes: [['Vacas', 'Vacas de cría', 165, 430]] });
  const p3 = await base.potrero('P3', { hectareas: 20, usoNombre: 'Campo natural', fecha: '2026-07-01', lotes: [['Toros', 'Toros', 4, 800]] });
  const p8 = await base.potrero('P8', { hectareas: 60, usoNombre: 'Campo natural', fecha: '2026-07-01' });
  const p9 = await base.potrero('P9', { hectareas: 50, usoNombre: 'Campo natural', fecha: '2026-07-01' });
  const toro = (await base.agent.post(`${API}/campos/${base.campo.id}/toros`).send({ identificacion: 'T-014', raza: 'Angus', loteId: p3.lote.Toros.id }).expect(201)).body;
  const Vacas = p1.lote.Vacas;
  const { proceso } = (
    await base.agent
      .post(`${API}/procesos`)
      .send({
        modalidad: 'TOROS',
        nombre: 'Entore 2025-26 EJ',
        enCurso: { etapa: 'PARIENDO', inicio: '2025-12-01', fin: '2026-03-01', servidas: 200, prenadas: 165, vacias: 35, lotes: [{ loteId: Vacas.id, rol: 'PRENADAS' }] },
      })
      .expect(201)
  ).body;
  return { ...base, proceso, Vacas, toro, P1: p1.potrero, P3: p3.potrero, P8: p8.potrero, P9: p9.potrero };
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
  const l = await prisma.lote.findFirst({ where: { nombre }, include: { categoria: true } });
  if (!l) return null;
  const linea = (await fotoActual(prisma, l.potreroId))?.lineas.find((x) => x.loteId === l.id);
  return { id: l.id, cabezas: linea?.cabezas ?? 0, activo: l.activo, potreroId: l.potreroId, categoria: l.categoria.nombre };
}

const etapa = async (agent, id, clave, body, esperado = 201) => (await agent.post(`${API}/procesos/${id}/etapas/${clave}`).send(body).expect(esperado)).body;
const ficha = async (agent, id) => (await agent.get(`${API}/procesos/${id}`).expect(200)).body;
const roles = async (procesoId) =>
  (await prisma.procesoLote.findMany({ where: { procesoId }, include: { lote: { select: { nombre: true } } }, orderBy: { id: 'asc' } })).map((pl) => [pl.lote.nombre, pl.rol, pl.mes, pl.hasta ? 'salió' : 'está']);

// Dos tandas de septiembre en P1 (40 + 10 madres, 26 terneros y 24 terneras).
async function parirSeptiembre({ agent, proceso, Vacas }) {
  await etapa(agent, proceso.id, 'PARICION', { fecha: '2026-09-15', lineas: [{ loteId: Vacas.id, madres: 40, machos: 21, hembras: 19, caravanas: '1001 a 1040' }] });
  await etapa(agent, proceso.id, 'PARICION', { fecha: '2026-09-25', lineas: [{ loteId: Vacas.id, madres: 10, machos: 5, hembras: 5 }] });
}

describe('parición (fase 7)', () => {
  it('en tandas, machos y hembras al lote del mes en que nacieron; la madre no cambia de categoría', async () => {
    const base = await preparar();
    const { agent, proceso, Vacas, campo, P9 } = base;

    await etapa(agent, proceso.id, 'PARICION', { fecha: '2026-09-15', lineas: [{ loteId: Vacas.id, madres: 40, machos: 21, hembras: 19, caravanas: '1001 a 1040' }] });
    expect(await lote('Vacas')).toMatchObject({ cabezas: 125, categoria: 'Vacas de cría' });
    expect(await lote('Vacas · paridas sep')).toMatchObject({ cabezas: 40, categoria: 'Vacas de cría' });
    expect(await lote('Terneros sep-2026')).toMatchObject({ cabezas: 21, categoria: 'Terneros chicos' });
    expect(await lote('Terneras sep-2026')).toMatchObject({ cabezas: 19, categoria: 'Terneras chicas' });
    // La caravana queda en el registro de la parición.
    const ancla = await prisma.eventoRegistro.findFirst({ where: { procesoId: proceso.id, etapa: 'PARICION' } });
    expect(ancla.datos).toMatchObject({ madres: 40, machos: 21, hembras: 19, caravanas: '1001 a 1040' });

    // Segunda tanda del mismo mes: se suma a los mismos lotes.
    await etapa(agent, proceso.id, 'PARICION', { fecha: '2026-09-25', lineas: [{ loteId: Vacas.id, madres: 10, machos: 5, hembras: 5 }] });
    expect(await lote('Vacas · paridas sep')).toMatchObject({ cabezas: 50 });
    expect(await lote('Terneros sep-2026')).toMatchObject({ cabezas: 26 });
    expect(await lote('Terneras sep-2026')).toMatchObject({ cabezas: 24 });

    // Octubre: las paridas van con sus crías a P9 (el lote del mes es otro).
    const r = await etapa(agent, proceso.id, 'PARICION', { fecha: '2026-10-05', lineas: [{ loteId: Vacas.id, madres: 20, machos: 10, hembras: 10, potreroId: P9.id }] });
    expect(await lote('Vacas · paridas oct')).toMatchObject({ cabezas: 20, potreroId: P9.id, categoria: 'Vacas de cría' });
    expect(await lote('Terneros oct-2026')).toMatchObject({ cabezas: 10, potreroId: P9.id });
    expect(await lote('Terneras oct-2026')).toMatchObject({ cabezas: 10, potreroId: P9.id });
    expect(r.ficha.etapas.find((e) => e.clave === 'PARICION').cargas.flatMap((c) => c.lineas.map((l) => l.texto)).join(' | ')).toMatch(/a P9/);

    // El stock: las 165 vacas siguen siendo vacas de cría; los terneros son los que nacieron.
    const s = await stock(campo.id);
    expect(s.porCategoria).toEqual({ 'Vacas de cría': 165, Toros: 4, 'Terneros chicos': 36, 'Terneras chicas': 34 });
    expect(s.porPotrero).toMatchObject({ 'P1 Vacas de cría': 145, 'P9 Vacas de cría': 20, 'P1 Terneros chicos': 26, 'P9 Terneros chicos': 10 });
    const f = await ficha(agent, proceso.id);
    expect(f.lotes.filter((l) => l.rol === 'PARIDAS').map((l) => [l.nombre, l.mes])).toEqual([
      ['Vacas · paridas sep', '2026-09'],
      ['Vacas · paridas oct', '2026-10'],
    ]);
    // Las sugerencias por mes de parto: un nuevo entore y un destete por mes.
    expect(f.cronograma.filter((i) => i.etapa === 'NUEVO_ENTORE').map((i) => i.clave)).toEqual(['NUEVO_ENTORE:2026-09', 'NUEVO_ENTORE:2026-10']);
    expect(f.cronograma.find((i) => i.clave === 'DESTETE:2026-09')).toMatchObject({ fecha: '2027-03-15' });
  });

  it('las paridas no pueden ir a un potrero de otra estancia ni a uno sin paridas', async () => {
    const base = await preparar();
    const otra = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra Ejemplo' } });
    const ajeno = await prisma.potrero.create({ data: { campoId: otra.id, nombre: 'X1', hectareas: 10 } });
    const r = await etapa(base.agent, base.proceso.id, 'PARICION', { fecha: '2026-09-15', lineas: [{ loteId: base.Vacas.id, madres: 5, machos: 5, potreroId: ajeno.id }] }, 400);
    expect(r.errors[0]).toMatch(/potrero de esta estancia/);
  });
});

describe('nuevo entore con ternero al pie y destete (fase 7)', () => {
  it('la vaca queda en dos procesos; el stock no se duplica; al destetar deja el proceso viejo', async () => {
    const base = await preparar();
    const { agent, proceso, campo, toro, P1, P3, P8 } = base;
    await parirSeptiembre(base);
    // Una tanda de octubre (no va al entore nuevo).
    await etapa(agent, proceso.id, 'PARICION', { fecha: '2026-10-05', lineas: [{ loteId: base.Vacas.id, madres: 4, machos: 2, hembras: 2 }] });
    const paridas = await lote('Vacas · paridas sep');
    const SIEMPRE = { 'Vacas de cría': 165, Toros: 4, 'Terneros chicos': 28, 'Terneras chicas': 26 };
    expect((await stock(campo.id)).porCategoria).toEqual(SIEMPRE);

    // La lista ofrece las paridas para un entore nuevo (aparte de los lotes ocupados).
    const lista = (await agent.get(`${API}/campos/${campo.id}/procesos`).expect(200)).body;
    const viejo = lista.find((p) => p.id === proceso.id);
    expect(viejo.conCriaIds).toContain(paridas.id);
    expect(viejo.loteIds).not.toContain(paridas.id);

    // El entore nuevo, con las paridas de septiembre y un toro.
    const nuevo = (
      await agent
        .post(`${API}/procesos`)
        .send({ fecha: '2026-11-01', modalidad: 'TOROS', nombre: 'Entore 2026-27 EJ', lineas: [{ loteId: paridas.id }], asignarToros: [{ toroId: toro.id }] })
        .expect(201)
    ).body.proceso;
    const p = await prisma.proceso.findUnique({ where: { id: nuevo.id } });
    expect(p.procesoAnteriorId).toBe(proceso.id);
    expect(p.datos.conCria).toEqual([{ procesoId: proceso.id, mes: '2026-09' }]);
    // En los dos procesos, el mismo lote (no se duplica el stock).
    expect(await prisma.procesoLote.count({ where: { loteId: paridas.id, hasta: null } })).toBe(2);
    expect((await stock(campo.id)).porCategoria).toEqual(SIEMPRE);
    expect((await stock(campo.id)).porPotrero).toMatchObject({ 'P1 Toros': 1, 'P3 Toros': 3 });
    // La ficha del lote muestra los dos procesos.
    const ficheLote = (await agent.get(`${API}/lotes/${paridas.id}`).expect(200)).body;
    expect(ficheLote.procesos.map((x) => x.nombre).sort()).toEqual(['Entore 2025-26 EJ', 'Entore 2026-27 EJ']);
    // En el viejo, el nuevo entore de septiembre quedó hecho; el de octubre, no.
    const f = await ficha(agent, proceso.id);
    expect(f.cronograma.find((i) => i.clave === 'NUEVO_ENTORE:2026-09')).toMatchObject({ estado: 'HECHA', real: '2026-11-01' });
    expect(f.cronograma.find((i) => i.clave === 'NUEVO_ENTORE:2026-10').estado).not.toBe('HECHA');

    // El entore nuevo sigue: fin (sale el toro) y ecografía (40 preñadas, 10 vacías).
    await etapa(agent, nuevo.id, 'FIN_SERVICIO', { fecha: '2026-11-10', salenToros: [{ toroId: toro.id, potreroId: P3.id }] });
    // Reglas del campo: las vacías de un entore van a engorde; como tienen la
    // cría al pie (en el proceso viejo), se quedan con sus terneros hasta el
    // destete (excepción de R1), y acá sin cambiar la categoría.
    const ecografia = (fecha) => ({
      fecha,
      lineas: [{ loteId: paridas.id, prenadas: { sin: 40 }, vacias: 10 }],
      decision: [{ loteId: paridas.id, grupos: [{ clave: 'vacias', destino: { invernada: true }, categoriaId: base.cat['Vacas de cría'] }] }],
    });
    const eco = await etapa(agent, nuevo.id, 'DIAGNOSTICO', ecografia('2026-11-20'));
    const vacias = await lote('Vacas · engorde');
    expect(vacias).toMatchObject({ cabezas: 10, potreroId: P1.id, categoria: 'Vacas de cría' });
    // La parte que se apartó sigue en el proceso viejo como parida de septiembre.
    expect(await roles(proceso.id)).toEqual(
      expect.arrayContaining([
        ['Vacas · paridas sep', 'PARIDAS', '2026-09', 'está'],
        ['Vacas · engorde', 'PARIDAS', '2026-09', 'está'],
      ]),
    );
    expect((await stock(campo.id)).porCategoria).toEqual(SIEMPRE);

    // Anular la ecografía: la parte deja también el proceso viejo.
    await agent.post(`${API}/procesos/${nuevo.id}/cargas/${eco.grupoId ?? eco.ficha.etapas.find((e) => e.clave === 'DIAGNOSTICO').cargas[0].grupoId}/anular`).expect(200);
    expect(await prisma.procesoLote.count({ where: { lote: { nombre: 'Vacas · engorde' } } })).toBe(0);
    expect(await lote('Vacas · paridas sep')).toMatchObject({ cabezas: 50 });
    // (la reversión queda con la fecha de hoy: lo que sigue va desde hoy)
    await etapa(agent, nuevo.id, 'DIAGNOSTICO', ecografia(hoy()));
    // (el lote anulado conserva su nombre: la parte nueva lleva otro)
    const { nombre: lasVacias } = await prisma.lote.findFirst({ where: { nombre: { startsWith: 'Vacas · engorde' }, activo: true } });

    // Destete de septiembre en el viejo: los terneros a P8; las madres (y la
    // parte de las vacías) dejan el proceso viejo, siguen en el nuevo y no
    // cambian de categoría.
    const destete = await etapa(agent, proceso.id, 'DESTETE', {
      fecha: hoy(),
      lineas: [
        { loteId: (await lote('Terneros sep-2026')).id, destinoPotreroId: P8.id },
        { loteId: (await lote('Terneras sep-2026')).id, destinoPotreroId: P8.id },
      ],
    });
    const s = await stock(campo.id);
    expect(s.porCategoria).toEqual(SIEMPRE);
    expect(s.porPotrero).toMatchObject({ 'P8 Terneros chicos': 26, 'P8 Terneras chicas': 24, 'P1 Vacas de cría': 165 });
    expect(await roles(proceso.id)).toEqual(
      expect.arrayContaining([
        ['Vacas · paridas sep', 'LIBRES', '2026-09', 'salió'],
        [lasVacias, 'LIBRES', '2026-09', 'salió'],
        // Las de octubre siguen con sus crías.
        ['Vacas · paridas oct', 'PARIDAS', '2026-10', 'está'],
      ]),
    );
    expect(await prisma.procesoLote.findFirst({ where: { procesoId: nuevo.id, loteId: paridas.id } })).toMatchObject({ rol: 'PRENADAS', hasta: null });
    expect((await lote('Vacas · paridas sep')).categoria).toBe('Vacas de cría');
    expect(destete.ficha.cronograma.find((i) => i.clave === 'DESTETE:2026-09')).toMatchObject({ estado: 'HECHA', real: hoy() });

    // Anular el destete: las madres vuelven a estar paridas en el viejo.
    const grupo = destete.ficha.etapas.find((e) => e.clave === 'DESTETE').cargas[0].grupoId;
    await agent.post(`${API}/procesos/${proceso.id}/cargas/${grupo}/anular`).expect(200);
    expect(await roles(proceso.id)).toEqual(
      expect.arrayContaining([
        ['Vacas · paridas sep', 'PARIDAS', '2026-09', 'está'],
        [lasVacias, 'PARIDAS', '2026-09', 'está'],
      ]),
    );
    expect((await stock(campo.id)).porPotrero).toMatchObject({ 'P1 Terneros chicos': 28 });
  });

  it('una parida que ya está en un entore nuevo no entra a otro', async () => {
    const base = await preparar();
    await parirSeptiembre(base);
    const paridas = await lote('Vacas · paridas sep');
    await base.agent.post(`${API}/procesos`).send({ fecha: '2026-11-01', modalidad: 'TOROS', lineas: [{ loteId: paridas.id }] }).expect(201);
    const r = await base.agent.post(`${API}/procesos`).send({ fecha: '2026-11-02', modalidad: 'TOROS', lineas: [{ loteId: paridas.id }] }).expect(409);
    expect(r.body.errors[0]).toMatch(/ya está en el proceso/);
  });

  it('anular el entore nuevo deja a las paridas en el viejo', async () => {
    const base = await preparar();
    await parirSeptiembre(base);
    const paridas = await lote('Vacas · paridas sep');
    const nuevo = (await base.agent.post(`${API}/procesos`).send({ fecha: '2026-11-01', modalidad: 'TOROS', lineas: [{ loteId: paridas.id }] }).expect(201)).body.proceso;
    await base.agent.post(`${API}/procesos/${nuevo.id}/anular`).expect(200);
    expect(await prisma.procesoLote.findFirst({ where: { procesoId: base.proceso.id, loteId: paridas.id } })).toMatchObject({ rol: 'PARIDAS', hasta: null });
  });
});
