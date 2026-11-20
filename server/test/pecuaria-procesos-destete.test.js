// Procesos, paso 6 (diseño §10 y §6): el destete (los terneros se van, las
// madres vuelven a ser de cría), el cierre del proceso (solo y a mano), anular
// una carga con sus movimientos y anular el proceso.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { useTestDatabase } from './helpers.js';
import { auditoria, hoy, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

// Campo ficticio EJ, stock al 01/09/2026: P12 con lote Q = 20 Vaquillonas
// preñadas; P9 vacío. Un servicio en curso (pariendo) con Q, que parió todo
// el 12/10: 20 paridas, 10 terneros y 10 terneras.
async function preparar({ parir = true } = {}) {
  const base = await prepararCampo();
  for (const nombre of ['Vaquillonas preñadas', 'Vacas de cría']) {
    base.cat[nombre] = (await prisma.categoria.create({ data: { nombre, sexo: 'HEMBRA' } })).id;
  }
  const p12 = await base.potrero('P12', { hectareas: 40, usoNombre: 'Campo natural', fecha: '2026-09-01', lotes: [['Lote Q', 'Vaquillonas preñadas', 20, 380]] });
  const p9 = await base.potrero('P9', { hectareas: 50, usoNombre: 'Campo natural', fecha: '2026-09-01' });
  const Q = p12.lote['Lote Q'];
  const { proceso } = (
    await base.agent
      .post(`${API}/procesos`)
      .send({ modalidad: 'TOROS', enCurso: { etapa: 'PARIENDO', inicio: '2025-12-15', fin: '2026-03-15', servidas: 22, prenadas: 20, vacias: 2, lotes: [{ loteId: Q.id, rol: 'PRENADAS' }] } })
      .expect(201)
  ).body;
  if (parir) {
    await base.agent.post(`${API}/procesos/${proceso.id}/etapas/PARICION`).send({ fecha: '2026-10-12', lineas: [{ loteId: Q.id, madres: 20, machos: 10, hembras: 10 }] }).expect(201);
  }
  const terneros = await prisma.lote.findFirst({ where: { nombre: 'Lote Q · terneros oct' } });
  const terneras = await prisma.lote.findFirst({ where: { nombre: 'Lote Q · terneras oct' } });
  return { ...base, proceso, Q, terneros, terneras, P12: p12.potrero, P9: p9.potrero };
}

const cargar = async (agent, id, etapa, body, esperado = 201) => (await agent.post(`${API}/procesos/${id}/etapas/${etapa}`).send(body).expect(esperado)).body;
const ficha = async (agent, id) => (await agent.get(`${API}/procesos/${id}`).expect(200)).body;
const anularCarga = (agent, id, grupoId, esperado = 200) => agent.post(`${API}/procesos/${id}/cargas/${grupoId}/anular`).expect(esperado);
const lineas = async (agent, potrero) =>
  ((await agent.get(`${API}/potreros/${potrero.id}`).expect(200)).body.stock?.lineas ?? []).map((l) => [l.lote, l.categoria, l.cabezas]).sort((a, b) => a[0].localeCompare(b[0]));

describe('destete', () => {
  it('los terneros se van con el destete; las madres vuelven a ser de cría cuando se destetan todas sus crías', async () => {
    const { agent, proceso, terneros, terneras, P12, P9, cat } = await preparar();
    await cargar(agent, proceso.id, 'DESTETE', { fecha: '2026-11-15', lineas: [{ loteId: terneros.id, destinoPotreroId: P9.id, categoriaId: cat.Terneros, pesoPromedioKg: 180 }] });
    const m = await prisma.movimiento.findFirst({ where: { procesoId: proceso.id, loteOrigenId: terneros.id }, include: { tipo: true } });
    expect(m.tipo.clave).toBe('DESTETE');
    const madres = await prisma.lote.findFirst({ where: { nombre: 'Lote Q' } });
    expect(m.loteMadresId).toBe(madres.id);
    expect(await lineas(agent, P9)).toEqual([['Lote Q · terneros oct', 'Terneros', 10]]);
    // Todavía quedan las terneras: las madres siguen paridas.
    expect((await lineas(agent, P12)).find((l) => l[0] === 'Lote Q')).toEqual(['Lote Q', 'Vaquillonas paridas', 20]);

    const r = await cargar(agent, proceso.id, 'DESTETE', { fecha: '2026-11-16', lineas: [{ loteId: terneras.id, destinoPotreroId: P9.id, pesoPromedioKg: 170 }] });
    expect((await lineas(agent, P12)).find((l) => l[0] === 'Lote Q')).toEqual(['Lote Q', 'Vacas de cría', 20]);
    expect(await prisma.procesoLote.findFirst({ where: { procesoId: proceso.id, loteId: madres.id } })).toMatchObject({ rol: 'LIBRES' });
    expect(r.ficha.embudo).toMatchObject({ destetados: 20, kgDestetados: 3500 });
  });

  it('una muerte de una ternera (con el + normal) cuenta en el embudo', async () => {
    const { agent, proceso, terneras } = await preparar();
    const muerte = await prisma.tipoMovimiento.findUnique({ where: { clave: 'MUERTE' } });
    const causa = await prisma.causaMovimiento.findUnique({ where: { codigo: 'CA-001' } });
    await agent.post(`${API}/entradas-salidas`).send({ tipoId: muerte.id, loteId: terneras.id, cabezas: 1, fecha: '2026-11-01', causaId: causa.id }).expect(201);
    expect((await ficha(agent, proceso.id)).embudo.muertesCrias).toBe(1);
  });

  it('un lote de crías se desteta entero y una sola vez', async () => {
    const { agent, proceso, terneros, P9 } = await preparar();
    await cargar(agent, proceso.id, 'DESTETE', { fecha: '2026-11-15', lineas: [{ loteId: terneros.id, destinoPotreroId: P9.id }] });
    expect((await cargar(agent, proceso.id, 'DESTETE', { fecha: '2026-11-16', lineas: [{ loteId: terneros.id, destinoPotreroId: P9.id }] }, 400)).errors[0]).toMatch(/no es parte del proceso|ya tiene su destete/);
  });
});

describe('cierre', () => {
  it('al destetar la última cría el proceso se cierra solo; al anular ese destete se vuelve a abrir', async () => {
    const { agent, proceso, terneros, terneras, P9 } = await preparar();
    await cargar(agent, proceso.id, 'DESTETE', { fecha: '2026-11-15', lineas: [{ loteId: terneros.id, destinoPotreroId: P9.id }] });
    expect((await ficha(agent, proceso.id)).proceso.estado).toBe('ABIERTO');
    const r = await cargar(agent, proceso.id, 'DESTETE', { fecha: '2026-11-16', lineas: [{ loteId: terneras.id, destinoPotreroId: P9.id }] });
    expect(r.ficha.proceso.estado).toBe('CERRADO');
    expect(r.ficha.etapa).toBe('TERMINADO');
    await anularCarga(agent, proceso.id, r.grupoId);
    const f = await ficha(agent, proceso.id);
    expect(f.proceso.estado).toBe('ABIERTO');
    expect(f.etapa).toBe('CRIA');
  });

  it('cerrar a mano, con nota, queda auditado', async () => {
    const { agent, proceso } = await preparar({ parir: false });
    const r = (await agent.post(`${API}/procesos/${proceso.id}/cerrar`).send({ nota: 'Se vendió todo' }).expect(200)).body;
    expect(r.proceso).toMatchObject({ estado: 'CERRADO', nota: 'Se vendió todo' });
    expect((await auditoria('PROCESO_CERRADO')).length).toBe(1);
    await agent.post(`${API}/procesos/${proceso.id}/etapas/FIN_PARICION`).send({ fecha: '2026-11-15' }).expect(409);
  });
});

describe('anular', () => {
  it('anular la parición deja los potreros como estaban y la etapa se puede volver a cargar', async () => {
    const { agent, proceso, Q, P12 } = await preparar({ parir: false });
    const r = await cargar(agent, proceso.id, 'PARICION', { fecha: '2026-10-12', lineas: [{ loteId: Q.id, madres: 5, machos: 3, hembras: 2 }] });
    await anularCarga(agent, proceso.id, r.grupoId);
    expect(await lineas(agent, P12)).toEqual([['Lote Q', 'Vaquillonas preñadas', 20]]);
    const f = await ficha(agent, proceso.id);
    expect(f.embudo.paridas).toBeNull();
    expect(f.lotes.filter((l) => l.activo).map((l) => [l.nombre, l.rol])).toEqual([['Lote Q', 'PRENADAS']]);
    expect(f.etapas.find((e) => e.clave === 'PARICION').cargas[0]).toMatchObject({ anulada: true, puedeAnular: false });
    // La reversión queda con fecha de hoy: lo nuevo va de hoy en adelante (como en el resto del stock).
    await cargar(agent, proceso.id, 'PARICION', { fecha: hoy(), lineas: [{ loteId: Q.id, madres: 5, machos: 3, hembras: 2 }] });
    expect((await auditoria('EVENTO_ANULADO')).length).toBe(1);
  });

  it('si después hubo otros cambios en esos potreros, no se anula (y no queda nada a medias)', async () => {
    const { agent, proceso, Q, P12, P9 } = await preparar({ parir: false });
    const r = await cargar(agent, proceso.id, 'PARICION', { fecha: '2026-10-12', lineas: [{ loteId: Q.id, madres: 5, machos: 3, hembras: 2 }] });
    const terneros = await prisma.lote.findFirst({ where: { nombre: 'Lote Q · terneros oct' } });
    await cargar(agent, proceso.id, 'DESTETE', { fecha: '2026-11-15', lineas: [{ loteId: terneros.id, destinoPotreroId: P9.id }] });
    expect((await anularCarga(agent, proceso.id, r.grupoId, 409)).body.errors[0]).toMatch(/otros cambios en P12/);
    expect(await prisma.eventoRegistro.count({ where: { grupoId: r.grupoId, anulado: true } })).toBe(0);
    expect((await lineas(agent, P12)).find((l) => l[0] === 'Lote Q')).toEqual(['Lote Q', 'Vaquillonas preñadas', 15]);
  });

  it('una carga del proceso no se anula desde Eventos', async () => {
    const { agent, proceso } = await preparar({ parir: false });
    const inicio = await prisma.eventoRegistro.findFirst({ where: { procesoId: proceso.id, etapa: 'INICIO' } });
    expect((await agent.post(`${API}/eventos-registro/grupo/${inicio.grupoId}/anular`).expect(400)).body.errors[0]).toMatch(/desde el proceso/);
  });

  it('anular el proceso con cargas que movieron animales no se puede', async () => {
    const { agent, proceso } = await preparar();
    expect((await agent.post(`${API}/procesos/${proceso.id}/anular`).expect(409)).body.errors[0]).toMatch(/movieron animales/);
    expect((await ficha(agent, proceso.id)).proceso.estado).toBe('ABIERTO');
  });

  it('anular un proceso sin movimientos', async () => {
    const { agent, proceso } = await preparar({ parir: false });
    const r = (await agent.post(`${API}/procesos/${proceso.id}/anular`).expect(200)).body;
    expect(r.proceso.estado).toBe('ANULADO');
    expect(await prisma.eventoRegistro.count({ where: { procesoId: proceso.id, anulado: false } })).toBe(0);
    expect((await auditoria('PROCESO_ANULADO')).length).toBe(1);
  });
});
