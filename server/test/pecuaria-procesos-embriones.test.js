// Transferencia de embriones (26/11, docs/superpowers/prompts/2026-11-26-embriones.md):
// la tercera forma de servicio. Embriones Wagyu comprados, en receptoras.
//   - como la IATF: por tandas, transferidas y no transferidas en potreros
//     distintos, una ecografía por tanda, las vacías al toro una sola vez;
//   - las no aptas van al toro el mismo día (VACIAS con destino REENTORE);
//   - los embriones usados (uno por transferida, nunca menos) y de cuáles;
//   - el parto a los 276 días (PARICION_TE, editable);
//   - los terneros a "Terneros/as Wagyu <mes>".
// Datos ficticios (Estancia Ejemplo). Las fechas van en el pasado.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { fotoActual } from '../src/pecuaria/lotes.js';
import { sugerencias } from '../src/pecuaria/procesos.sugerencias.js';
import { gruposDelProceso } from '../src/pecuaria/procesos.tablero.js';
import { embudo } from '../src/pecuaria/procesos.calculos.js';
import { embrionesDeLaCarga, normalizarModalidad, tipoDelServicio } from '../src/pecuaria/procesos.modalidad.js';
import { useTestDatabase } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

describe('lo puro', () => {
  it('modalidad, tipo y embriones de la carga', () => {
    expect([normalizarModalidad('TE'), normalizarModalidad('IA'), normalizarModalidad(undefined)]).toEqual(['TE', 'IATF', 'TOROS']);
    expect([tipoDelServicio('TE'), tipoDelServicio('IATF'), tipoDelServicio('TOROS')]).toEqual(['TRANSFERENCIA_EMBRIONES', 'INSEMINACION', 'ENTORE']);
    expect(embrionesDeLaCarga(undefined, 80)).toEqual({ embriones: { usados: 80 } });
    expect(embrionesDeLaCarga({ usados: 82, detalle: ' Wagyu, partida 3 ' }, 80)).toEqual({ embriones: { usados: 82, detalle: 'Wagyu, partida 3' } });
    expect(embrionesDeLaCarga({ usados: 70 }, 80).error).toMatch(/no pueden ser menos/);
  });

  it('el cronograma: ecografía a los 30 días y parto a los 276 de cada transferencia', () => {
    const r = sugerencias({
      proceso: { modalidad: 'TE', estado: 'ABIERTO' },
      anclas: [{ etapa: 'INICIO', loteId: 1, fecha: '2026-11-10', cabezas: 80, datos: { modalidad: 'TE' } }],
      lotes: [{ loteId: 1, rol: 'VIENTRES', activo: true }],
      hoy: '2026-11-26',
    });
    expect(r.items.map((i) => [i.clave, i.nombre, i.fecha, i.hasta ?? null])).toEqual([
      ['INICIO', 'Transferencia de embriones', '2026-11-10', null],
      ['DIAGNOSTICO', 'Ecografía', '2026-12-10', null],
      ['PARICION', 'Parición', '2027-08-13', null],
    ]);
    // Con su plazo editado.
    const otro = sugerencias({
      proceso: { modalidad: 'TE', estado: 'ABIERTO' },
      anclas: [{ etapa: 'INICIO', loteId: 1, fecha: '2026-11-10', cabezas: 80, datos: { modalidad: 'TE' } }],
      plazos: { PARICION_TE: { nombre: 'Parición (embriones)', plazo: 280, unidad: 'DIAS', desde: 'TRANSFERENCIA', avisoDias: 7, orden: 35 } },
      hoy: '2026-11-26',
    });
    expect(otro.items.find((i) => i.clave === 'PARICION').fecha).toBe('2027-08-17');
  });

  it('el tablero: la transferencia en la sección 1; las no aptas en Entore, "vienen de TE"', () => {
    const grupos = gruposDelProceso({
      modalidad: 'TE',
      fechaInicio: '2026-11-10',
      lotes: [
        { loteId: 1, rol: 'VIENTRES', cabezas: 80, potrero: 'P8' },
        { loteId: 2, rol: 'VACIAS', destino: 'REENTORE', cabezas: 23, potrero: 'P1' },
      ],
    });
    expect(grupos.map((g) => [g.seccion, g.tipo, g.cabezas, g.deIatf, g.vieneDe ?? null])).toEqual([
      ['iatf', 'VIENTRES', 80, false, null],
      ['entore', 'VACIAS_REENTORE', 23, true, 'TE'],
    ]);
    // Un entore armado con las vacías de una transferencia.
    const entore = gruposDelProceso({ modalidad: 'TOROS', deIatf: true, modalidadAnterior: 'TE', fechaInicio: '2026-11-12', lotes: [{ loteId: 2, rol: 'VIENTRES', cabezas: 23, potrero: 'P1' }] });
    expect(entore[0]).toMatchObject({ seccion: 'entore', deIatf: true, vieneDe: 'TE' });
    // Lo de una IATF sigue diciendo IATF.
    const deIatf = gruposDelProceso({ modalidad: 'TOROS', deIatf: true, modalidadAnterior: 'IATF', fechaInicio: '2026-11-12', lotes: [{ loteId: 2, rol: 'VIENTRES', cabezas: 23, potrero: 'P1' }] });
    expect(deIatf[0].vieneDe).toBe('IATF');
  });

  it('el embudo: embriones usados y no aptas', () => {
    const e = embudo([
      { etapa: 'INICIO', loteId: 1, fecha: '2026-11-10', cabezas: 80, datos: { modalidad: 'TE', embriones: { usados: 82 }, noAptas: 23 } },
      { etapa: 'TANDA', loteId: 3, fecha: '2026-11-20', cabezas: 10, datos: { modalidad: 'TE', embriones: { usados: 10 } } },
    ]);
    expect(e).toMatchObject({ servidas: 90, embriones: 92, noAptas: 23 });
    expect(embudo([{ etapa: 'INICIO', loteId: 1, fecha: '2026-11-10', cabezas: 80, datos: { modalidad: 'IATF' } }])).toMatchObject({ embriones: null, noAptas: 0 });
  });
});

// P1: Receptoras = 103 Vacas de cría · P8, P9, P11, P12 vacíos.
async function preparar() {
  const base = await prepararCampo();
  if (!base.cat['Vacas de cría']) base.cat['Vacas de cría'] = (await prisma.categoria.create({ data: { nombre: 'Vacas de cría', sexo: 'HEMBRA' } })).id;
  const f = '2025-07-01';
  const p1 = await base.potrero('P1', { hectareas: 120, usoNombre: 'Campo natural', fecha: f, lotes: [['Receptoras', 'Vacas de cría', 103, 430]] });
  const p2 = await base.potrero('P2', { hectareas: 80, usoNombre: 'Campo natural', fecha: f, lotes: [['Rodeo', 'Vacas de cría', 40, 430]] });
  const vacio = async (nombre) => (await base.potrero(nombre, { hectareas: 50, usoNombre: 'Campo natural', fecha: f })).potrero;
  return { ...base, Receptoras: p1.lote.Receptoras, Rodeo: p2.lote.Rodeo, P1: p1.potrero, P2: p2.potrero, P8: await vacio('P8'), P9: await vacio('P9'), P11: await vacio('P11'), P12: await vacio('P12') };
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
  const l = await prisma.lote.findFirst({ where: { nombre, activo: true }, include: { categoria: true } });
  if (!l) return null;
  const linea = (await fotoActual(prisma, l.potreroId))?.lineas.find((x) => x.loteId === l.id);
  return { id: l.id, cabezas: linea?.cabezas ?? 0, potreroId: l.potreroId, categoria: l.categoria.nombre };
}

const crear = async (agent, body, esperado = 201) => {
  const r = (await agent.post(`${API}/procesos`).send(body).expect(esperado)).body;
  return esperado === 201 ? r.proceso : r;
};
const previaCrear = async (agent, body, esperado = 200) => (await agent.post(`${API}/procesos/vista-previa`).send(body).expect(esperado)).body;
const etapa = async (agent, id, clave, body, esperado = 201) => (await agent.post(`${API}/procesos/${id}/etapas/${clave}`).send(body).expect(esperado)).body;
const ficha = async (agent, id) => (await agent.get(`${API}/procesos/${id}`).expect(200)).body;
const rol = (procesoId, loteId) => prisma.procesoLote.findUnique({ where: { procesoId_loteId: { procesoId, loteId } } });

describe('transferencia de embriones de punta a punta', () => {
  it('80 transferidas y 23 no aptas al toro → entore con las no aptas → ecografía → parición Wagyu → destete', async () => {
    const { agent, campo, Receptoras, Rodeo, P1, P8, P9, P11, P12 } = await preparar();
    const total = 103 + 40;
    const cuadra = async () => expect(Object.values(await enPotreros(campo.id)).reduce((s, n) => s + n, 0)).toBe(total);
    const te = (extra = {}, linea = {}) => ({ fecha: '2025-08-01', modalidad: 'TE', nombre: 'TE EJ', lineas: [{ loteId: Receptoras.id, cabezas: 80, ...linea }], ...extra });

    // Las transferidas y las no aptas no pueden quedar juntas.
    expect((await previaCrear(agent, te(), 400)).errors[0]).toMatch(/se transfieren 80 de 103: las transferidas y las 23 no aptas no pueden quedar en el mismo potrero/);
    // Menos embriones que transferidas: error. Embriones en un entore: error.
    expect((await previaCrear(agent, te({ embriones: { usados: 70 } }, { potreroId: P8.id }), 400)).errors[0]).toMatch(/los embriones usados no pueden ser menos/);
    expect((await previaCrear(agent, { ...te({ embriones: { usados: 82 } }, { potreroId: P8.id }), modalidad: 'TOROS' }, 400)).errors[0]).toMatch(/Los embriones van en una transferencia/);
    // La vista previa: la oración y los pasos.
    const previa = await previaCrear(agent, te({ embriones: { usados: 82, detalle: 'Wagyu, partida 3' } }, { potreroId: P8.id }));
    expect(previa.oracion).toMatch(/Transferencia de embriones de 1 lote \(80 cabezas\) con 82 embriones/);
    expect(previa.pasos.map((p) => p.texto)).toContain('23 no aptas en Receptoras: van al toro');

    // 1. La transferencia: las 80 a P8; las 23 no aptas quedan en P1, para el toro.
    const p = await crear(agent, te({ embriones: { usados: 82, detalle: 'Wagyu, partida 3' } }, { potreroId: P8.id }));
    expect(p.nombre).toBe('TE EJ');
    expect(await enPotreros(campo.id)).toMatchObject({ 'P1 Vacas de cría': 23, 'P8 Vacas de cría': 80 });
    const transferidas = await lote('Receptoras · TE 01/08');
    expect(transferidas).toMatchObject({ cabezas: 80, potreroId: P8.id });
    expect(await rol(p.id, Receptoras.id)).toMatchObject({ rol: 'VACIAS', destino: 'REENTORE' });
    expect(await rol(p.id, transferidas.id)).toMatchObject({ rol: 'VIENTRES' });
    const tipo = await prisma.eventoRegistro.findFirst({ where: { procesoId: p.id, etapa: 'INICIO' }, include: { tipo: true } });
    expect(tipo.tipo.clave).toBe('TRANSFERENCIA_EMBRIONES');

    let f = await ficha(agent, p.id);
    expect(f.embudo).toMatchObject({ servidas: 80, embriones: 82, noAptas: 23 });
    expect(f.etapas.find((e) => e.clave === 'INICIO').cargas[0].lineas[0].texto).toBe('Transferencia de embriones · 80 cab. · 82 embriones (Wagyu, partida 3) · 23 no aptas (al toro)');
    // Sin "otro día" ni "fin de la inseminación": las no aptas ya van al toro.
    expect(f.etapas.map((e) => e.clave)).not.toContain('INSEMINACION');
    expect(f.paraEnganchar).toEqual([{ loteId: Receptoras.id, lote: 'Receptoras', cabezas: 23 }]);
    expect(f.avisos).toEqual([]);
    expect(f.proxima).toMatchObject({ etapa: 'DIAGNOSTICO', fecha: '2025-08-31' });
    expect(f.cronograma.find((i) => i.clave === 'PARICION').fecha).toBe('2026-05-04');
    expect(f.meses).toEqual(['2026-05']);
    await cuadra();

    // La lista (el tablero): las transferidas en la sección 1, las no aptas en Entore.
    let [enLista] = (await agent.get(`${API}/procesos`).expect(200)).body;
    expect(enLista).toMatchObject({ modalidad: 'TE', reentoreIds: [Receptoras.id] });
    expect(enLista.grupos.map((g) => [g.seccion, g.tipo, g.cabezas, g.vieneDe ?? null])).toEqual([
      ['iatf', 'VIENTRES', 80, null],
      ['entore', 'VACIAS_REENTORE', 23, 'TE'],
    ]);

    // Otra tanda con el mismo lote: no (las no aptas van al toro).
    expect((await etapa(agent, p.id, 'TANDA', { fecha: '2025-08-03', lineas: [{ loteId: Receptoras.id }] }, 400)).errors[0]).toMatch(/las no aptas van al toro/);

    // 2. Las no aptas, a una IATF: no (una sola vez, con toros). A un entore: sí.
    expect((await crear(agent, { fecha: '2025-08-05', modalidad: 'IATF', lineas: [{ loteId: Receptoras.id }] }, 400)).errors[0]).toMatch(/vienen de la transferencia "TE EJ": se vuelven a servir una sola vez, en un entore con toros/);
    const entore = await crear(agent, { fecha: '2025-08-05', modalidad: 'TOROS', nombre: 'Entore no aptas EJ', lineas: [{ loteId: Receptoras.id }] });
    expect(await rol(p.id, Receptoras.id)).toMatchObject({ hasta: expect.any(Date) });
    expect((await ficha(agent, p.id)).enlaces.van.map((e) => e.texto)).toEqual(['23 vacas → entore "Entore no aptas EJ" (desde el 05/08)']);
    expect((await ficha(agent, entore.id)).enlaces.vienen.map((e) => e.texto)).toEqual(['23 vienen de la transferencia "TE EJ"']);
    const lista = (await agent.get(`${API}/procesos`).expect(200)).body;
    expect(lista.find((x) => x.id === entore.id).grupos[0]).toMatchObject({ seccion: 'entore', deIatf: true, vieneDe: 'TE' });

    // 3. Otra tanda de la transferencia, con otro lote: 40 de 40, con sus embriones.
    await etapa(agent, p.id, 'TANDA', { fecha: '2025-08-10', embriones: { usados: 40 }, lineas: [{ loteId: Rodeo.id }] });
    f = await ficha(agent, p.id);
    expect(f.embudo).toMatchObject({ servidas: 120, embriones: 122, noAptas: 23 });
    expect(f.cronograma.filter((i) => i.etapa === 'DIAGNOSTICO').map((i) => [i.clave, i.fecha])).toEqual([
      ['DIAGNOSTICO:2025-08-01', '2025-08-31'],
      ['DIAGNOSTICO:2025-08-10', '2025-09-09'],
    ]);
    expect(f.cronograma.find((i) => i.clave === 'PARICION')).toMatchObject({ fecha: '2026-05-04', hasta: '2026-05-13' });

    // 4. Ecografía de la primera tanda: 50 preñadas; las 30 vacías al toro (como en la IATF), a P9.
    await etapa(agent, p.id, 'DIAGNOSTICO', {
      fecha: '2025-09-01',
      lineas: [{ loteId: transferidas.id, prenadas: { sin: 50 }, vacias: 30 }],
      decision: [{ loteId: transferidas.id, grupos: [{ clave: 'vacias', destino: { reentore: true, potreroId: P9.id } }] }],
    });
    // Ecografía de la segunda: 25 preñadas; las 15 vacías a engorde, a P11.
    await etapa(agent, p.id, 'DIAGNOSTICO', {
      fecha: '2025-09-10',
      lineas: [{ loteId: Rodeo.id, prenadas: { sin: 25 }, vacias: 15 }],
      decision: [{ loteId: Rodeo.id, grupos: [{ clave: 'vacias', destino: { invernada: true, potreroId: P11.id } }] }],
    });
    expect(await enPotreros(campo.id)).toMatchObject({ 'P1 Vacas de cría': 23, 'P8 Vacas de cría': 50, 'P9 Vacas de cría': 30, 'P2 Vacas de cría': 25, 'P11 Vacas invernar': 15 });
    f = await ficha(agent, p.id);
    expect(f.etapa).toBe('PRENEZ');
    expect(f.embudo).toMatchObject({ servidas: 120, prenadas: 75, vacias: 45, porcentajes: { prenez: 63 } });
    await cuadra();

    // 5. Parición: los terneros son Wagyu, a su propio lote del mes.
    await etapa(agent, p.id, 'PARICION', { fecha: '2026-05-06', lineas: [{ loteId: transferidas.id, madres: 48, terneros: 48 }] });
    const wagyu = await lote('Terneros/as Wagyu may-2026');
    expect(wagyu).toMatchObject({ cabezas: 48, potreroId: P8.id, categoria: 'Terneros/as Wagyu' });
    expect(await prisma.categoria.findUnique({ where: { nombre: 'Terneros/as Wagyu' } })).toMatchObject({ sexo: null });
    // Otra parición del mismo mes (la otra tanda) va a su lote en su potrero.
    await etapa(agent, p.id, 'PARICION', { fecha: '2026-05-15', lineas: [{ loteId: Rodeo.id, madres: 24, terneros: 24 }] });
    expect(await enPotreros(campo.id)).toMatchObject({ 'P8 Terneros/as Wagyu': 48, 'P2 Terneros/as Wagyu': 24 });
    expect(await enPotreros(campo.id)).not.toHaveProperty('P8 Terneros/as');

    // 6. Destete de los terneros de P8, a P12.
    await etapa(agent, p.id, 'DESTETE', { fecha: '2026-11-10', lineas: [{ loteId: wagyu.id, destinoPotreroId: P12.id }] });
    expect(await enPotreros(campo.id)).toMatchObject({ 'P12 Terneros/as Wagyu': 48, 'P8 Vacas de cría': 50 });
    f = await ficha(agent, p.id);
    expect(f.embudo).toMatchObject({ paridas: 72, ternerosVivos: 72, destetados: 48 });
    expect(P1.id).toBeTruthy();
  });

  it('con todas aptas no hay no aptas; desde Eventos, una transferencia que empieza un proceso es TE', async () => {
    const { agent, Receptoras, P8 } = await preparar();
    const tipo = await prisma.tipoMovimiento.findUnique({ where: { clave: 'TRANSFERENCIA_EMBRIONES' } });
    expect(tipo).toMatchObject({ efecto: 'REGISTRO', sexo: 'HEMBRA' });
    await agent
      .post(`${API}/eventos-registro`)
      .send({ tipoId: tipo.id, fecha: '2025-08-01', nivel: 'LOTE', lineas: [{ loteId: Receptoras.id }], empezarServicio: {} })
      .expect(201);
    const p = await prisma.proceso.findFirst({ include: { lotes: true, registros: true } });
    expect(p.datos.modalidad).toBe('TE');
    expect(p.nombre).toMatch(/^Embriones 2025-26/);
    expect(p.lotes.map((l) => l.rol)).toEqual(['VIENTRES']);
    // Sin decir cuántos embriones: uno por transferida.
    expect(p.registros[0].datos).toMatchObject({ modalidad: 'TE', embriones: { usados: 103 } });
    expect(p.registros[0].datos.noAptas).toBeUndefined();
    expect(P8.id).toBeTruthy();
  });

  it('Configuración: el plazo del parto de los embriones se edita aparte', async () => {
    const { agent } = await preparar();
    const { body } = await agent.get(`${API}/procesos/configuracion`).expect(200);
    expect(body.etapas.find((e) => e.clave === 'PARICION_TE')).toMatchObject({ nombre: 'Parición (embriones)', plazo: 276, textoDesde: 'de cada día de transferencia de embriones' });
    await agent.put(`${API}/procesos/configuracion`).send({ etapas: [{ clave: 'PARICION_TE', plazo: 278 }] }).expect(200);
    const { Receptoras } = { Receptoras: await prisma.lote.findFirst({ where: { nombre: 'Receptoras' } }) };
    const p = await crear(agent, { fecha: '2025-08-01', modalidad: 'TE', lineas: [{ loteId: Receptoras.id }] });
    const f = await ficha(agent, p.id);
    expect(f.cronograma.find((i) => i.clave === 'PARICION').fecha).toBe('2026-05-06');
    // La IATF sigue con su plazo.
    expect((await agent.get(`${API}/procesos/configuracion`).expect(200)).body.etapas.find((e) => e.clave === 'PARICION').plazo).toBe(283);
  });
});
