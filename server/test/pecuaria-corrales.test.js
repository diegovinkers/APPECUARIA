// La tabla de Corrales (feedlot, fase 1, 25/11; docs/FEEDLOT.md §4): cada
// corral de un confinamiento en una fila, con días de encierre, peso de hoy,
// ganancia diaria, kilos ganados, cm de comedero por cabeza y salida.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { analisisFeedlot, resumenCorral, sumarDias } from '../src/pecuaria/feedlot.service.js';
import { useTestDatabase } from './helpers.js';
import { dia, hoy, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

// --- La función pura, con fechas fijas ---

const FX = { id: 9, sigla: 'FX', nombre: 'Feedlot Ejemplo' };
const HOY = '2026-11-10';
const etapas = { adaptacionDias: 20, engordeDias: 90, cicloDias: 120 };
const linea = (loteId, cabezas, extra = {}) => ({ loteId, lote: `L${loteId}`, categoriaId: 1, categoria: 'Novillos', cabezas, pesoPromedioKg: null, fechaEntrada: null, pesoEntradaKg: null, ...extra });
const filasDe = (metros, lineas) =>
  analisisFeedlot({ corrales: [{ id: 1, nombre: 'C1', metrosComedero: metros, campo: FX, fecha: HOY, lineas }], hoy: HOY, gmdKg: 1.5, cicloDias: 120 }).filas;

describe('resumenCorral (cálculo puro)', () => {
  it('un lote: días, etapa, peso de hoy, ganancia esperada, kilos ganados, cm por cabeza y salida', () => {
    // 100 cab que entraron el 01/10 con 300 kg y 30 m de comedero.
    const filas = filasDe(30, [linea(1, 100, { fechaEntrada: '2026-10-01', pesoEntradaKg: 300 })]);
    expect(filas[0].cmComederoPorCabeza).toBe(30);
    expect(resumenCorral(filas, { hoy: HOY, gmdKg: 1.5, etapas, cmObjetivo: 30 })).toMatchObject({
      cabezas: 100,
      diasEncierre: 40,
      fechaEntrada: '2026-10-01',
      etapa: 'ENGORDE',
      pesoEntradaKg: 300,
      pesoHoyKg: 360,
      pesoHoyAprox: true,
      gmdKg: 1.5,
      gmdReal: false,
      kgGanadosCab: 60,
      kgGanadosTotal: 6000,
      salidaProbable: '2027-01-29',
      diasParaSalida: 80,
      atrasado: false,
      cmPorCabeza: 30,
      cmObjetivo: 30,
      apretado: false,
      datosIncompletos: false,
    });
  });

  it('dos lotes: se pondera por cabezas, sale el que sale primero y queda atrasado si uno lo está', () => {
    // 60 cab hace 40 días con 300 kg; 40 cab hace 130 días con 250 kg. 20 m → 20 cm/cab.
    const filas = filasDe(20, [
      linea(1, 60, { fechaEntrada: '2026-10-01', pesoEntradaKg: 300 }),
      linea(2, 40, { fechaEntrada: '2026-07-03', pesoEntradaKg: 250 }),
    ]);
    const r = resumenCorral(filas, { hoy: HOY, gmdKg: 1.5, etapas, cmObjetivo: 30 });
    // (60 × 40 + 40 × 130) ÷ 100 = 76 días.
    expect(r.diasEncierre).toBe(76);
    expect(r.fechaEntrada).toBe('2026-07-03');
    // Pesos de hoy: 360 y 445 → (60 × 360 + 40 × 445) ÷ 100 = 394.
    expect(r.pesoHoyKg).toBe(394);
    expect(r.pesoEntradaKg).toBe(280);
    expect(r.kgGanadosTotal).toBe(60 * 60 + 40 * 195);
    expect(r.diasParaSalida).toBe(-10);
    expect(r.atrasado).toBe(true);
    expect(r.salidaCerca).toBe(false);
    expect(r).toMatchObject({ cmPorCabeza: 20, apretado: true });
  });

  it('con una pesada: la ganancia real; peso exacto solo si la pesada es de hoy', () => {
    const pesado = linea(1, 50, { fechaEntrada: '2026-10-01', pesoEntradaKg: 300, pesadas: [{ fecha: HOY, pesoKg: 370 }] });
    const r = resumenCorral(filasDe(null, [pesado]), { hoy: HOY, gmdKg: 1.5, etapas });
    // (370 − 300) ÷ 40 días = 1,75.
    expect(r).toMatchObject({ pesoHoyKg: 370, pesoHoyAprox: false, gmdKg: 1.75, gmdReal: true, kgGanadosCab: 70, cmPorCabeza: null, apretado: false });
  });

  it('sin fecha ni peso de entrada: lo que depende de ellos queda en null', () => {
    const r = resumenCorral(filasDe(40, [linea(1, 10)]), { hoy: HOY, gmdKg: 1.5, etapas });
    expect(r).toMatchObject({
      diasEncierre: null,
      etapa: 'SIN_FECHA',
      pesoHoyKg: null,
      gmdKg: null,
      kgGanadosCab: null,
      kgGanadosTotal: null,
      salidaProbable: null,
      cmPorCabeza: 400,
      datosIncompletos: true,
    });
  });
});

// --- La API ---

describe('GET potreros de un feedlot', () => {
  async function preparar() {
    const base = await prepararCampo();
    const fx = await prisma.campo.create({ data: { sigla: 'FX', nombre: 'Feedlot Ejemplo', tipo: 'CONFINAMIENTO', orden: 10 } });
    const C1 = await prisma.potrero.create({ data: { campoId: fx.id, nombre: 'C1', tipo: 'CORRAL', metrosComedero: 20, orden: 1 } });
    const C2 = await prisma.potrero.create({ data: { campoId: fx.id, nombre: 'C2', tipo: 'CORRAL', orden: 2 } });
    const F = await prisma.lote.create({
      data: { campoId: fx.id, potreroId: C1.id, categoriaId: base.cat.Novillos, nombre: 'F', fechaEntrada: dia(sumarDias(hoy(), -30)), pesoEntradaKg: 300 },
    });
    await prisma.versionStock.create({
      data: { potreroId: C1.id, fecha: dia(hoy()), origen: 'PLANILLA', lineas: { create: [{ loteId: F.id, categoriaId: base.cat.Novillos, cabezas: 80, pesoPromedioKg: 300 }] } },
    });
    await base.potrero('1', { hectareas: 50, lotes: [['A', 'Terneros', 100, 180]] });
    return { ...base, fx, C1, C2 };
  }

  it('cada corral trae sus datos del feedlot; el vacío, null; las estancias, nada', async () => {
    const { agent, fx, campo } = await preparar();
    const { body } = await agent.get(`/api/pecuaria/campos/${fx.id}/potreros`).expect(200);
    const [c1, c2] = body;
    expect(c1.feedlot).toMatchObject({
      cabezas: 80,
      diasEncierre: 30,
      etapa: 'ENGORDE',
      pesoEntradaKg: 300,
      pesoHoyKg: 345,
      gmdKg: 1.5,
      gmdReal: false,
      kgGanadosCab: 45,
      diasParaSalida: 90,
      // 20 m ÷ 80 cab = 25 cm, menos que los 30 del objetivo.
      cmPorCabeza: 25,
      cmObjetivo: 30,
      apretado: true,
    });
    expect(c2.feedlot).toBeNull();

    const todos = (await agent.get('/api/pecuaria/potreros?grupo=feedlots').expect(200)).body;
    expect(todos.map((p) => p.feedlot?.cabezas ?? null)).toEqual([80, null]);

    const estancia = (await agent.get(`/api/pecuaria/campos/${campo.id}/potreros`).expect(200)).body;
    expect(estancia[0]).not.toHaveProperty('feedlot');
  });

  it('el objetivo de cm por cabeza sale del parámetro FEEDLOT_CM_COMEDERO', async () => {
    const { agent, fx } = await preparar();
    await prisma.parametro.upsert({ where: { clave: 'FEEDLOT_CM_COMEDERO' }, update: { valor: 20 }, create: { clave: 'FEEDLOT_CM_COMEDERO', valor: 20, descripcion: 'test' } });
    const [c1] = (await agent.get(`/api/pecuaria/campos/${fx.id}/potreros`).expect(200)).body;
    expect(c1.feedlot).toMatchObject({ cmPorCabeza: 25, cmObjetivo: 20, apretado: false });
  });
});
