// Procesos con eventos sugeridos, fase 4 (docs/PECUARIA.md §9): el motor de
// sugerencias (procesos.sugerencias.js) con el ejemplo ficticio, y la API
// (cronograma en la ficha y descartar una sugerencia).
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { estadoDe, sugerencias, textoDe } from '../src/pecuaria/procesos.sugerencias.js';
import { PLAZOS_INICIALES } from '../src/pecuaria/procesos.plazos.js';
import { useTestDatabase } from './helpers.js';
import { auditoria, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const ancla = (etapa, loteId, fecha, cabezas, datos = {}, anulado = false) => ({ etapa, loteId, fecha, cabezas, datos, anulado });
const ENTORE = { modalidad: 'TOROS', estado: 'ABIERTO' };
// El ejemplo: entore del 01/12/2026 con 200 vacas (lote 1).
const inicio = [ancla('INICIO', 1, '2026-12-01', 200, { modalidad: 'TOROS' })];
const item = (r, clave) => r.items.find((i) => i.clave === clave);

describe('el cronograma del ejemplo', () => {
  it('recién empezado: inicio hecho, y fin, ecografía y parición con sus fechas', () => {
    const r = sugerencias({ proceso: ENTORE, anclas: inicio, hoy: '2026-12-10' });
    expect(r.items.map((i) => [i.clave, i.fecha, i.hasta ?? null, i.estado])).toEqual([
      ['INICIO', '2026-12-01', null, 'HECHA'],
      ['FIN_SERVICIO', '2027-03-01', null, 'PENDIENTE'],
      ['DIAGNOSTICO', '2027-03-31', null, 'PENDIENTE'],
      ['PARICION', '2027-09-10', '2027-12-09', 'PENDIENTE'],
    ]);
    expect(r.proxima).toMatchObject({ clave: 'FIN_SERVICIO', dias: 81, atrasada: false });
  });

  it('"Fin del entore: faltan 5 días (01/03/2027)", dentro del aviso', () => {
    const r = sugerencias({ proceso: ENTORE, anclas: inicio, hoy: '2027-02-24' });
    expect(r.proxima).toMatchObject({ clave: 'FIN_SERVICIO', estado: 'PROXIMA', titulo: 'Fin del entore: faltan 5 días (01/03/2027)' });
  });

  it('el día: "es hoy"; pasado sin cargar: atrasada', () => {
    expect(sugerencias({ proceso: ENTORE, anclas: inicio, hoy: '2027-03-01' }).proxima).toMatchObject({ estado: 'HOY', texto: 'es hoy (01/03/2027)' });
    const atrasada = sugerencias({ proceso: ENTORE, anclas: inicio, hoy: '2027-03-04' }).proxima;
    expect(atrasada).toMatchObject({ clave: 'FIN_SERVICIO', estado: 'ATRASADA', atrasada: true, dias: -3, texto: 'atrasada 3 días (01/03/2027)' });
  });

  it('la fecha real manda: con el fin el 05/03, la ecografía y la parición se corren', () => {
    const r = sugerencias({ proceso: ENTORE, anclas: [...inicio, ancla('FIN_SERVICIO', 1, '2027-03-05', 200)], hoy: '2027-03-06' });
    expect(item(r, 'FIN_SERVICIO')).toMatchObject({ estado: 'HECHA', real: '2027-03-05', fecha: '2027-03-01', texto: 'hecha el 05/03/2027' });
    expect(item(r, 'DIAGNOSTICO').fecha).toBe('2027-04-04');
    expect(item(r, 'PARICION')).toMatchObject({ fecha: '2027-09-10', hasta: '2027-12-13' });
    expect(r.proxima.clave).toBe('DIAGNOSTICO');
  });

  it('ecografía en dos días: después del primero faltan 100; después del segundo, hecha', () => {
    const fin = [...inicio, ancla('FIN_SERVICIO', 1, '2027-03-01', 200)];
    const dia1 = [...fin, ancla('DIAGNOSTICO', 1, '2027-03-31', 100, { prenadas: { sin: 85 }, vacias: 15 })];
    const r1 = sugerencias({ proceso: ENTORE, anclas: dia1, hoy: '2027-03-31' });
    expect(item(r1, 'DIAGNOSTICO')).toMatchObject({ estado: 'HOY', avance: 'faltan 100 por ecografiar', texto: 'es hoy (31/03/2027) · faltan 100 por ecografiar' });
    const dia2 = [...dia1, ancla('DIAGNOSTICO', 1, '2027-04-01', 100, { prenadas: { sin: 80 }, vacias: 20 })];
    const r2 = sugerencias({ proceso: ENTORE, anclas: dia2, hoy: '2027-04-01' });
    expect(item(r2, 'DIAGNOSTICO')).toMatchObject({ estado: 'HECHA', real: '2027-04-01' });
    expect(r2.proxima.clave).toBe('PARICION');
  });

  it('parición: en curso con lo que va, y por cada mes el nuevo entore y el destete', () => {
    const anclas = [
      ...inicio,
      ancla('FIN_SERVICIO', 1, '2027-03-01', 200),
      ancla('DIAGNOSTICO', 1, '2027-03-31', 200, { prenadas: { sin: 165 }, vacias: 35 }),
      ancla('PARICION', 2, '2027-09-15', 40, { madres: 40, machos: 21, hembras: 19 }),
    ];
    const lotes = [
      { loteId: 2, rol: 'PRENADAS', activo: true },
      { loteId: 3, rol: 'CRIAS', mes: '2027-09', activo: true },
    ];
    const r = sugerencias({ proceso: ENTORE, anclas, lotes, hoy: '2027-09-20' });
    expect(item(r, 'PARICION')).toMatchObject({ estado: 'HOY', texto: 'en curso hasta el 09/12/2027 · 40 paridas hasta ahora' });
    expect(item(r, 'NUEVO_ENTORE:2027-09')).toMatchObject({ nombre: 'Nuevo entore (paridas de sep)', fecha: '2027-11-24', estado: 'PENDIENTE' });
    expect(item(r, 'DESTETE:2027-09')).toMatchObject({ nombre: 'Destete (terneros de sep)', fecha: '2028-03-15' });
    expect(r.proxima.clave).toBe('PARICION');

    // El nuevo entore enganchado y el destete del lote de septiembre: hechos.
    const despues = sugerencias({
      proceso: ENTORE,
      anclas: [...anclas, ancla('DESTETE', 3, '2028-03-16', 39, { destetados: 39 })],
      lotes,
      siguientes: ['2027-11-25'],
      hoy: '2028-03-20',
    });
    expect(item(despues, 'NUEVO_ENTORE:2027-09')).toMatchObject({ estado: 'HECHA', real: '2027-11-25' });
    expect(item(despues, 'DESTETE:2027-09')).toMatchObject({ estado: 'HECHA', real: '2028-03-16' });
  });

  it('la ventana de parición pasada con preñadas sin parir: atrasada', () => {
    const r = sugerencias({ proceso: ENTORE, anclas: [...inicio, ancla('FIN_SERVICIO', 1, '2027-03-01', 200)], lotes: [{ loteId: 1, rol: 'PRENADAS', activo: true }], descartadas: ['DIAGNOSTICO'], hoy: '2027-12-20' });
    expect(item(r, 'PARICION')).toMatchObject({ estado: 'ATRASADA', texto: 'se pasó la fecha hace 11 días (10/09/2027 al 09/12/2027)' });
  });
});

describe('estados, descartadas y otros tipos', () => {
  it('una sugerencia descartada no es lo que sigue', () => {
    const r = sugerencias({ proceso: ENTORE, anclas: [...inicio, ancla('FIN_SERVICIO', 1, '2027-03-01', 200)], descartadas: ['DIAGNOSTICO'], hoy: '2027-04-10' });
    expect(item(r, 'DIAGNOSTICO')).toMatchObject({ estado: 'DESCARTADA', texto: 'descartada' });
    expect(r.proxima.clave).toBe('PARICION');
  });

  it('un proceso cerrado no tiene lo que sigue; las anuladas no cuentan', () => {
    expect(sugerencias({ proceso: { ...ENTORE, estado: 'CERRADO' }, anclas: inicio, hoy: '2027-01-01' }).proxima).toBeNull();
    const r = sugerencias({ proceso: ENTORE, anclas: [...inicio, ancla('FIN_SERVICIO', 1, '2027-03-01', 200, {}, true)], hoy: '2027-03-02' });
    expect(item(r, 'FIN_SERVICIO').estado).toBe('ATRASADA');
    expect(sugerencias({ proceso: ENTORE, anclas: [], hoy: '2027-01-01' })).toEqual({ items: [], proxima: null });
  });

  it('inseminación: sin fin del entore, una ecografía por tanda y la parición de tanda a tanda', () => {
    const iatf = { modalidad: 'IATF', estado: 'ABIERTO' };
    const anclas = [ancla('INICIO', 5, '2027-04-10', 30, { modalidad: 'IATF' }), ancla('INSEMINACION', 6, '2027-04-20', 20), ancla('DIAGNOSTICO', 5, '2027-05-10', 30, { prenadas: { sin: 22 }, vacias: 8 })];
    const r = sugerencias({ proceso: iatf, anclas, hoy: '2027-05-13' });
    expect(r.items.map((i) => [i.clave, i.fecha, i.estado])).toEqual([
      ['INICIO', '2027-04-10', 'HECHA'],
      ['DIAGNOSTICO:2027-04-10', '2027-05-10', 'HECHA'],
      ['DIAGNOSTICO:2027-04-20', '2027-05-20', 'PROXIMA'],
      ['PARICION', '2028-01-18', 'PENDIENTE'],
    ]);
    expect(item(r, 'DIAGNOSTICO:2027-04-20').nombre).toBe('Ecografía (tanda del 20/04)');
    expect(item(r, 'PARICION').hasta).toBe('2028-01-28');
    expect(r.proxima).toMatchObject({ clave: 'DIAGNOSTICO:2027-04-20', estado: 'PROXIMA' });
  });

  it('IATF con repaso de toros: el fin del servicio desde el repaso, y la ecografía del repaso desde el fin', () => {
    const anclas = [ancla('INICIO', 5, '2027-04-10', 30), ancla('FIN_INSEMINACION', 6, '2027-04-11', 10, { destino: 'REPASO' })];
    const r = sugerencias({ proceso: { modalidad: 'IATF', estado: 'ABIERTO' }, anclas, hoy: '2027-04-12' });
    expect(item(r, 'FIN_SERVICIO')).toMatchObject({ nombre: 'Fin del entore (repaso)', fecha: '2027-07-10' });
    expect(item(r, 'DIAGNOSTICO:2027-04-11')).toMatchObject({ nombre: 'Ecografía (repaso)', fecha: '2027-08-09' });
    expect(item(r, 'PARICION')).toMatchObject({ fecha: '2028-01-18', hasta: '2028-04-18' });
  });

  it('IATF con vacas apartadas sin inseminar: eso es lo que sigue', () => {
    const r = sugerencias({ proceso: { modalidad: 'IATF', estado: 'ABIERTO' }, anclas: [ancla('INICIO', 5, '2027-04-10', 30)], lotes: [{ loteId: 7, rol: 'SIN_SERVIR', activo: true }], hoy: '2027-04-11' });
    expect(r.proxima).toMatchObject({ clave: 'INSEMINACION', estado: 'HOY', avance: 'quedan vacas sin inseminar' });
    // Una sola tanda: la parición es una fecha, no una ventana de un día.
    expect(item(r, 'PARICION')).toMatchObject({ fecha: '2028-01-18' });
    expect(item(r, 'PARICION').hasta).toBeUndefined();
  });

  it('los plazos y avisos de Configuración cambian las fechas y cuándo avisa', () => {
    const plazos = { ...PLAZOS_INICIALES, FIN_SERVICIO: { ...PLAZOS_INICIALES.FIN_SERVICIO, plazo: 60, avisoDias: 10, nombre: 'Salida de los toros' } };
    const r = sugerencias({ proceso: ENTORE, anclas: inicio, plazos, hoy: '2027-01-20' });
    expect(r.proxima).toMatchObject({ clave: 'FIN_SERVICIO', fecha: '2027-01-30', estado: 'PROXIMA', titulo: 'Salida de los toros: faltan 10 días (30/01/2027)' });
  });

  it('estadoDe y textoDe: "falta 1 día" y la ventana antes de empezar', () => {
    expect(estadoDe({ fecha: '2027-03-01', avisoDias: 7, hoy: '2027-02-21' })).toBe('PENDIENTE');
    expect(estadoDe({ fecha: '2027-03-01', avisoDias: 7, hoy: '2027-02-22' })).toBe('PROXIMA');
    expect(textoDe({ estado: 'PROXIMA', fecha: '2027-03-01', hoy: '2027-02-28' })).toBe('falta 1 día (01/03/2027)');
    expect(textoDe({ estado: 'PENDIENTE', fecha: '2027-09-10', hasta: '2027-12-09', hoy: '2027-09-01' })).toBe('faltan 9 días (10/09/2027 al 09/12/2027)');
  });
});

describe('la API: cronograma en la ficha y descartar', () => {
  const API = '/api/pecuaria';
  async function preparar() {
    const base = await prepararCampo();
    base.cat['Vacas de cría'] = (await prisma.categoria.create({ data: { nombre: 'Vacas de cría', sexo: 'HEMBRA' } })).id;
    const p8 = await base.potrero('P8', { hectareas: 100, usoNombre: 'Campo natural', lotes: [['Lote W', 'Vacas de cría', 200, 420]] });
    const { proceso } = (await base.agent.post(`${API}/procesos`).send({ fecha: '2026-11-15', modalidad: 'TOROS', toros: 2, lineas: [{ loteId: p8.lote['Lote W'].id }] }).expect(201)).body;
    return { ...base, proceso };
  }

  it('la ficha trae el cronograma y lo que sigue; la lista, lo que sigue', async () => {
    const { agent, proceso, campo } = await preparar();
    const ficha = (await agent.get(`${API}/procesos/${proceso.id}`).expect(200)).body;
    expect(ficha.cronograma.map((i) => [i.clave, i.fecha])).toEqual([
      ['INICIO', '2026-11-15'],
      ['FIN_SERVICIO', '2027-02-13'],
      ['DIAGNOSTICO', '2027-03-15'],
      ['PARICION', '2027-08-25'],
    ]);
    expect(ficha.proxima).toMatchObject({ clave: 'FIN_SERVICIO', etapa: 'FIN_SERVICIO' });
    const lista = (await agent.get(`${API}/campos/${campo.id}/procesos`).expect(200)).body;
    expect(lista[0].proxima.titulo).toMatch(/^Fin del entore: /);
  });

  it('descartar y volver a activar, con auditoría; no se descarta el inicio ni lo hecho', async () => {
    const { agent, proceso } = await preparar();
    const url = `${API}/procesos/${proceso.id}/sugerencias`;
    const ficha = (await agent.post(url).send({ clave: 'DIAGNOSTICO', descartada: true }).expect(200)).body;
    expect(ficha.cronograma.find((i) => i.clave === 'DIAGNOSTICO').estado).toBe('DESCARTADA');
    const [fila] = await auditoria('PROCESO_SUGERENCIA');
    expect(fila.detalle).toMatchObject({ clave: 'DIAGNOSTICO', nombre: 'Ecografía', descartada: true });
    const otra = (await agent.post(url).send({ clave: 'DIAGNOSTICO', descartada: false }).expect(200)).body;
    expect(otra.cronograma.find((i) => i.clave === 'DIAGNOSTICO').estado).not.toBe('DESCARTADA');
    expect((await agent.post(url).send({ clave: 'INICIO', descartada: true }).expect(400)).body.errors[0]).toMatch(/no está en el cronograma/);
    expect((await agent.post(url).send({ clave: 'DESTETE:2027-09', descartada: true }).expect(400)).body.errors[0]).toMatch(/no está en el cronograma/);
    await agent.post(url).send({ clave: 'cualquiera', descartada: true }).expect(400);
  });
});
