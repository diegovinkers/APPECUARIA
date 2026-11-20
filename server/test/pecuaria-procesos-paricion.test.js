// Procesos, paso 5 (diseño §9): la parición por mes (madres a "paridas",
// terneros y terneras que entran con su madre, nacidos muertos, madres muertas
// al parto), los abortos que pasan a vacías y el fin de la parición.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { useTestDatabase } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

// Campo ficticio EJ, con el stock cargado el 01/09/2026:
//   P12: lote P = 18 Vaquillonas preñadas · lote Q = 20 Vaquillonas preñadas
// Un servicio en curso (del 15/12/2025 al 15/03/2026: pare de fines de
// septiembre a diciembre de 2026) con los dos lotes como preñadas.
async function preparar() {
  const base = await prepararCampo();
  base.cat['Vaquillonas preñadas'] = (await prisma.categoria.create({ data: { nombre: 'Vaquillonas preñadas', sexo: 'HEMBRA' } })).id;
  const p12 = await base.potrero('P12', { hectareas: 40, usoNombre: 'Campo natural', fecha: '2026-09-01', lotes: [['Lote P', 'Vaquillonas preñadas', 18, 380], ['Lote Q', 'Vaquillonas preñadas', 20, 380]] });
  const P = p12.lote['Lote P'];
  const Q = p12.lote['Lote Q'];
  const { proceso } = (
    await base.agent
      .post(`${API}/procesos`)
      .send({
        modalidad: 'TOROS',
        enCurso: { etapa: 'PARIENDO', inicio: '2025-12-15', fin: '2026-03-15', servidas: 40, prenadas: 38, vacias: 2, lotes: [{ loteId: P.id, rol: 'PRENADAS' }, { loteId: Q.id, rol: 'PRENADAS' }] },
      })
      .expect(201)
  ).body;
  return { ...base, proceso, P, Q, P12: p12.potrero };
}

const cargar = async (agent, id, etapa, body, esperado = 201) => (await agent.post(`${API}/procesos/${id}/etapas/${etapa}`).send(body).expect(esperado)).body;
const lineas = async (agent, potrero) =>
  ((await agent.get(`${API}/potreros/${potrero.id}`).expect(200)).body.stock?.lineas ?? []).map((l) => [l.lote, l.categoria, l.cabezas]).sort((a, b) => a[0].localeCompare(b[0]));
const parto = (lote, extra = {}) => ({ loteId: lote.id, madres: 6, machos: 3, hembras: 2, muertos: 1, ...extra });

describe('parición', () => {
  it('una carga: las madres pasan a paridas del mes y los terneros entran con ellas', async () => {
    const { agent, proceso, P, P12 } = await preparar();
    const r = await cargar(agent, proceso.id, 'PARICION', { fecha: '2026-10-12', lineas: [parto(P)] });
    expect(await lineas(agent, P12)).toEqual([
      ['Lote P', 'Vaquillonas preñadas', 12],
      ['Lote P · paridas oct', 'Vaquillonas paridas', 6],
      ['Lote P · terneras oct', 'Terneras chicas', 2],
      ['Lote P · terneros oct', 'Terneros chicos', 3],
      ['Lote Q', 'Vaquillonas preñadas', 20],
    ]);
    const paridas = await prisma.lote.findFirst({ where: { nombre: 'Lote P · paridas oct' } });
    expect(paridas.raizId).toBe(P.id);
    const nacimientos = await prisma.movimiento.findMany({ where: { procesoId: proceso.id, modo: 'ENTRADA' } });
    expect(nacimientos.map((m) => m.cabezas).sort()).toEqual([2, 3]);
    expect(nacimientos.every((m) => m.loteMadresId === paridas.id)).toBe(true);
    const ancla = await prisma.eventoRegistro.findFirst({ where: { procesoId: proceso.id, etapa: 'PARICION' } });
    expect(ancla.datos).toMatchObject({ madres: 6, machos: 3, hembras: 2, muertos: 1, madresMuertas: 0, mes: '2026-10' });
    const roles = (await prisma.procesoLote.findMany({ where: { procesoId: proceso.id }, include: { lote: true }, orderBy: { id: 'asc' } })).map((pl) => [pl.lote.nombre, pl.rol, pl.mes]);
    expect(roles).toEqual([
      ['Lote P', 'PRENADAS', null],
      ['Lote Q', 'PRENADAS', null],
      ['Lote P · paridas oct', 'PARIDAS', '2026-10'],
      ['Lote P · terneros oct', 'CRIAS', '2026-10'],
      ['Lote P · terneras oct', 'CRIAS', '2026-10'],
    ]);
    expect(r.ficha.embudo).toMatchObject({ paridas: 6, ternerosVivos: 5, nacidosMuertos: 1 });
    expect(r.ficha.etapa).toBe('PARICION');
  });

  it('otra carga del mismo mes se suma a los mismos lotes; una de otro mes forma los suyos', async () => {
    const { agent, proceso, P, P12 } = await preparar();
    await cargar(agent, proceso.id, 'PARICION', { fecha: '2026-10-12', lineas: [parto(P)] });
    await cargar(agent, proceso.id, 'PARICION', { fecha: '2026-10-20', lineas: [parto(P, { madres: 4, machos: 2, hembras: 2, muertos: 0 })] });
    await cargar(agent, proceso.id, 'PARICION', { fecha: '2026-11-05', lineas: [parto(P, { madres: 2, machos: 1, hembras: 1, muertos: 0 })] });
    expect(await lineas(agent, P12)).toEqual([
      ['Lote P', 'Vaquillonas preñadas', 6],
      ['Lote P · paridas nov', 'Vaquillonas paridas', 2],
      ['Lote P · paridas oct', 'Vaquillonas paridas', 10],
      ['Lote P · terneras nov', 'Terneras chicas', 1],
      ['Lote P · terneras oct', 'Terneras chicas', 4],
      ['Lote P · terneros nov', 'Terneros chicos', 1],
      ['Lote P · terneros oct', 'Terneros chicos', 5],
      ['Lote Q', 'Vaquillonas preñadas', 20],
    ]);
  });

  it('las madres muertas al parto salen como muerte, con la causa Parto', async () => {
    const { agent, proceso, P } = await preparar();
    await cargar(agent, proceso.id, 'PARICION', { fecha: '2026-10-12', lineas: [parto(P, { madresMuertas: 1 })] });
    const muerte = await prisma.movimiento.findFirst({ where: { procesoId: proceso.id, modo: 'SALIDA' }, include: { causa: true, tipo: true } });
    expect(muerte).toMatchObject({ cabezas: 1, loteOrigenId: P.id });
    expect(muerte.tipo.clave).toBe('MUERTE');
    expect(muerte.causa.codigo).toBe('PA-001');
  });

  it('acepta los números como texto ("6", "2,0", vacío = 0)', async () => {
    const { agent, proceso, P, P12 } = await preparar();
    await cargar(agent, proceso.id, 'PARICION', { fecha: '2026-10-12', lineas: [{ loteId: P.id, madres: '6', machos: '3', hembras: '3,0', muertos: '' }] });
    expect((await lineas(agent, P12)).find((l) => l[0] === 'Lote P')).toEqual(['Lote P', 'Vaquillonas preñadas', 12]);
  });

  it('si parieron todas en una sola carga y no hay paridas del mes, el lote cambia de categoría (no se crea otro)', async () => {
    const { agent, proceso, Q, P12 } = await preparar();
    await cargar(agent, proceso.id, 'PARICION', { fecha: '2026-10-12', lineas: [{ loteId: Q.id, madres: 20, machos: 10, hembras: 10 }] });
    const lq = (await lineas(agent, P12)).filter((l) => l[0].startsWith('Lote Q'));
    expect(lq).toEqual([
      ['Lote Q', 'Vaquillonas paridas', 20],
      ['Lote Q · terneras oct', 'Terneras chicas', 10],
      ['Lote Q · terneros oct', 'Terneros chicos', 10],
    ]);
    expect(await prisma.procesoLote.findFirst({ where: { procesoId: proceso.id, loteId: Q.id } })).toMatchObject({ rol: 'PARIDAS', mes: '2026-10' });
  });

  it('los controles: nacieron menos que las que parieron, o más madres que las que quedan sin parir', async () => {
    const { agent, proceso, P } = await preparar();
    expect((await cargar(agent, proceso.id, 'PARICION', { fecha: '2026-10-12', lineas: [parto(P, { machos: 1, hembras: 1, muertos: 0 })] }, 400)).errors[0]).toMatch(/parieron 6/);
    expect((await cargar(agent, proceso.id, 'PARICION', { fecha: '2026-10-12', lineas: [parto(P, { madres: 18, madresMuertas: 1, machos: 18 })] }, 400)).errors[0]).toMatch(/quedan 18 sin parir/);
  });

  it('mellizos: más terneros que madres es un aviso, no un error', async () => {
    const { agent, proceso, P } = await preparar();
    const previa = (await agent.post(`${API}/procesos/${proceso.id}/etapas/PARICION/vista-previa`).send({ fecha: '2026-10-12', lineas: [parto(P, { machos: 4, hembras: 3 })] }).expect(200)).body;
    expect(previa.avisos.join(' ')).toMatch(/mellizos/);
  });
});

describe('abortos y fin de la parición', () => {
  it('un aborto con "pasarlas a vacías": van a un lote de vacías del proceso', async () => {
    const { agent, proceso, P, P12 } = await preparar();
    const r = await cargar(agent, proceso.id, 'ABORTO', { fecha: '2026-10-01', aVacias: true, lineas: [{ loteId: P.id, cabezas: 2 }] });
    expect((await lineas(agent, P12)).filter((l) => l[0].startsWith('Lote P'))).toEqual([
      ['Lote P', 'Vaquillonas preñadas', 16],
      ['Lote P · vacías', 'Vaquillonas preñadas', 2],
    ]);
    expect(r.ficha.embudo.abortos).toBe(2);
    expect(r.ficha.pendientes.map((p) => [p.lote, p.cabezas])).toEqual([['Lote P · vacías', 2]]);
  });

  it('fin de la parición: las que no parieron pasan a vacías; el embudo las cuenta como falladas', async () => {
    const { agent, proceso, P, Q } = await preparar();
    await cargar(agent, proceso.id, 'PARICION', { fecha: '2026-10-12', lineas: [{ loteId: P.id, madres: 15, machos: 8, hembras: 7 }, { loteId: Q.id, madres: 20, machos: 10, hembras: 10 }] });
    const r = await cargar(agent, proceso.id, 'FIN_PARICION', { fecha: '2026-11-15', lineas: [{ loteId: P.id }] });
    expect(r.ficha.embudo).toMatchObject({ paridas: 35, falladas: 3 });
    expect(await prisma.procesoLote.findFirst({ where: { procesoId: proceso.id, loteId: P.id } })).toMatchObject({ rol: 'VACIAS', destino: null });
    expect(r.ficha.etapa).toBe('CRIA');
    expect(r.ficha.pendientes.map((p) => [p.lote, p.cabezas])).toEqual([['Lote P', 3]]);
  });

  it('una parición antes de tiempo es un aviso', async () => {
    const base = await prepararCampo();
    const p8 = await base.potrero('P8', { hectareas: 100, usoNombre: 'Campo natural', lotes: [['Lote V', 'Vaquillonas', 50, 300]] });
    const V = p8.lote['Lote V'];
    const { proceso } = (await base.agent.post(`${API}/procesos`).send({ fecha: '2026-11-01', modalidad: 'TOROS', lineas: [{ loteId: V.id }] }).expect(201)).body;
    const previa = (await base.agent.post(`${API}/procesos/${proceso.id}/etapas/PARICION/vista-previa`).send({ fecha: '2026-11-19', lineas: [{ loteId: V.id, madres: 1, machos: 1 }] }).expect(200)).body;
    expect(previa.avisos.join(' ')).toMatch(/faltan \d+ días para la fecha probable/);
  });
});
