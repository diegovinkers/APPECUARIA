// Procesos, ajustes del 20/11 (docs/superpowers/specs/2026-11-20-procesos-ajustes-design.md):
// solo entore e IATF; repartir en potreros al empezar; la IATF por días, con
// las que quedan sin inseminar aparte; las vacías, volver a intentar o salir.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { useTestDatabase } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

// Campo ficticio EJ: P8 con lote V = 50 Vaquillonas de 300 kg; P12 y P13 vacíos.
async function preparar() {
  const base = await prepararCampo();
  base.cat['Vaquillonas preñadas'] = (await prisma.categoria.create({ data: { nombre: 'Vaquillonas preñadas', sexo: 'HEMBRA' } })).id;
  const p8 = await base.potrero('P8', { hectareas: 100, usoNombre: 'Campo natural', lotes: [['Lote V', 'Vaquillonas', 50, 300]] });
  const p12 = await base.potrero('P12', { hectareas: 40, usoNombre: 'Campo natural' });
  const p13 = await base.potrero('P13', { hectareas: 40, usoNombre: 'Campo natural' });
  return { ...base, V: p8.lote['Lote V'], P8: p8.potrero, P12: p12.potrero, P13: p13.potrero };
}

const crear = async (agent, body, esperado = 201) => (await agent.post(`${API}/procesos`).send(body).expect(esperado)).body;
const cargar = async (agent, id, etapa, body, esperado = 201) => (await agent.post(`${API}/procesos/${id}/etapas/${etapa}`).send(body).expect(esperado)).body;
const ficha = async (agent, id) => (await agent.get(`${API}/procesos/${id}`).expect(200)).body;
const lineas = async (agent, potrero) =>
  ((await agent.get(`${API}/potreros/${potrero.id}`).expect(200)).body.stock?.lineas ?? []).map((l) => [l.lote, l.cabezas]).sort();
const roles = async (procesoId) =>
  (await prisma.procesoLote.findMany({ where: { procesoId }, include: { lote: { select: { nombre: true } } }, orderBy: { id: 'asc' } })).map((pl) => [pl.lote.nombre, pl.rol]);

describe('modalidad', () => {
  it('la inseminación "común" ya no se ofrece: solo entore o IATF', async () => {
    const { agent, V } = await preparar();
    const r = await crear(agent, { fecha: '2026-11-15', modalidad: 'IA', lineas: [{ loteId: V.id }] }, 400);
    expect(r.errors[0]).toMatch(/entore con toros o IATF/);
  });
});

describe('repartir en potreros al empezar', () => {
  it('cada fila es una parte del mismo lote, en su potrero y en el proceso; lo que no se reparte se queda', async () => {
    const { agent, V, P8, P12, P13 } = await preparar();
    const body = {
      fecha: '2026-11-15',
      modalidad: 'TOROS',
      lineas: [{ loteId: V.id, reparto: [{ potreroId: P12.id, cabezas: 20, toros: 1 }, { potreroId: P13.id, cabezas: 20, toros: 1 }] }],
    };
    const previa = (await agent.post(`${API}/procesos/vista-previa`).send(body).expect(200)).body;
    expect(previa.pasos.map((p) => p.texto)).toEqual(['20 → P12, lote Lote V · P12 (Vaquillonas)', '20 → P13, lote Lote V · P13 (Vaquillonas)']);
    expect(await lineas(agent, P8)).toEqual([['Lote V', 50]]); // la vista previa no guarda

    const { proceso } = await crear(agent, body);
    expect(await lineas(agent, P8)).toEqual([['Lote V', 10]]);
    expect(await lineas(agent, P12)).toEqual([['Lote V · P12', 20]]);
    expect(await lineas(agent, P13)).toEqual([['Lote V · P13', 20]]);
    expect(await roles(proceso.id)).toEqual([
      ['Lote V', 'VIENTRES'],
      ['Lote V · P12', 'VIENTRES'],
      ['Lote V · P13', 'VIENTRES'],
    ]);
    const inicio = await prisma.eventoRegistro.findFirst({ where: { procesoId: proceso.id, etapa: 'INICIO' } });
    expect(inicio.cabezas).toBe(50);
    expect(inicio.datos.reparto).toEqual([
      { potrero: 'P12', cabezas: 20, toros: 1 },
      { potrero: 'P13', cabezas: 20, toros: 1 },
    ]);
    const f = await ficha(agent, proceso.id);
    expect(f.embudo.servidas).toBe(50);
    expect(f.etapas.find((e) => e.clave === 'INICIO').cargas[0].movimientos).toHaveLength(2);
    // El fin del servicio, de todas las partes juntas.
    await cargar(agent, proceso.id, 'FIN_SERVICIO', { fecha: '2026-11-18' });
    expect((await ficha(agent, proceso.id)).etapa).toBe('ESPERA_DIAGNOSTICO');
  });

  it('si se reparten todas, la última fila se lleva el lote entero', async () => {
    const { agent, V, P8, P12, P13 } = await preparar();
    await crear(agent, { fecha: '2026-11-15', modalidad: 'TOROS', lineas: [{ loteId: V.id, reparto: [{ potreroId: P12.id, cabezas: 30 }, { potreroId: P13.id, cabezas: 20 }] }] });
    expect(await lineas(agent, P8)).toEqual([]);
    expect(await lineas(agent, P12)).toEqual([['Lote V · P12', 30]]);
    expect(await lineas(agent, P13)).toEqual([['Lote V', 20]]);
  });

  it('no se puede repartir más de las que entran, ni al mismo potrero, ni dos veces al mismo', async () => {
    const { agent, V, P8, P12 } = await preparar();
    const con = (reparto, cabezas) => ({ fecha: '2026-11-15', modalidad: 'TOROS', lineas: [{ loteId: V.id, ...(cabezas && { cabezas }), reparto }] });
    expect((await crear(agent, con([{ potreroId: P12.id, cabezas: 41 }], 40), 400)).errors[0]).toMatch(/Lote V.*40/);
    expect((await crear(agent, con([{ potreroId: P8.id, cabezas: 10 }]), 400)).errors[0]).toMatch(/ya están/);
    expect((await crear(agent, con([{ potreroId: P12.id, cabezas: 10 }, { potreroId: P12.id, cabezas: 5 }]), 400)).errors[0]).toMatch(/dos veces/);
    expect(await lineas(agent, P8)).toEqual([['Lote V', 50]]);
  });

  it('anular el inicio deja los potreros como estaban', async () => {
    const { agent, V, P8, P12 } = await preparar();
    const { proceso, grupoId } = await crear(agent, { fecha: '2026-11-15', modalidad: 'TOROS', lineas: [{ loteId: V.id, reparto: [{ potreroId: P12.id, cabezas: 20 }] }] });
    await agent.post(`${API}/procesos/${proceso.id}/cargas/${grupoId}/anular`).expect(200);
    expect(await lineas(agent, P8)).toEqual([['Lote V', 50]]);
    expect(await lineas(agent, P12)).toEqual([]);
    expect(await roles(proceso.id)).toEqual([['Lote V', 'VIENTRES']]);
  });
});

describe('IATF por días', () => {
  async function empezar() {
    const base = await preparar();
    const r = await crear(base.agent, { fecha: '2026-11-15', modalidad: 'IATF', lineas: [{ loteId: base.V.id, cabezas: 30 }] });
    return { ...base, proceso: r.proceso };
  }

  it('el primer día: las inseminadas a un lote aparte; el resto queda "sin inseminar"', async () => {
    const { agent, proceso, P8 } = await empezar();
    expect(await lineas(agent, P8)).toEqual([
      ['Lote V · IATF 15/11', 30],
      ['Lote V', 20],
    ]);
    expect(await roles(proceso.id)).toEqual([
      ['Lote V', 'SIN_SERVIR'],
      ['Lote V · IATF 15/11', 'VIENTRES'],
    ]);
    const f = await ficha(agent, proceso.id);
    expect(f.embudo.servidas).toBe(30);
    expect(f.proxima.etapa).toBe('INSEMINACION');
    expect(f.etapas.map((e) => e.clave)).toEqual(expect.arrayContaining(['INSEMINACION', 'FIN_INSEMINACION']));
  });

  it('otro día: de las sin inseminar, una parte (a otro potrero); y al terminar, las que quedan van al repaso', async () => {
    const { agent, proceso, V, P8, P12 } = await empezar();
    await cargar(agent, proceso.id, 'INSEMINACION', { fecha: '2026-11-16', lineas: [{ loteId: V.id, cabezas: 15, potreroId: P12.id }] });
    expect(await lineas(agent, P8)).toEqual([
      ['Lote V · IATF 15/11', 30],
      ['Lote V', 5],
    ]);
    expect(await lineas(agent, P12)).toEqual([['Lote V · IATF 16/11', 15]]);
    expect((await ficha(agent, proceso.id)).embudo.servidas).toBe(45);

    await cargar(agent, proceso.id, 'FIN_INSEMINACION', { fecha: '2026-11-16', lineas: [{ loteId: V.id, destino: 'REPASO' }] });
    const f = await ficha(agent, proceso.id);
    expect(f.embudo.servidas).toBe(50);
    expect(f.proxima.etapa).toBe('FIN_SERVICIO');
    expect((await roles(proceso.id)).find(([n]) => n === 'Lote V')[1]).toBe('VIENTRES');
  });

  it('si se inseminan todas las que quedaban, el lote pasa entero a servido', async () => {
    const { agent, proceso, V, P8 } = await empezar();
    await cargar(agent, proceso.id, 'INSEMINACION', { fecha: '2026-11-16', lineas: [{ loteId: V.id, cabezas: 20 }] });
    expect(await lineas(agent, P8)).toEqual([
      ['Lote V · IATF 15/11', 30],
      ['Lote V', 20],
    ]);
    expect((await roles(proceso.id)).find(([n]) => n === 'Lote V')[1]).toBe('VIENTRES');
    expect((await ficha(agent, proceso.id)).proxima.etapa).toBe('FIN_SERVICIO');
  });

  it('al terminar, las sin inseminar pueden salir del proceso (y moverse)', async () => {
    const { agent, proceso, V, P12 } = await empezar();
    await cargar(agent, proceso.id, 'FIN_INSEMINACION', { fecha: '2026-11-16', lineas: [{ loteId: V.id, destino: 'SALEN', potreroId: P12.id }] });
    expect(await lineas(agent, P12)).toEqual([['Lote V', 20]]);
    const pl = await prisma.procesoLote.findFirst({ where: { procesoId: proceso.id, loteId: V.id } });
    expect(pl.rol).toBe('LIBRES');
    expect(pl.hasta).not.toBeNull();
    expect((await ficha(agent, proceso.id)).embudo.servidas).toBe(30);
  });

  it('al terminar, hay que decir qué pasa con las sin inseminar', async () => {
    const { agent, proceso, V } = await empezar();
    const r = await cargar(agent, proceso.id, 'FIN_INSEMINACION', { fecha: '2026-11-16', lineas: [{ loteId: V.id }] }, 400);
    expect(r.errors[0]).toMatch(/repaso|salen/i);
  });

  it('desde Eventos, una inseminación que empieza un proceso es una IATF', async () => {
    const { agent, V } = await preparar();
    const tipo = await prisma.tipoMovimiento.findUnique({ where: { clave: 'INSEMINACION' } });
    await agent
      .post(`${API}/eventos-registro`)
      .send({ tipoId: tipo.id, fecha: '2026-11-15', nivel: 'LOTE', lineas: [{ loteId: V.id }], empezarServicio: {} })
      .expect(201);
    const p = await prisma.proceso.findFirst();
    expect(p.datos.modalidad).toBe('IATF');
  });
});

describe('las vacías: volver a intentar o solo moverlas', () => {
  async function diagnosticado(decisionVacias) {
    const base = await preparar();
    const { proceso } = await crear(base.agent, { fecha: '2026-11-01', modalidad: 'TOROS', lineas: [{ loteId: base.V.id }] });
    await cargar(base.agent, proceso.id, 'FIN_SERVICIO', { fecha: '2026-11-10' });
    const body = {
      fecha: '2026-11-18',
      metodo: 'ECOGRAFIA',
      lineas: [{ loteId: base.V.id, prenadas: { sin: 40 }, vacias: 10 }],
      decision: [{ loteId: base.V.id, grupos: [{ clave: 'vacias', ...decisionVacias(base) }] }],
    };
    const r = await cargar(base.agent, proceso.id, 'DIAGNOSTICO', body);
    return { ...base, proceso, r };
  }

  it('volver a intentar: van a otro potrero y quedan para el próximo servicio (primero en la lista)', async () => {
    const { agent, proceso, P12, r } = await diagnosticado(({ P12: p }) => ({ destino: { reentore: true, potreroId: p.id } }));
    expect(await lineas(agent, P12)).toEqual([['Lote V · vacías', 10]]);
    const pl = (await prisma.procesoLote.findMany({ where: { procesoId: proceso.id }, include: { lote: true } })).find((x) => x.lote.nombre === 'Lote V · vacías');
    expect(pl).toMatchObject({ rol: 'VACIAS', destino: 'REENTORE' });
    expect(r.ficha.pendientes).toEqual([]);
    const lista = (await agent.get(`${API}/procesos`).expect(200)).body;
    expect(lista[0].loteIds).not.toContain(pl.loteId);
    expect(lista[0].reentoreIds).toEqual([pl.loteId]);
  });

  it('solo moverlas: van al potrero, pueden cambiar de categoría y salen del proceso', async () => {
    const { agent, proceso, P12, cat, r } = await diagnosticado(({ P12: p, cat: c }) => ({ destino: { salen: true, potreroId: p.id }, categoriaId: c['Vacas de cría'] ?? c.Vaquillonas }));
    expect((await lineas(agent, P12)).map(([, n]) => n)).toEqual([10]);
    const pl = (await prisma.procesoLote.findMany({ where: { procesoId: proceso.id }, include: { lote: true } })).find((x) => x.lote.potreroId === P12.id);
    expect(pl.rol).toBe('LIBRES');
    expect(pl.hasta).not.toBeNull();
    expect(pl.lote.categoriaId).toBe(cat['Vacas de cría'] ?? cat.Vaquillonas);
    expect(r.ficha.pendientes).toEqual([]);
  });
});
