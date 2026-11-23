// Procesos con eventos sugeridos, fase 3 (docs/PECUARIA.md §9): los plazos de
// cada etapa con las fechas del ejemplo, la configuración (plazos, avisos y
// nombres de los estados) y los toros uno por uno.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { seedPecuaria } from '../src/seed/seed.js';
import { PLAZOS_INICIALES, completarPlazos, fechaAviso, fechaPlazo, fechasDelPlan, sumarMeses } from '../src/pecuaria/procesos.plazos.js';
import { parametrosProceso } from '../src/pecuaria/procesos.service.js';
import { BOB, loggedAgent, useTestDatabase, usuarioCon } from './helpers.js';
import { auditoria, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

describe('las fechas del ejemplo (cuentas puras)', () => {
  it('entore del 01/12/2026: fin, ecografía y ventana de parición', () => {
    expect(fechasDelPlan({ modalidad: 'TOROS', inicio: '2026-12-01' })).toEqual({
      finEntore: '2027-03-01',
      ecografias: ['2027-03-31'],
      paricion: { desde: '2027-09-10', hasta: '2027-12-09' },
      porParto: [],
    });
  });

  it('tanda de parición del 15/09/2027: nuevo entore y destete', () => {
    const { porParto } = fechasDelPlan({ modalidad: 'TOROS', inicio: '2026-12-01', partos: ['2027-09-15'] });
    expect(porParto).toEqual([{ parto: '2027-09-15', nuevoEntore: '2027-11-24', destete: '2028-03-15' }]);
  });

  it('la fecha real manda: con el fin del entore el 05/03, lo que sigue se corre', () => {
    const plan = fechasDelPlan({ modalidad: 'TOROS', inicio: '2026-12-01', finReal: '2027-03-05' });
    expect(plan.finEntore).toBe('2027-03-05');
    expect(plan.ecografias).toEqual(['2027-04-04']);
    expect(plan.paricion).toEqual({ desde: '2027-09-10', hasta: '2027-12-13' });
  });

  it('inseminación: una ecografía por tanda, y la parición de la primera a la última tanda', () => {
    const plan = fechasDelPlan({ modalidad: 'IATF', inicio: '2027-04-10', tandas: ['2027-04-10', '2027-04-20'] });
    expect(plan.finEntore).toBeNull();
    expect(plan.ecografias).toEqual(['2027-05-10', '2027-05-20']);
    expect(plan.paricion).toEqual({ desde: '2028-01-18', hasta: '2028-01-28' });
  });

  it('los plazos editados cambian las fechas; el aviso es N días antes', () => {
    const plazos = completarPlazos([{ ...PLAZOS_INICIALES.FIN_SERVICIO, clave: 'FIN_SERVICIO', plazo: 60 }]);
    expect(fechasDelPlan({ modalidad: 'TOROS', inicio: '2026-12-01' }, plazos).finEntore).toBe('2027-01-30');
    expect(fechaAviso('2027-03-01', { avisoDias: 7 })).toBe('2027-02-22');
    expect(fechaPlazo(null, PLAZOS_INICIALES.DESTETE)).toBeNull();
  });

  it('sumar meses: si el mes no tiene el día, el último del mes', () => {
    expect(sumarMeses('2027-08-31', 6)).toBe('2028-02-29');
    expect(sumarMeses('2026-08-31', 6)).toBe('2027-02-28');
    expect(sumarMeses('2027-09-15', 6)).toBe('2028-03-15');
    expect(sumarMeses('2027-11-30', 2)).toBe('2028-01-30');
  });
});

describe('configuración de los procesos', () => {
  it('el seed crea los plazos y los estados, y no pisa lo editado', async () => {
    await seedPecuaria(prisma, () => {});
    expect(await prisma.etapaPlantilla.count()).toBe(5);
    expect(await prisma.estadoReproductivo.count()).toBe(7);
    await prisma.etapaPlantilla.update({ where: { tipoProceso_clave: { tipoProceso: 'REPRODUCTIVO', clave: 'DIAGNOSTICO' } }, data: { plazo: 40 } });
    await seedPecuaria(prisma, () => {});
    expect((await prisma.etapaPlantilla.findFirst({ where: { clave: 'DIAGNOSTICO' } })).plazo).toBe(40);
  });

  it('GET: las etapas en orden con su "desde", y los estados', async () => {
    const { agent } = await prepararCampo();
    const { body } = await agent.get(`${API}/procesos/configuracion`).expect(200);
    expect(body.etapas.map((e) => [e.clave, e.plazo, e.unidad, e.avisoDias])).toEqual([
      ['FIN_SERVICIO', 90, 'DIAS', 7],
      ['DIAGNOSTICO', 30, 'DIAS', 7],
      ['PARICION', 283, 'DIAS', 7],
      ['NUEVO_ENTORE', 70, 'DIAS', 7],
      ['DESTETE', 6, 'MESES', 7],
    ]);
    expect(body.etapas[0].textoDesde).toBe('del inicio del servicio');
    expect(body.estados.map((e) => e.nombre)).toEqual(['Sin servir', 'Servida', 'Preñada', 'Vacía', 'Parida con ternero al pie', 'Ternero al pie', 'Fuera del proceso']);
  });

  it('PUT guarda plazos, avisos y nombres juntos, audita lo que cambió y lo usan los procesos', async () => {
    const { agent } = await prepararCampo();
    const { body } = await agent
      .put(`${API}/procesos/configuracion`)
      .send({ etapas: [{ clave: 'DESTETE', plazo: 7, avisoDias: 10 }, { clave: 'PARICION', plazo: 285 }], estados: [{ rol: 'VACIAS', nombre: 'Falladas' }] })
      .expect(200);
    expect(body.etapas.find((e) => e.clave === 'DESTETE')).toMatchObject({ plazo: 7, avisoDias: 10, unidad: 'MESES' });
    expect(body.estados.find((e) => e.rol === 'VACIAS').nombre).toBe('Falladas');
    const [fila] = await auditoria('PROCESO_CONFIG_EDITADA');
    expect(fila.detalle).toEqual({
      antes: { DESTETE: { plazo: 6, avisoDias: 7 }, PARICION: { plazo: 283 }, VACIAS: { nombre: 'Vacía' } },
      despues: { DESTETE: { plazo: 7, avisoDias: 10 }, PARICION: { plazo: 285 }, VACIAS: { nombre: 'Falladas' } },
    });
    expect(await parametrosProceso()).toMatchObject({ gestacionDias: 285, lactanciaMeses: 7, diagnosticoDesdeDias: 30 });
  });

  it('sin cambios no audita', async () => {
    const { agent } = await prepararCampo();
    await agent.put(`${API}/procesos/configuracion`).send({ etapas: [{ clave: 'DESTETE', plazo: 6 }] }).expect(200);
    expect(await auditoria('PROCESO_CONFIG_EDITADA')).toHaveLength(0);
  });

  it('rechaza plazos fuera de rango, etapas o estados que no existen y nombres repetidos, sin guardar nada', async () => {
    const { agent } = await prepararCampo();
    const mal = async (cuerpo, texto) => {
      const { body } = await agent.put(`${API}/procesos/configuracion`).send(cuerpo).expect(400);
      expect(body.errors.join(' ')).toMatch(texto);
    };
    await mal({ etapas: [{ clave: 'DESTETE', plazo: 30 }] }, /de 1 a 24 meses/);
    await mal({ etapas: [{ clave: 'FIN_SERVICIO', plazo: 0 }] }, /de 1 a 400 días/);
    await mal({ etapas: [{ clave: 'FIN_SERVICIO', avisoDias: 90 }] }, /aviso va de 0 a 60/);
    await mal({ etapas: [{ clave: 'NO_EXISTE', plazo: 3 }] }, /No existe la etapa/);
    await mal({ estados: [{ rol: 'OTRO', nombre: 'x' }] }, /No existe el estado/);
    await mal({ etapas: [{ clave: 'FIN_SERVICIO', plazo: 80 }], estados: [{ rol: 'VACIAS', nombre: 'Preñada' }] }, /mismo nombre/);
    await mal({}, /No hay nada para guardar/);
    expect((await prisma.etapaPlantilla.findFirst({ where: { clave: 'FIN_SERVICIO' } })).plazo).toBe(90);
  });

  it('cambiarla pide EDITAR: quien solo registra recibe 403', async () => {
    await prepararCampo();
    await usuarioCon(BOB, { permisos: ['pecuaria:VER', 'pecuaria:CREAR'], todas: true });
    const bob = await loggedAgent(BOB);
    await bob.get(`${API}/procesos/configuracion`).expect(200);
    await bob.put(`${API}/procesos/configuracion`).send({ etapas: [{ clave: 'DESTETE', plazo: 5 }] }).expect(403);
  });
});

describe('toros uno por uno', () => {
  async function preparar() {
    const base = await prepararCampo();
    const toros = (await prisma.categoria.findFirst({ where: { nombre: 'Toros' } })) ?? (await prisma.categoria.create({ data: { nombre: 'Toros', sexo: 'MACHO' } }));
    base.cat.Toros = toros.id;
    const p3 = await base.potrero('P3', { hectareas: 20, usoNombre: 'Campo natural', lotes: [['Toros P3', 'Toros', 4, 800]] });
    const otro = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otra estancia' } });
    const loteOtro = await prisma.lote.create({ data: { campoId: otro.id, potreroId: (await prisma.potrero.create({ data: { campoId: otro.id, nombre: 'X1' } })).id, categoriaId: toros.id, nombre: 'Toros X1' } });
    return { ...base, lote: p3.lote['Toros P3'], otro, loteOtro };
  }

  it('alta con su lote, lista, y no se repite la identificación en la estancia', async () => {
    const { agent, campo, lote } = await preparar();
    const t = (await agent.post(`${API}/campos/${campo.id}/toros`).send({ identificacion: 'T-014', raza: 'Angus', genetica: 'Padre ficticio A', loteId: lote.id }).expect(201)).body;
    expect(t).toMatchObject({ identificacion: 'T-014', raza: 'Angus', activo: true, lote: { nombre: 'Toros P3', potrero: { nombre: 'P3' } }, enProceso: null });
    await agent.post(`${API}/campos/${campo.id}/toros`).send({ identificacion: 'T-022' }).expect(201);
    const { body } = await agent.post(`${API}/campos/${campo.id}/toros`).send({ identificacion: 'T-014' }).expect(409);
    expect(body.errors[0]).toMatch(/Ya hay un toro "T-014"/);
    const lista = (await agent.get(`${API}/campos/${campo.id}/toros`).expect(200)).body;
    expect(lista.map((x) => x.identificacion)).toEqual(['T-014', 'T-022']);
    const [fila] = await auditoria('TORO_CREADO');
    expect(fila.detalle).toMatchObject({ identificacion: 'T-014', lote: 'Toros P3' });
  });

  it('el lote tiene que ser de la misma estancia', async () => {
    const { agent, campo, loteOtro } = await preparar();
    const { body } = await agent.post(`${API}/campos/${campo.id}/toros`).send({ identificacion: 'T-1', loteId: loteOtro.id }).expect(400);
    expect(body.errors[0]).toMatch(/no es de esta estancia/);
  });

  it('editar: cambia el lote y la baja; los dados de baja salen de la lista salvo con ?todos=1; se audita', async () => {
    const { agent, campo, lote } = await preparar();
    const t = (await agent.post(`${API}/campos/${campo.id}/toros`).send({ identificacion: 'T-014' }).expect(201)).body;
    const editado = (await agent.patch(`${API}/toros/${t.id}`).send({ loteId: lote.id, raza: 'Brangus' }).expect(200)).body;
    expect(editado).toMatchObject({ raza: 'Brangus', lote: { id: lote.id } });
    await agent.patch(`${API}/toros/${t.id}`).send({ activo: false }).expect(200);
    expect((await agent.get(`${API}/campos/${campo.id}/toros`).expect(200)).body).toHaveLength(0);
    expect((await agent.get(`${API}/campos/${campo.id}/toros?todos=1`).expect(200)).body).toHaveLength(1);
    const filas = await auditoria('TORO_EDITADO');
    expect(filas[0].detalle).toEqual({ identificacion: 'T-014', antes: { lote: null, raza: null }, despues: { lote: 'Toros P3', raza: 'Brangus' } });
    expect(filas[1].detalle).toEqual({ identificacion: 'T-014', antes: { activo: true }, despues: { activo: false } });
  });

  it('alcance: un toro de otra estancia contesta 404', async () => {
    const { otro } = await preparar();
    const ajeno = await prisma.toro.create({ data: { campoId: otro.id, identificacion: 'T-9' } });
    await usuarioCon(BOB, { permisos: ['pecuaria:VER', 'pecuaria:EDITAR'], campoIds: [] });
    const bob = await loggedAgent(BOB);
    await bob.get(`${API}/campos/${otro.id}/toros`).expect(404);
    await bob.patch(`${API}/toros/${ajeno.id}`).send({ raza: 'X' }).expect(404);
  });
});
