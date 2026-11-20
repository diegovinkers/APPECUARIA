// Procesos (diseño docs/superpowers/specs/2026-11-20-procesos-design.md):
// crear un servicio (o uno en curso), las etapas del servicio (repaso, fin,
// aborto), la unicidad, los eventos sueltos que se cuelgan solos, la ficha,
// la lista con sus filtros, renombrar y el alcance por estancia.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { BOB, loggedAgent, useTestDatabase, usuarioCon } from './helpers.js';
import { auditoria, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

// Campo ficticio EJ:
//   P8:  lote V = 50 Vaquillonas · lote W = 30 Vacas de cría
//   P9:  lote N = 30 Novillos
//   P12: vacío
async function preparar() {
  const base = await prepararCampo();
  base.cat['Vacas de cría'] = (await prisma.categoria.create({ data: { nombre: 'Vacas de cría', sexo: 'HEMBRA' } })).id;
  const p8 = await base.potrero('P8', { hectareas: 100, usoNombre: 'Campo natural', lotes: [['Lote V', 'Vaquillonas', 50, 300], ['Lote W', 'Vacas de cría', 30, 420]] });
  const p9 = await base.potrero('P9', { hectareas: 50, usoNombre: 'Campo natural', lotes: [['Lote N', 'Novillos', 30, 350]] });
  const p12 = await base.potrero('P12', { hectareas: 40, usoNombre: 'Campo natural' });
  const tipos = Object.fromEntries((await base.agent.get(`${API}/tipos-movimiento`).expect(200)).body.map((t) => [t.clave, t]));
  return { ...base, tipos, P8: p8.potrero, P9: p9.potrero, P12: p12.potrero, V: p8.lote['Lote V'], W: p8.lote['Lote W'], N: p9.lote['Lote N'] };
}

const crear = async (agent, body, esperado = 201) => (await agent.post(`${API}/procesos`).send(body).expect(esperado)).body;
const etapa = async (agent, id, clave, body, esperado = 201) => (await agent.post(`${API}/procesos/${id}/etapas/${clave}`).send(body).expect(esperado)).body;
const ficha = async (agent, id) => (await agent.get(`${API}/procesos/${id}`).expect(200)).body;
const servicio = (V, extra = {}) => ({ fecha: '2026-11-15', modalidad: 'TOROS', toros: 2, lineas: [{ loteId: V.id }], ...extra });

describe('crear un servicio', () => {
  it('crea el proceso, su lote y el ancla del inicio, sin tocar el stock', async () => {
    const { agent, V, P8 } = await preparar();
    const versiones = await prisma.versionStock.count({ where: { potreroId: P8.id } });
    const { proceso } = await crear(agent, servicio(V));
    expect(proceso).toMatchObject({ nombre: 'Servicio 2026-27 · Vaquillonas', campania: '2026-27', estado: 'ABIERTO', fechaInicio: '2026-11-15' });
    const lotes = await prisma.procesoLote.findMany({ where: { procesoId: proceso.id } });
    expect(lotes).toHaveLength(1);
    expect(lotes[0]).toMatchObject({ loteId: V.id, rol: 'VIENTRES' });
    const anclas = await prisma.eventoRegistro.findMany({ where: { procesoId: proceso.id }, include: { tipo: true } });
    expect(anclas).toHaveLength(1);
    expect(anclas[0]).toMatchObject({ etapa: 'INICIO', loteId: V.id, cabezas: 50 });
    expect(anclas[0].tipo.clave).toBe('ENTORE');
    expect(await prisma.versionStock.count({ where: { potreroId: P8.id } })).toBe(versiones);
    const [fila] = await auditoria('PROCESO_CREADO');
    expect(fila).toMatchObject({ entidad: 'proceso', entidadId: String(proceso.id) });
  });

  it('la vista previa dice lo que va a hacer, sin guardar', async () => {
    const { agent, V } = await preparar();
    const previa = (await agent.post(`${API}/procesos/vista-previa`).send(servicio(V, { modalidad: 'IATF' })).expect(200)).body;
    expect(previa).toMatchObject({ nombre: 'Servicio 2026-27 · Vaquillonas', lotes: 1, cabezas: 50 });
    expect(previa.oracion).toMatch(/50 cabezas/);
    expect(await prisma.proceso.count()).toBe(0);
  });

  it('con IATF, el ancla es de inseminación; el nombre se puede elegir', async () => {
    const { agent, V, W } = await preparar();
    const { proceso } = await crear(agent, servicio(V, { modalidad: 'IATF', nombre: 'Vaquillonas IATF', lineas: [{ loteId: V.id }, { loteId: W.id, cabezas: 20 }] }));
    expect(proceso.nombre).toBe('Vaquillonas IATF');
    const anclas = await prisma.eventoRegistro.findMany({ where: { procesoId: proceso.id }, include: { tipo: true }, orderBy: { id: 'asc' } });
    expect(anclas.map((a) => [a.tipo.clave, a.cabezas, a.nivel])).toEqual([
      ['INSEMINACION', 50, 'LOTE'],
      ['INSEMINACION', 20, 'PARTE_LOTE'],
    ]);
  });

  it('no deja: un lote de machos, un lote que ya está en otro proceso abierto, ni un nombre repetido', async () => {
    const { agent, V, W, N } = await preparar();
    expect((await crear(agent, servicio(N), 400)).errors[0]).toMatch(/hembras/);
    await crear(agent, servicio(V));
    expect((await crear(agent, servicio(V), 409)).errors[0]).toMatch(/ya está en el proceso/);
    expect((await crear(agent, servicio(W, { nombre: 'Servicio 2026-27 · Vaquillonas' }), 400)).errors[0]).toMatch(/Ya hay un proceso/);
  });

  it('sin nombre, si el automático está ocupado le agrega un número', async () => {
    const { agent, V, potrero } = await preparar();
    await crear(agent, servicio(V));
    const otro = await potrero('P20', { lotes: [['Lote X', 'Vaquillonas', 10, null]] });
    const { proceso } = await crear(agent, servicio(otro.lote['Lote X']));
    expect(proceso.nombre).toBe('Servicio 2026-27 · Vaquillonas (2)');
  });
});

describe('etapas del servicio y unicidad', () => {
  it('fin del servicio: por defecto, a todos los lotes del proceso; una segunda vez da error', async () => {
    const { agent, V } = await preparar();
    const { proceso } = await crear(agent, servicio(V));
    const r = await etapa(agent, proceso.id, 'FIN_SERVICIO', { fecha: '2026-11-18' });
    expect(r.ficha.etapa).toBe('ESPERA_DIAGNOSTICO');
    expect((await etapa(agent, proceso.id, 'FIN_SERVICIO', { fecha: '2026-11-19' }, 409)).errors[0]).toMatch(/ya tiene su fin del servicio \(18\/11\/2026\)/);
    expect((await auditoria('PROCESO_ETAPA')).length).toBe(1);
  });

  it('dos fines a la vez: uno se guarda y el otro da 409, nunca 500', async () => {
    const { agent, V } = await preparar();
    const { proceso } = await crear(agent, servicio(V));
    const [a, b] = await Promise.all([
      agent.post(`${API}/procesos/${proceso.id}/etapas/FIN_SERVICIO`).send({ fecha: '2026-11-18' }),
      agent.post(`${API}/procesos/${proceso.id}/etapas/FIN_SERVICIO`).send({ fecha: '2026-11-18' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('una fecha anterior al inicio, o futura, da error', async () => {
    const { agent, V } = await preparar();
    const { proceso } = await crear(agent, servicio(V));
    expect((await etapa(agent, proceso.id, 'FIN_SERVICIO', { fecha: '2026-11-10' }, 400)).errors[0]).toMatch(/no puede ser anterior/);
    expect((await etapa(agent, proceso.id, 'FIN_SERVICIO', { fecha: '2099-01-01' }, 400)).errors[0]).toMatch(/futura/);
  });

  it('repaso y aborto; un lote que no es del proceso da error', async () => {
    const { agent, V, W } = await preparar();
    const { proceso } = await crear(agent, servicio(V));
    await etapa(agent, proceso.id, 'REPASO', { fecha: '2026-11-16', lineas: [{ loteId: V.id }] });
    expect((await etapa(agent, proceso.id, 'REPASO', { fecha: '2026-11-17', lineas: [{ loteId: W.id }] }, 400)).errors[0]).toMatch(/no es parte del proceso/);
    const f = await ficha(agent, proceso.id);
    expect(f.etapas.find((e) => e.clave === 'INICIO').cargas).toHaveLength(1);
    expect(f.etapas.find((e) => e.clave === 'REPASO')).toMatchObject({ estado: 'HECHA', fecha: '2026-11-16' });
  });
});

describe('desde Eventos', () => {
  it('Entore con "empezar un servicio" crea el proceso; después, los eventos de reproducción del lote se cuelgan solos', async () => {
    const { agent, tipos, V } = await preparar();
    const r = (await agent.post(`${API}/eventos-registro`).send({ tipoId: tipos.ENTORE.id, fecha: '2026-11-15', lineas: [{ loteId: V.id }], empezarServicio: {} }).expect(201)).body;
    expect(r.proceso).toMatchObject({ nombre: 'Servicio 2026-27 · Vaquillonas' });
    const procesoId = r.proceso.id;

    const repaso = (await agent.post(`${API}/eventos-registro`).send({ tipoId: tipos.ENTORE.id, fecha: '2026-11-16', lineas: [{ loteId: V.id }] }).expect(201)).body;
    expect(repaso.eventos[0]).toMatchObject({ proceso: { id: procesoId }, etapa: 'REPASO' });
    const eco = (await agent.post(`${API}/eventos-registro`).send({ tipoId: tipos.ECOGRAFIA.id, fecha: '2026-11-19', lineas: [{ loteId: V.id, prenadas: 40, vacias: 10 }] }).expect(201)).body;
    expect(eco.eventos[0]).toMatchObject({ proceso: { id: procesoId }, etapa: 'DIAGNOSTICO' });
    // Una segunda ecografía suelta no se cuelga como revisión: se hace desde el proceso.
    const otra = (await agent.post(`${API}/eventos-registro`).send({ tipoId: tipos.ECOGRAFIA.id, fecha: '2026-11-19', lineas: [{ loteId: V.id, prenadas: 40, vacias: 10 }] }).expect(409)).body;
    expect(otra.errors[0]).toMatch(/desde el proceso/);
    // Una vacuna no es de reproducción: sigue suelta.
    const vacuna = (await agent.post(`${API}/eventos-registro`).send({ tipoId: tipos.VACUNA_AFTOSA.id, lineas: [{ loteId: V.id }] }).expect(201)).body;
    expect(vacuna.eventos[0].proceso).toBeNull();
    // La parición no se anota suelta.
    await agent.post(`${API}/eventos-registro`).send({ tipoId: tipos.PARICION.id, lineas: [{ loteId: V.id }] }).expect(400);
    expect((await ficha(agent, procesoId)).embudo).toMatchObject({ servidas: 50, prenadas: 40 });
  });
});

describe('arrancar a mitad de camino', () => {
  it('con datos iniciales: el embudo los usa y la etapa queda en preñez', async () => {
    const { agent, W } = await preparar();
    const { proceso } = await crear(agent, {
      modalidad: 'TOROS',
      enCurso: { etapa: 'PARIENDO', inicio: '2025-12-15', fin: '2026-03-15', servidas: 90, prenadas: 81, vacias: 9, lotes: [{ loteId: W.id, rol: 'PRENADAS' }] },
    });
    expect(proceso).toMatchObject({ campania: '2025-26', fechaInicio: '2025-12-15' });
    const f = await ficha(agent, proceso.id);
    expect(f.embudo).toMatchObject({ servidas: 90, prenadas: 81, corto: '90 → 81 → — → —' });
    expect(f.etapa).toBe('PRENEZ');
    for (const clave of ['INICIO', 'FIN_SERVICIO', 'DIAGNOSTICO']) {
      const e = f.etapas.find((x) => x.clave === clave);
      expect(e.estado, clave).toBe('HECHA');
      expect(e.cargas[0].inicial, clave).toBe(true);
    }
    expect(f.lotes[0]).toMatchObject({ loteId: W.id, rol: 'PRENADAS', cabezas: 30 });
  });

  it('las preñadas no pueden ser más que las servidas', async () => {
    const { agent, W } = await preparar();
    const r = await crear(agent, { modalidad: 'TOROS', enCurso: { etapa: 'DIAGNOSTICADO', inicio: '2025-12-15', fin: '2026-03-15', servidas: 90, prenadas: 91, lotes: [{ loteId: W.id, rol: 'PRENADAS' }] } }, 400);
    expect(r.errors[0]).toMatch(/servidas/);
  });
});

describe('en las fichas del lote y del potrero', () => {
  it('dicen en qué proceso abierto están sus lotes', async () => {
    const { agent, V, P8, P9 } = await preparar();
    const { proceso } = await crear(agent, servicio(V));
    const lote = (await agent.get(`${API}/lotes/${V.id}`).expect(200)).body;
    expect(lote.procesos).toEqual([{ id: proceso.id, nombre: 'Servicio 2026-27 · Vaquillonas', rol: 'VIENTRES', etapa: 'SERVICIO', textoEtapa: 'En servicio' }]);
    const potrero = (await agent.get(`${API}/potreros/${P8.id}`).expect(200)).body;
    expect(potrero.procesos.map((p) => p.id)).toEqual([proceso.id]);
    expect((await agent.get(`${API}/potreros/${P9.id}`).expect(200)).body.procesos).toEqual([]);
  });
});

describe('lista, renombrar y alcance', () => {
  it('filtra por estado y campaña; con todas las estancias trae la sigla', async () => {
    const { agent, V, W } = await preparar();
    const { proceso } = await crear(agent, servicio(V));
    await crear(agent, { modalidad: 'TOROS', enCurso: { etapa: 'DIAGNOSTICADO', inicio: '2025-12-15', fin: '2026-03-15', servidas: 30, prenadas: 25, vacias: 5, lotes: [{ loteId: W.id, rol: 'PRENADAS' }] } });
    const todos = (await agent.get(`${API}/procesos`).expect(200)).body;
    expect(todos).toHaveLength(2);
    expect(todos.find((p) => p.id === proceso.id)).toMatchObject({ campo: { sigla: 'EJ' }, etapa: 'SERVICIO', embudoCorto: '50 → — → — → —', lotes: 1, cabezas: 50, loteIds: [V.id] });
    expect((await agent.get(`${API}/procesos`).query({ campania: '2026-27' }).expect(200)).body.map((p) => p.id)).toEqual([proceso.id]);
    expect((await agent.get(`${API}/procesos`).query({ estado: 'CERRADO' }).expect(200)).body).toEqual([]);
    expect((await agent.get(`${API}/procesos`).query({ etapa: 'PRENEZ' }).expect(200)).body).toHaveLength(1);
  });

  it('renombrar audita; un nombre repetido en la estancia da error', async () => {
    const { agent, V, W } = await preparar();
    const { proceso } = await crear(agent, servicio(V));
    await crear(agent, servicio(W, { nombre: 'Vacas 26-27' }));
    const r = (await agent.patch(`${API}/procesos/${proceso.id}`).send({ nombre: 'Vaquillonas EJ 26-27' }).expect(200)).body;
    expect(r.nombre).toBe('Vaquillonas EJ 26-27');
    expect((await auditoria('PROCESO_EDITADO'))[0].detalle).toMatchObject({ antes: { nombre: 'Servicio 2026-27 · Vaquillonas' }, despues: { nombre: 'Vaquillonas EJ 26-27' } });
    expect((await agent.patch(`${API}/procesos/${proceso.id}`).send({ nombre: 'Vacas 26-27' }).expect(400)).body.errors[0]).toMatch(/Ya hay un proceso/);
  });

  it('lo de otra estancia contesta 404 y no aparece en la lista', async () => {
    const { agent, V } = await preparar();
    const { proceso } = await crear(agent, servicio(V));
    const otra = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra' } });
    await usuarioCon(BOB, { permisos: ['pecuaria:VER', 'pecuaria:CREAR'], campoIds: [otra.id] });
    const bob = await loggedAgent(BOB);
    await bob.get(`${API}/procesos/${proceso.id}`).expect(404);
    await bob.post(`${API}/procesos/${proceso.id}/etapas/FIN_SERVICIO`).send({ fecha: '2026-11-18' }).expect(404);
    await bob.patch(`${API}/procesos/${proceso.id}`).send({ nombre: 'X' }).expect(404);
    await bob.post(`${API}/procesos`).send(servicio(V)).expect(404);
    expect((await bob.get(`${API}/procesos`).expect(200)).body).toEqual([]);
  });
});

describe('eventos sueltos y el "+" normal', () => {
  it('una ecografía suelta de un lote, de antes del proceso, se puede sumar como diagnóstico; si ya tiene, no', async () => {
    const { agent, tipos, V } = await preparar();
    const eco = (await agent.post(`${API}/eventos-registro`).send({ tipoId: tipos.ECOGRAFIA.id, fecha: '2026-11-14', lineas: [{ loteId: V.id, prenadas: 40, vacias: 10 }] }).expect(201)).body;
    expect(eco.eventos[0].proceso).toBeNull();
    const { proceso } = await crear(agent, servicio(V, { fecha: '2026-11-10' }));
    const sueltos = (await agent.get(`${API}/procesos/${proceso.id}/sueltos`).expect(200)).body;
    expect(sueltos.map((e) => [e.id, e.tipo.clave, e.etapa])).toEqual([[eco.eventos[0].id, 'ECOGRAFIA', 'DIAGNOSTICO']]);
    const r = (await agent.post(`${API}/procesos/${proceso.id}/asociar`).send({ registroIds: [eco.eventos[0].id] }).expect(200)).body;
    expect(r.ficha.embudo).toMatchObject({ prenadas: 40, vacias: 10 });
    expect((await agent.get(`${API}/procesos/${proceso.id}/sueltos`).expect(200)).body).toEqual([]);
    // Otra ecografía suelta (de antes): el diagnóstico ya está.
    const otra = await prisma.eventoRegistro.create({
      data: { tipoId: tipos.ECOGRAFIA.id, fecha: new Date('2026-11-14T00:00:00Z'), campoId: V.campoId, potreroId: V.potreroId, loteId: V.id, categoriaId: V.categoriaId, cabezas: 50, datos: { prenadas: 41, vacias: 9 }, grupoId: 'g-suelta' },
    });
    expect((await agent.post(`${API}/procesos/${proceso.id}/asociar`).send({ registroIds: [otra.id] }).expect(409)).body.errors[0]).toMatch(/ya tiene su diagnóstico/);
  });

  it('una parte apartada con el + ("sigue siendo el mismo lote") queda en el proceso con el mismo rol', async () => {
    const { agent, V, P12 } = await preparar();
    const { proceso } = await crear(agent, servicio(V));
    await agent.post(`${API}/movimientos`).send({ loteOrigenId: V.id, cabezas: 20, destinoPotreroId: P12.id, modo: 'NUEVO', mismoLote: true }).expect(201);
    const parte = await prisma.lote.findFirst({ where: { raizId: V.id } });
    expect(await prisma.procesoLote.findFirst({ where: { procesoId: proceso.id, loteId: parte.id } })).toMatchObject({ rol: 'VIENTRES' });
  });

  it('sumar un lote del proceso a uno de afuera avisa; después la ficha lo muestra como que salió', async () => {
    const { agent, V, W } = await preparar();
    const { proceso } = await crear(agent, servicio(V));
    const cuerpo = { loteOrigenId: V.id, cabezas: 50, destinoPotreroId: V.potreroId, modo: 'SUMAR', loteDestinoId: W.id };
    const previa = (await agent.post(`${API}/movimientos/vista-previa`).send(cuerpo).expect(200)).body;
    expect(previa.avisos.join(' ')).toMatch(/está en el proceso "Servicio 2026-27 · Vaquillonas"/);
    await agent.post(`${API}/movimientos`).send(cuerpo).expect(201);
    const f = (await agent.get(`${API}/procesos/${proceso.id}`).expect(200)).body;
    expect(f.lotes.find((l) => l.loteId === V.id)).toMatchObject({ activo: false, salio: true });
  });
});
