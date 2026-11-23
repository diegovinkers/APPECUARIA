// Procesos, paso 4 (diseño §8): el diagnóstico separa preñadas y vacías, con
// la decisión de qué se hace con cada grupo, todo o nada; decidir después lo
// de las vacías (venta, invernada, reentore); la revisión del diagnóstico.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { useTestDatabase } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

// Campo ficticio EJ: P8 con lote V = 50 Vaquillonas de 300 kg; P12 vacío.
// Otra estancia OT con su potrero X1.
async function preparar() {
  const base = await prepararCampo();
  for (const nombre of ['Vaquillonas preñadas', 'Vaquillonas invernar']) {
    base.cat[nombre] = (await prisma.categoria.create({ data: { nombre, sexo: 'HEMBRA' } })).id;
  }
  const p8 = await base.potrero('P8', { hectareas: 100, usoNombre: 'Campo natural', lotes: [['Lote V', 'Vaquillonas', 50, 300]] });
  const p12 = await base.potrero('P12', { hectareas: 40, usoNombre: 'Campo natural' });
  const otra = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra' } });
  const x1 = await prisma.potrero.create({ data: { campoId: otra.id, nombre: 'X1', tipo: 'POTRERO' } });
  const V = p8.lote['Lote V'];
  const { proceso } = (
    await base.agent.post(`${API}/procesos`).send({ fecha: '2026-11-01', modalidad: 'TOROS', lineas: [{ loteId: V.id }] }).expect(201)
  ).body;
  await base.agent.post(`${API}/procesos/${proceso.id}/etapas/FIN_SERVICIO`).send({ fecha: '2026-11-10' }).expect(201);
  return { ...base, proceso, V, P8: p8.potrero, P12: p12.potrero, X1: x1 };
}

const PRENADAS = { '2027-10': 18, '2027-11': 15, '2027-12': 7 };
const diagnostico = (V, extra = {}) => ({ fecha: '2026-11-18', metodo: 'ECOGRAFIA', lineas: [{ loteId: V.id, prenadas: PRENADAS, vacias: 10 }], ...extra });
const cargar = async (agent, id, etapa, body, esperado = 201) => (await agent.post(`${API}/procesos/${id}/etapas/${etapa}`).send(body).expect(esperado)).body;
const lineas = async (agent, potrero) =>
  ((await agent.get(`${API}/potreros/${potrero.id}`).expect(200)).body.stock?.lineas ?? []).map((l) => [l.lote, l.categoria, l.cabezas]).sort();
const lotesDelProceso = (procesoId) =>
  prisma.procesoLote.findMany({ where: { procesoId }, include: { lote: { select: { nombre: true, raizId: true, activo: true } } }, orderBy: { id: 'asc' } });

describe('diagnóstico', () => {
  it('sin decisión: las preñadas y las vacías quedan en lotes separados, en el mismo potrero; las vacías, para decidir', async () => {
    const { agent, proceso, V, P8 } = await preparar();
    const r = await cargar(agent, proceso.id, 'DIAGNOSTICO', diagnostico(V));
    const ancla = await prisma.eventoRegistro.findFirst({ where: { procesoId: proceso.id, etapa: 'DIAGNOSTICO' } });
    expect(ancla.datos).toEqual({ metodo: 'ECOGRAFIA', prenadas: PRENADAS, vacias: 10 });
    expect(ancla.cabezas).toBe(50);
    // La categoría no cambia (fase 6): el lote se queda con el grupo más grande
    // (las preñadas) y las vacías van a una parte aparte, en el mismo potrero.
    expect(await lineas(agent, P8)).toEqual([
      ['Lote V · vacías', 'Vaquillonas', 10],
      ['Lote V', 'Vaquillonas', 40],
    ]);
    const roles = (await lotesDelProceso(proceso.id)).map((pl) => [pl.lote.nombre, pl.rol, pl.destino]);
    expect(roles).toEqual([
      ['Lote V', 'PRENADAS', null],
      ['Lote V · vacías', 'VACIAS', null],
    ]);
    const vacias = await prisma.lote.findFirst({ where: { nombre: 'Lote V · vacías' } });
    expect(r.ficha.pendientes).toEqual([{ tipo: 'DECIDIR_VACIAS', loteId: vacias.id, lote: 'Lote V · vacías', cabezas: 10 }]);
    expect(r.ficha.embudo).toMatchObject({ servidas: 50, prenadas: 40, vacias: 10 });
    expect(r.ficha.etapa).toBe('PRENEZ');
  });

  it('la ficha trae los meses de parición esperados y la categoría sugerida de cada lote', async () => {
    const { agent, proceso, V, cat } = await preparar();
    const f = (await agent.get(`${API}/procesos/${proceso.id}`).expect(200)).body;
    // Servicio del 01/11 al 10/11/2026 + 283 días: agosto de 2027.
    expect(f.meses).toEqual(['2027-08']);
    // La preñez no cambia la categoría (fase 6); la invernada sí sugiere otra.
    expect(f.lotes.find((l) => l.loteId === V.id).sugeridas).toMatchObject({ PRENADA: cat.Vaquillonas, VACIA: cat['Vaquillonas invernar'] });
  });

  it('con decisión: oct a P12, nov y dic se quedan, vacías después; los movimientos cuelgan del proceso', async () => {
    const { agent, proceso, V, P8, P12, cat } = await preparar();
    const prenada = cat['Vaquillonas preñadas'];
    await cargar(
      agent,
      proceso.id,
      'DIAGNOSTICO',
      diagnostico(V, {
        decision: [
          {
            loteId: V.id,
            grupos: [
              { clave: '2027-10', destino: { potreroId: P12.id }, categoriaId: prenada },
              { clave: '2027-11', destino: { potreroId: P8.id }, categoriaId: prenada },
              { clave: '2027-12', destino: { potreroId: P8.id }, categoriaId: prenada },
              { clave: 'vacias', destino: { despues: true } },
            ],
          },
        ],
      }),
    );
    expect(await lineas(agent, P12)).toEqual([['Lote V · preñadas oct', 'Vaquillonas preñadas', 18]]);
    expect(await lineas(agent, P8)).toEqual([
      ['Lote V · preñadas nov–dic', 'Vaquillonas preñadas', 22],
      ['Lote V', 'Vaquillonas', 10],
    ]);
    const pls = await lotesDelProceso(proceso.id);
    expect(pls.map((pl) => [pl.lote.nombre, pl.rol, pl.mes, pl.lote.raizId])).toEqual([
      ['Lote V', 'VACIAS', null, null],
      ['Lote V · preñadas oct', 'PRENADAS', '2027-10', V.id],
      ['Lote V · preñadas nov–dic', 'PRENADAS', null, V.id],
    ]);
    const ancla = await prisma.eventoRegistro.findFirst({ where: { procesoId: proceso.id, etapa: 'DIAGNOSTICO' } });
    const movs = await prisma.movimiento.findMany({ where: { procesoId: proceso.id }, include: { evento: true } });
    expect(movs).toHaveLength(2);
    expect(movs.every((m) => m.registroId === ancla.id && m.evento.tipo === 'PROCESO' && m.evento.grupoId === ancla.grupoId)).toBe(true);
    const f = (await agent.get(`${API}/procesos/${proceso.id}`).expect(200)).body;
    expect(f.etapas.find((e) => e.clave === 'DIAGNOSTICO').cargas[0].movimientos.map((m) => m.texto)).toEqual([
      '18 → P12, lote Lote V · preñadas oct (Vaquillonas preñadas)',
      '22 → P8, lote Lote V · preñadas nov–dic (Vaquillonas preñadas)',
    ]);
  });

  it('todo o nada: un grupo a un potrero de otra estancia no deja nada guardado', async () => {
    const { agent, proceso, V, P8, X1 } = await preparar();
    const versiones = await prisma.versionStock.count();
    const r = await cargar(agent, proceso.id, 'DIAGNOSTICO', diagnostico(V, { decision: [{ loteId: V.id, grupos: [{ clave: '2027-10', destino: { potreroId: X1.id } }] }] }), 400);
    expect(r.errors[0]).toMatch(/^Preñadas oct: /);
    expect(await prisma.eventoRegistro.count({ where: { etapa: 'DIAGNOSTICO' } })).toBe(0);
    expect(await prisma.movimiento.count({ where: { procesoId: proceso.id } })).toBe(0);
    expect(await prisma.versionStock.count()).toBe(versiones);
    expect(await lineas(agent, P8)).toEqual([['Lote V', 'Vaquillonas', 50]]);
  });

  it('las preñadas y vacías no pueden ser más que las del lote', async () => {
    const { agent, proceso, V } = await preparar();
    const r = await cargar(agent, proceso.id, 'DIAGNOSTICO', { fecha: '2026-11-18', lineas: [{ loteId: V.id, prenadas: { sin: 45 }, vacias: 10 }] }, 400);
    expect(r.errors[0]).toMatch(/50 cabezas/);
  });

  it('la vista previa dice los pasos y no guarda nada', async () => {
    const { agent, proceso, V } = await preparar();
    const previa = (await agent.post(`${API}/procesos/${proceso.id}/etapas/DIAGNOSTICO/vista-previa`).send(diagnostico(V)).expect(200)).body;
    expect(previa.oracion).toMatch(/50 cabezas/);
    expect(previa.pasos.map((p) => p.texto)).toEqual(['10 → P8, lote Lote V · vacías (Vaquillonas)', '10 vacías: las decidís después']);
    expect(await prisma.eventoRegistro.count({ where: { etapa: 'DIAGNOSTICO' } })).toBe(0);
    expect(await prisma.movimiento.count()).toBe(0);
  });

  it('un movimiento del proceso no se revierte suelto', async () => {
    const { agent, proceso, V } = await preparar();
    await cargar(agent, proceso.id, 'DIAGNOSTICO', diagnostico(V));
    const m = await prisma.movimiento.findFirst({ where: { procesoId: proceso.id } });
    expect((await agent.post(`${API}/movimientos/${m.id}/revertir`).expect(400)).body.errors[0]).toMatch(/parte del proceso/);
    expect((await agent.post(`${API}/eventos/${m.eventoId}/revertir`).expect(400)).body.errors[0]).toMatch(/parte del proceso/);
  });
});

describe('decidir lo de las vacías', () => {
  const decidir = async (agent, id, body, esperado = 201) => (await agent.post(`${API}/procesos/${id}/decision`).send(body).expect(esperado)).body;
  // Las vacías del diagnóstico quedan en su propia parte (la categoría no cambia).
  const vaciasDe = () => prisma.lote.findFirst({ where: { nombre: 'Lote V · vacías' } });

  it('venta: sale todo el lote y queda con destino venta', async () => {
    const { agent, proceso, V } = await preparar();
    await cargar(agent, proceso.id, 'DIAGNOSTICO', diagnostico(V));
    const vacias = await vaciasDe();
    const r = await decidir(agent, proceso.id, { fecha: '2026-11-19', lineas: [{ loteId: vacias.id, destino: { venta: { guia: 'G-100', precioVentaUsd: 900, precioVentaPor: 'CABEZA' } } }] });
    expect(r.ficha.pendientes).toEqual([]);
    expect(r.ficha.etapas.find((e) => e.clave === 'DECISION')).toMatchObject({ estado: 'HECHA' });
    // La decisión no aparece en la lista de eventos (es parte del proceso).
    const lista = (await agent.get(`${API}/movimientos`).query({ ver: 'eventos' }).expect(200)).body.eventos;
    expect(lista.some((e) => e.etapa === 'DECISION')).toBe(false);
    const venta = await prisma.movimiento.findFirst({ where: { procesoId: proceso.id, modo: 'SALIDA' }, include: { tipo: true } });
    expect(venta).toMatchObject({ cabezas: 10, guia: 'G-100', loteOrigenId: vacias.id });
    expect(venta.tipo.clave).toBe('VENTA');
    expect((await prisma.lote.findUnique({ where: { id: vacias.id } })).activo).toBe(false);
    const pl = await prisma.procesoLote.findFirst({ where: { procesoId: proceso.id, loteId: vacias.id } });
    expect(pl).toMatchObject({ destino: 'VENTA' });
    expect(pl.hasta).not.toBeNull();
  });

  it('invernada: cambian de categoría y salen del proceso', async () => {
    const { agent, proceso, V, cat } = await preparar();
    await cargar(agent, proceso.id, 'DIAGNOSTICO', diagnostico(V));
    const vacias = await vaciasDe();
    await decidir(agent, proceso.id, { fecha: '2026-11-19', lineas: [{ loteId: vacias.id, destino: { invernada: true }, categoriaId: cat['Vaquillonas invernar'] }] });
    expect((await prisma.lote.findUnique({ where: { id: vacias.id }, include: { categoria: true } })).categoria.nombre).toBe('Vaquillonas invernar');
    const pl = await prisma.procesoLote.findFirst({ where: { procesoId: proceso.id, loteId: vacias.id } });
    expect(pl).toMatchObject({ rol: 'LIBRES', destino: 'INVERNADA' });
    expect(pl.hasta).not.toBeNull();
  });

  it('reentore: quedan para el próximo servicio, que se vincula con este', async () => {
    const { agent, proceso, V } = await preparar();
    await cargar(agent, proceso.id, 'DIAGNOSTICO', diagnostico(V));
    const vacias = await vaciasDe();
    await decidir(agent, proceso.id, { fecha: '2026-11-19', lineas: [{ loteId: vacias.id, destino: { reentore: true } }] });
    expect(await prisma.procesoLote.findFirst({ where: { procesoId: proceso.id, loteId: vacias.id } })).toMatchObject({ rol: 'VACIAS', destino: 'REENTORE' });
    const otro = (await agent.post(`${API}/procesos`).send({ fecha: '2026-11-19', modalidad: 'TOROS', nombre: 'Reentore otoño', lineas: [{ loteId: vacias.id }] }).expect(201)).body;
    expect((await prisma.proceso.findUnique({ where: { id: otro.proceso.id } })).procesoAnteriorId).toBe(proceso.id);
    expect((await prisma.procesoLote.findFirst({ where: { procesoId: proceso.id, loteId: vacias.id } })).hasta).not.toBeNull();
  });

  it('un lote que no está para decidir da error', async () => {
    const { agent, proceso, V } = await preparar();
    const r = await decidir(agent, proceso.id, { fecha: '2026-11-19', lineas: [{ loteId: V.id, destino: { reentore: true } }] }, 400);
    expect(r.errors[0]).toMatch(/no tiene nada para decidir/);
  });
});

describe('revisión del diagnóstico', () => {
  it('"de 10 vacías, 2 estaban preñadas": pasan al lote de preñadas y el embudo se corrige; una segunda revisión da error', async () => {
    const { agent, proceso, V } = await preparar();
    await cargar(agent, proceso.id, 'DIAGNOSTICO', diagnostico(V));
    // Las preñadas se quedaron en Lote V; las vacías, en su parte (fase 6).
    const prenadas = V;
    const vacias = await prisma.lote.findFirst({ where: { nombre: 'Lote V · vacías' } });
    const r = await cargar(agent, proceso.id, 'REVISION', { fecha: '2026-11-19', lineas: [{ loteId: vacias.id, aPrenadas: 2, aLoteId: prenadas.id }] });
    expect(r.ficha.embudo).toMatchObject({ prenadas: 42, vacias: 8 });
    const lote = r.ficha.lotes.find((l) => l.loteId === prenadas.id);
    expect(lote.cabezas).toBe(42);
    const segunda = await cargar(agent, proceso.id, 'REVISION', { fecha: '2026-11-19', lineas: [{ loteId: vacias.id, aPrenadas: 1, aLoteId: prenadas.id }] }, 409);
    expect(segunda.errors[0]).toMatch(/ya tiene su revisión del diagnóstico/);
  });
});
