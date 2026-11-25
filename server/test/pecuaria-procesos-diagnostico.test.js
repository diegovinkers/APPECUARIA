// Procesos, paso 4 (diseño §8): el diagnóstico separa preñadas y vacías, con
// la decisión de qué se hace con cada grupo, todo o nada; la revisión del
// diagnóstico. Con las reglas del campo (25/11): las vacías tienen destino en
// el momento (entore con toros si es una IATF, o engorde) y no quedan con las
// preñadas; "Decidir" queda para lo cargado antes (vacías sin destino).
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { useTestDatabase } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

// Campo ficticio EJ: P8 con lote V = 50 Vaquillonas de 300 kg; P12 y P13 vacíos.
// Otra estancia OT con su potrero X1. Un entore (con su fin) o una IATF.
async function preparar(modalidad = 'TOROS') {
  const base = await prepararCampo();
  for (const nombre of ['Vaquillonas preñadas', 'Vaquillonas invernar']) {
    base.cat[nombre] = (await prisma.categoria.create({ data: { nombre, sexo: 'HEMBRA' } })).id;
  }
  const p8 = await base.potrero('P8', { hectareas: 100, usoNombre: 'Campo natural', lotes: [['Lote V', 'Vaquillonas', 50, 300]] });
  const p12 = await base.potrero('P12', { hectareas: 40, usoNombre: 'Campo natural' });
  const p13 = await base.potrero('P13', { hectareas: 40, usoNombre: 'Campo natural' });
  const otra = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra' } });
  const x1 = await prisma.potrero.create({ data: { campoId: otra.id, nombre: 'X1', tipo: 'POTRERO' } });
  const V = p8.lote['Lote V'];
  const { proceso } = (
    await base.agent.post(`${API}/procesos`).send({ fecha: '2026-11-01', modalidad, lineas: [{ loteId: V.id }] }).expect(201)
  ).body;
  if (modalidad === 'TOROS') await base.agent.post(`${API}/procesos/${proceso.id}/etapas/FIN_SERVICIO`).send({ fecha: '2026-11-10' }).expect(201);
  return { ...base, proceso, V, P8: p8.potrero, P12: p12.potrero, P13: p13.potrero, X1: x1 };
}

const PRENADAS = { '2027-10': 18, '2027-11': 15, '2027-12': 7 };
const diagnostico = (V, extra = {}) => ({ fecha: '2026-11-18', metodo: 'ECOGRAFIA', lineas: [{ loteId: V.id, prenadas: PRENADAS, vacias: 10 }], ...extra });
// Las vacías a engorde (o, en una IATF, para el entore) en P13.
const vaciasA = (V, destino) => ({ decision: [{ loteId: V.id, grupos: [{ clave: 'vacias', destino }] }] });
const cargar = async (agent, id, etapa, body, esperado = 201) => (await agent.post(`${API}/procesos/${id}/etapas/${etapa}`).send(body).expect(esperado)).body;
const lineas = async (agent, potrero) =>
  ((await agent.get(`${API}/potreros/${potrero.id}`).expect(200)).body.stock?.lineas ?? []).map((l) => [l.lote, l.categoria, l.cabezas]).sort();
const lotesDelProceso = (procesoId) =>
  prisma.procesoLote.findMany({ where: { procesoId }, include: { lote: { select: { nombre: true, raizId: true, activo: true } } }, orderBy: { id: 'asc' } });

describe('diagnóstico', () => {
  it('las vacías de un entore van a engorde en el momento: las preñadas se quedan, las vacías a otro potrero', async () => {
    const { agent, proceso, V, P8, P13 } = await preparar();
    // Sin decir qué pasa con las vacías: error (ya no hay "decidir después").
    expect((await cargar(agent, proceso.id, 'DIAGNOSTICO', diagnostico(V), 400)).errors[0]).toMatch(/Las vacías de un entore van a engorde: elegí el potrero/);
    const r = await cargar(agent, proceso.id, 'DIAGNOSTICO', diagnostico(V, vaciasA(V, { invernada: true, potreroId: P13.id })));
    const ancla = await prisma.eventoRegistro.findFirst({ where: { procesoId: proceso.id, etapa: 'DIAGNOSTICO' } });
    expect(ancla.datos).toEqual({ metodo: 'ECOGRAFIA', prenadas: PRENADAS, vacias: 10 });
    expect(ancla.cabezas).toBe(50);
    // La categoría de las preñadas no cambia (fase 6): el lote se queda con
    // ellas; las vacías van a engorde, con la categoría de invernar.
    expect(await lineas(agent, P8)).toEqual([['Lote V', 'Vaquillonas', 40]]);
    expect(await lineas(agent, P13)).toEqual([['Lote V · engorde', 'Vaquillonas invernar', 10]]);
    const roles = (await lotesDelProceso(proceso.id)).map((pl) => [pl.lote.nombre, pl.rol, pl.destino]);
    expect(roles).toEqual([
      ['Lote V', 'PRENADAS', null],
      ['Lote V · engorde', 'LIBRES', 'INVERNADA'],
    ]);
    expect(r.ficha.pendientes).toEqual([]);
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

  it('con decisión: oct a P12, nov y dic se quedan, vacías a engorde en P13; los movimientos cuelgan del proceso', async () => {
    const { agent, proceso, V, P8, P12, P13, cat } = await preparar();
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
              { clave: 'vacias', destino: { invernada: true, potreroId: P13.id } },
            ],
          },
        ],
      }),
    );
    // El lote se queda con nov y dic (en su potrero) y cambia de categoría al final.
    expect(await lineas(agent, P12)).toEqual([['Lote V · preñadas oct', 'Vaquillonas preñadas', 18]]);
    expect(await lineas(agent, P8)).toEqual([['Lote V', 'Vaquillonas preñadas', 22]]);
    expect(await lineas(agent, P13)).toEqual([['Lote V · engorde', 'Vaquillonas invernar', 10]]);
    const pls = await lotesDelProceso(proceso.id);
    expect(pls.map((pl) => [pl.lote.nombre, pl.rol, pl.mes, pl.lote.raizId])).toEqual([
      ['Lote V', 'PRENADAS', null, null],
      ['Lote V · preñadas oct', 'PRENADAS', '2027-10', V.id],
      ['Lote V · engorde', 'LIBRES', null, V.id],
    ]);
    const ancla = await prisma.eventoRegistro.findFirst({ where: { procesoId: proceso.id, etapa: 'DIAGNOSTICO' } });
    const movs = await prisma.movimiento.findMany({ where: { procesoId: proceso.id }, include: { evento: true } });
    expect(movs).toHaveLength(3);
    expect(movs.every((m) => m.registroId === ancla.id && m.evento.tipo === 'PROCESO' && m.evento.grupoId === ancla.grupoId)).toBe(true);
    const f = (await agent.get(`${API}/procesos/${proceso.id}`).expect(200)).body;
    expect(f.etapas.find((e) => e.clave === 'DIAGNOSTICO').cargas[0].movimientos.map((m) => m.texto).slice(0, 2)).toEqual([
      '18 → P12, lote Lote V · preñadas oct (Vaquillonas preñadas)',
      '10 → P13, lote Lote V · engorde (Vaquillonas invernar)',
    ]);
  });

  it('todo o nada: un grupo a un potrero de otra estancia no deja nada guardado', async () => {
    const { agent, proceso, V, P8, X1 } = await preparar();
    const versiones = await prisma.versionStock.count();
    const r = await cargar(agent, proceso.id, 'DIAGNOSTICO', diagnostico(V, { decision: [{ loteId: V.id, grupos: [{ clave: '2027-10', destino: { potreroId: X1.id } }] }] }), 400);
    expect(r.errors[0]).toMatch(/no es de esta estancia/);
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
    const { agent, proceso, V, P13 } = await preparar();
    const previa = (await agent.post(`${API}/procesos/${proceso.id}/etapas/DIAGNOSTICO/vista-previa`).send(diagnostico(V, vaciasA(V, { invernada: true, potreroId: P13.id }))).expect(200)).body;
    expect(previa.oracion).toMatch(/50 cabezas/);
    expect(previa.pasos.map((p) => p.texto)).toEqual(['10 → P13, lote Lote V · engorde (Vaquillonas invernar)', '10 vacías: a engorde, salen del proceso']);
    expect(await prisma.eventoRegistro.count({ where: { etapa: 'DIAGNOSTICO' } })).toBe(0);
    expect(await prisma.movimiento.count()).toBe(0);
  });

  it('un movimiento del proceso no se revierte suelto', async () => {
    const { agent, proceso, V, P13 } = await preparar();
    await cargar(agent, proceso.id, 'DIAGNOSTICO', diagnostico(V, vaciasA(V, { invernada: true, potreroId: P13.id })));
    const m = await prisma.movimiento.findFirst({ where: { procesoId: proceso.id } });
    expect((await agent.post(`${API}/movimientos/${m.id}/revertir`).expect(400)).body.errors[0]).toMatch(/parte del proceso/);
    expect((await agent.post(`${API}/eventos/${m.eventoId}/revertir`).expect(400)).body.errors[0]).toMatch(/parte del proceso/);
  });
});

describe('decidir lo de las vacías (lo cargado antes de las reglas del campo)', () => {
  const decidir = async (agent, id, body, esperado = 201) => (await agent.post(`${API}/procesos/${id}/decision`).send(body).expect(esperado)).body;
  // Una IATF cuyas vacías (en P13) quedaron sin destino, como las de antes del 25/11.
  async function conVaciasViejas() {
    const base = await preparar('IATF');
    await cargar(base.agent, base.proceso.id, 'DIAGNOSTICO', diagnostico(base.V, vaciasA(base.V, { reentore: true, potreroId: base.P13.id })));
    const vacias = await prisma.lote.findFirst({ where: { nombre: 'Lote V · vacías' } });
    await prisma.procesoLote.update({ where: { procesoId_loteId: { procesoId: base.proceso.id, loteId: vacias.id } }, data: { destino: null } });
    return { ...base, vacias };
  }

  it('la ficha las muestra para decidir; la venta y "solo moverlas" ya no van', async () => {
    const { agent, proceso, vacias } = await conVaciasViejas();
    const f = (await agent.get(`${API}/procesos/${proceso.id}`).expect(200)).body;
    expect(f.pendientes).toEqual([{ tipo: 'DECIDIR_VACIAS', loteId: vacias.id, lote: 'Lote V · vacías', cabezas: 10 }]);
    const r = await decidir(agent, proceso.id, { fecha: '2026-11-19', lineas: [{ loteId: vacias.id, destino: { venta: { guia: 'G-100', precioVentaUsd: 900, precioVentaPor: 'CABEZA' } } }] }, 400);
    expect(r.errors[0]).toMatch(/entore con toros o engorde/);
    await decidir(agent, proceso.id, { fecha: '2026-11-19', lineas: [{ loteId: vacias.id, destino: { salen: true } }] }, 400);
  });

  it('invernada: cambian de categoría y salen del proceso', async () => {
    const { agent, proceso, cat, vacias } = await conVaciasViejas();
    const r = await decidir(agent, proceso.id, { fecha: '2026-11-19', lineas: [{ loteId: vacias.id, destino: { invernada: true }, categoriaId: cat['Vaquillonas invernar'] }] });
    expect(r.ficha.pendientes).toEqual([]);
    expect(r.ficha.etapas.find((e) => e.clave === 'DECISION')).toMatchObject({ estado: 'HECHA' });
    // La decisión no aparece en la lista de eventos (es parte del proceso).
    const lista = (await agent.get(`${API}/movimientos`).query({ ver: 'eventos' }).expect(200)).body.eventos;
    expect(lista.some((e) => e.etapa === 'DECISION')).toBe(false);
    expect((await prisma.lote.findUnique({ where: { id: vacias.id }, include: { categoria: true } })).categoria.nombre).toBe('Vaquillonas invernar');
    const pl = await prisma.procesoLote.findFirst({ where: { procesoId: proceso.id, loteId: vacias.id } });
    expect(pl).toMatchObject({ rol: 'LIBRES', destino: 'INVERNADA' });
    expect(pl.hasta).not.toBeNull();
  });

  it('reentore (de una IATF): quedan para el próximo servicio, que se vincula con este', async () => {
    const { agent, proceso, vacias } = await conVaciasViejas();
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
  it('"de 10 vacías, 2 estaban preñadas": pasan solas al lote de preñadas y el embudo se corrige; una segunda revisión da error', async () => {
    const { agent, proceso, V, P13 } = await preparar('IATF');
    await cargar(agent, proceso.id, 'DIAGNOSTICO', diagnostico(V, vaciasA(V, { reentore: true, potreroId: P13.id })));
    // Las preñadas se quedaron en Lote V; las vacías, en su parte en P13.
    const prenadas = V;
    const vacias = await prisma.lote.findFirst({ where: { nombre: 'Lote V · vacías' } });
    // Sin elegir el lote: van al de preñadas de la familia (R1, ya no quedan con las vacías).
    const r = await cargar(agent, proceso.id, 'REVISION', { fecha: '2026-11-19', lineas: [{ loteId: vacias.id, aPrenadas: 2 }] });
    expect(r.ficha.embudo).toMatchObject({ prenadas: 42, vacias: 8 });
    const lote = r.ficha.lotes.find((l) => l.loteId === prenadas.id);
    expect(lote.cabezas).toBe(42);
    const segunda = await cargar(agent, proceso.id, 'REVISION', { fecha: '2026-11-19', lineas: [{ loteId: vacias.id, aPrenadas: 1, aLoteId: prenadas.id }] }, 409);
    expect(segunda.errors[0]).toMatch(/ya tiene su revisión del diagnóstico/);
  });
});
