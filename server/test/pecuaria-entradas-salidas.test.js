// Paso 2 del "libro del rodeo": entradas (nacimiento, compra, traslado desde
// otro campo) y salidas (muerte, consumo, venta, traslado a otro campo, pérdida).
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { useTestDatabase } from './helpers.js';
import { auditoria, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

// Campo ficticio:
//   P1  100 ha: lote A = 300 Terneros de 250 kg
//   P2   50 ha: lote B = 100 Vacas de 400 kg
//   P3   40 ha: vacío
async function preparar() {
  const base = await prepararCampo();
  const p1 = await base.potrero('P1', { hectareas: 100, usoNombre: 'Campo natural', lotes: [['Lote A', 'Terneros', 300, 250]] });
  const p2 = await base.potrero('P2', { hectareas: 50, usoNombre: 'Raygras', lotes: [['Lote B', 'Vacas', 100, 400]] });
  const p3 = await base.potrero('P3', { hectareas: 40, usoNombre: 'Raygras' });
  const tipos = Object.fromEntries((await base.agent.get(`${API}/tipos-movimiento`).expect(200)).body.map((t) => [t.clave, t]));
  const causas = Object.fromEntries((await base.agent.get(`${API}/causas`).expect(200)).body.map((c) => [c.codigo, c]));
  return { ...base, tipos, causas, P1: p1.potrero, P2: p2.potrero, P3: p3.potrero, A: p1.lote['Lote A'], B: p2.lote['Lote B'] };
}

const registrar = async (agent, body, esperado = 201) => (await agent.post(`${API}/entradas-salidas`).send(body).expect(esperado)).body;
const lineas = async (agent, potrero) =>
  (await agent.get(`${API}/potreros/${potrero.id}`).expect(200)).body.stock?.lineas.map((l) => [l.lote, l.categoria, l.cabezas, l.pesoPromedioKg]) ?? [];

describe('salidas', () => {
  it('una muerte con causa resta del lote y queda registrada con su tipo y su causa', async () => {
    const { agent, tipos, causas, P1, A } = await preparar();
    const res = await registrar(agent, { tipoId: tipos.MUERTE.id, loteId: A.id, cabezas: 3, causaId: causas['CA-001'].id, nota: 'En el bajo' });

    expect(res.movimientos).toHaveLength(1);
    expect(res.movimientos[0]).toMatchObject({
      modo: 'SALIDA',
      tipo: { clave: 'MUERTE', nombre: 'Muerte', efecto: 'SALE' },
      cabezas: 3,
      causa: { codigo: 'CA-001', nombre: 'Cobra' },
      loteOrigen: { id: A.id, nombre: 'Lote A' },
      potreroOrigen: { id: P1.id, nombre: 'P1' },
      categoriaOrigen: 'Terneros',
      loteDestino: null,
      potreroDestino: null,
      nota: 'En el bajo',
    });
    expect(await lineas(agent, P1)).toEqual([['Lote A', 'Terneros', 297, 250]]);

    const [fila] = await auditoria('MOVIMIENTO_REGISTRADO');
    expect(fila).toMatchObject({ entidad: 'movimiento', entidadId: String(res.movimientos[0].id) });
    expect(fila.detalle).toMatchObject({ tipo: 'Muerte', cabezas: 3, causa: 'CA-001 Cobra', origen: { lote: 'Lote A', potrero: 'P1' } });
  });

  it('la causa es obligatoria si el tipo la pide, y tiene que ser de ese tipo y estar activa', async () => {
    const { agent, tipos, causas, A } = await preparar();
    const base = { tipoId: tipos.MUERTE.id, loteId: A.id, cabezas: 1 };
    expect((await registrar(agent, base, 400)).errors[0]).toMatch(/causa/i);
    expect((await registrar(agent, { ...base, causaId: causas['CO-001'].id }, 400)).errors[0]).toMatch(/no corresponde a Muerte/);
    await prisma.causaMovimiento.update({ where: { id: causas['CA-001'].id }, data: { activo: false } });
    expect((await registrar(agent, { ...base, causaId: causas['CA-001'].id }, 400)).errors[0]).toMatch(/desactivada/);
    // Un tipo que no pide causa no la lleva.
    expect((await registrar(agent, { tipoId: tipos.PERDIDA.id, loteId: A.id, cabezas: 1, causaId: causas['MO-001'].id }, 400)).errors[0]).toMatch(
      /no lleva causa/,
    );
  });

  it('la venta pide guía y recalcula el peso de los que quedan', async () => {
    const { agent, tipos, P1, A } = await preparar();
    const base = { tipoId: tipos.VENTA.id, loteId: A.id, cabezas: 100, pesoPromedioKg: 300 };
    expect((await registrar(agent, base, 400)).errors[0]).toMatch(/guía/i);

    const res = await registrar(agent, { ...base, guia: ' A-123456 ' });
    expect(res.movimientos[0]).toMatchObject({ guia: 'A-123456', pesoPromedioKg: 300 });
    // (300 × 250 − 100 × 300) / 200 = 225
    expect(await lineas(agent, P1)).toEqual([['Lote A', 'Terneros', 200, 225]]);
  });

  it('si salen todas las cabezas, el lote queda cerrado y el potrero vacío', async () => {
    const { agent, tipos, P2, B } = await preparar();
    await registrar(agent, { tipoId: tipos.VENTA.id, loteId: B.id, cabezas: 100, guia: 'B-1' });
    expect(await lineas(agent, P2)).toEqual([]);
    expect((await prisma.lote.findUnique({ where: { id: B.id } })).activo).toBe(false);
  });

  it('el traslado a otro campo guarda el campo de destino (que no puede ser el mismo)', async () => {
    const { agent, tipos, campo, A } = await preparar();
    const otro = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Otro campo' } });
    const base = { tipoId: tipos.TRASLADO_SALIDA.id, loteId: A.id, cabezas: 50, guia: 'C-9' };
    expect((await registrar(agent, { ...base, campoOtroId: campo.id }, 400)).errors[0]).toMatch(/otro campo/);
    const res = await registrar(agent, { ...base, campoOtroId: otro.id });
    expect(res.movimientos[0].campoOtro).toEqual({ id: otro.id, sigla: 'OT', nombre: 'Otro campo' });
  });

  it('valida cabezas, lote, tipo y fecha', async () => {
    const { agent, tipos, causas, A } = await preparar();
    const muerte = { tipoId: tipos.MUERTE.id, causaId: causas['CA-001'].id };
    expect((await registrar(agent, { ...muerte, loteId: A.id, cabezas: 301 }, 400)).errors[0]).toMatch(/solo tiene 300/);
    expect((await registrar(agent, { ...muerte, cabezas: 1 }, 400)).errors[0]).toMatch(/lote/i);
    expect((await registrar(agent, { ...muerte, loteId: A.id, cabezas: 1, fecha: '2026-11-01' }, 400)).errors[0]).toMatch(/anterior al último dato/);
    // Una pesada no es una entrada ni una salida.
    expect((await registrar(agent, { tipoId: tipos.PESADA.id, loteId: A.id, cabezas: 1 }, 400)).errors[0]).toMatch(/ni una entrada ni una salida/);
    await prisma.tipoMovimiento.update({ where: { id: tipos.PERDIDA.id }, data: { activo: false } });
    expect((await registrar(agent, { tipoId: tipos.PERDIDA.id, loteId: A.id, cabezas: 1 }, 400)).errors[0]).toMatch(/desactivado/);
    await agent.post(`${API}/entradas-salidas`).send({ loteId: A.id, cabezas: 1 }).expect(400);
  });
});

describe('entradas', () => {
  it('una compra pide guía y forma un lote nuevo en el potrero', async () => {
    const { agent, tipos, cat, P3 } = await preparar();
    const base = { tipoId: tipos.COMPRA.id, potreroId: P3.id, lineas: [{ cabezas: 80, pesoPromedioKg: 180, nuevoLote: { categoriaId: cat.Terneros } }] };
    expect((await registrar(agent, base, 400)).errors[0]).toMatch(/guía/i);

    const res = await registrar(agent, { ...base, guia: 'D-77' });
    expect(res.movimientos[0]).toMatchObject({
      modo: 'ENTRADA',
      tipo: { clave: 'COMPRA', efecto: 'ENTRA' },
      cabezas: 80,
      guia: 'D-77',
      loteOrigen: null,
      potreroOrigen: null,
      potreroDestino: { id: P3.id, nombre: 'P3' },
      loteDestino: { nombre: 'P3 · Terneros' },
      categoriaDestino: 'Terneros',
    });
    expect(await lineas(agent, P3)).toEqual([['P3 · Terneros', 'Terneros', 80, 180]]);
  });

  it('una compra se puede sumar a un lote que ya está (promedia el peso)', async () => {
    const { agent, tipos, P1, A } = await preparar();
    await registrar(agent, { tipoId: tipos.COMPRA.id, guia: 'E-1', potreroId: P1.id, lineas: [{ cabezas: 50, pesoPromedioKg: 200, loteId: A.id }] });
    // (300 × 250 + 50 × 200) / 350 = 242.86
    expect(await lineas(agent, P1)).toEqual([['Lote A', 'Terneros', 350, 242.86]]);
  });

  it('el lote al que se suman tiene que estar en ese potrero', async () => {
    const { agent, tipos, P3, A } = await preparar();
    const res = await registrar(agent, { tipoId: tipos.COMPRA.id, guia: 'E-1', potreroId: P3.id, lineas: [{ cabezas: 5, loteId: A.id }] }, 400);
    expect(res.errors[0]).toMatch(/no está en P3/);
  });

  it('un nacimiento registra terneros y terneras, cada uno en su lote, vinculados al lote de las madres', async () => {
    const { agent, tipos, cat, campo, P2, B } = await preparar();
    const res = await registrar(agent, {
      tipoId: tipos.NACIMIENTO.id,
      potreroId: P2.id,
      loteMadresId: B.id,
      lineas: [
        { cabezas: 40, nuevoLote: { categoriaId: cat.Terneros, nombre: 'Terneros al pie' } },
        { cabezas: 35, nuevoLote: { categoriaId: cat.Terneras } },
      ],
    });
    expect(res.movimientos.map((m) => [m.cabezas, m.categoriaDestino, m.loteDestino.nombre, m.loteMadres?.nombre])).toEqual([
      [40, 'Terneros', 'Terneros al pie', 'Lote B'],
      [35, 'Terneras', 'P2 · Terneras', 'Lote B'],
    ]);
    // En el orden del catálogo de categorías.
    expect(await lineas(agent, P2)).toEqual([
      ['Terneros al pie', 'Terneros', 40, null],
      ['P2 · Terneras', 'Terneras', 35, null],
      ['Lote B', 'Vacas', 100, 400],
    ]);
    // Cada línea es su propio movimiento: se revierte de a uno, el último primero.
    const { movimientos } = (await agent.get(`${API}/campos/${campo.id}/movimientos`).expect(200)).body;
    expect(movimientos.map((m) => [m.cabezas, m.puedeRevertir])).toEqual([
      [35, true],
      [40, false],
    ]);
    expect(await auditoria('MOVIMIENTO_REGISTRADO')).toHaveLength(2);
  });

  it('el lote de las madres no puede ser de machos', async () => {
    const { agent, tipos, cat, P1, A } = await preparar();
    const res = await registrar(
      agent,
      { tipoId: tipos.NACIMIENTO.id, potreroId: P1.id, loteMadresId: A.id, lineas: [{ cabezas: 1, nuevoLote: { categoriaId: cat.Terneros } }] },
      400,
    );
    expect(res.errors[0]).toMatch(/madres/);
  });

  it('valida el potrero y las líneas', async () => {
    const { agent, tipos, cat, P3 } = await preparar();
    const base = { tipoId: tipos.NACIMIENTO.id, potreroId: P3.id };
    await registrar(agent, { ...base, lineas: [] }, 400);
    await registrar(agent, { ...base, lineas: [{ cabezas: 0, nuevoLote: { categoriaId: cat.Terneros } }] }, 400);
    expect((await registrar(agent, { ...base, lineas: [{ cabezas: 3 }] }, 400)).errors[0]).toMatch(/lote/i);
    expect((await registrar(agent, { tipoId: tipos.NACIMIENTO.id, lineas: [{ cabezas: 3, nuevoLote: { categoriaId: cat.Terneros } }] }, 400)).errors[0]).toMatch(
      /potrero/i,
    );
  });
});

describe('vista previa', () => {
  it('muestra cómo queda el potrero sin guardar nada', async () => {
    const { agent, tipos, causas, A } = await preparar();
    const previa = (
      await agent
        .post(`${API}/entradas-salidas/vista-previa`)
        .send({ tipoId: tipos.MUERTE.id, loteId: A.id, cabezas: 100, causaId: causas['CA-001'].id })
        .expect(200)
    ).body;
    expect(previa).toMatchObject({ potrero: 'P1', antes: { cabezas: 300, cabHa: 3 }, despues: { cabezas: 200, cabHa: 2 } });
    expect(await prisma.movimiento.count()).toBe(0);
  });
});

describe('reversión de entradas y salidas', () => {
  it('revertir una venta del lote entero lo vuelve a abrir con sus animales', async () => {
    const { agent, tipos, P2, B } = await preparar();
    const { movimientos } = await registrar(agent, { tipoId: tipos.VENTA.id, loteId: B.id, cabezas: 100, guia: 'B-1' });
    const rev = (await agent.post(`${API}/movimientos/${movimientos[0].id}/revertir`).expect(201)).body;
    expect(rev.movimiento).toMatchObject({ modo: 'REVERSION', potreroDestino: { id: P2.id }, potreroOrigen: null });
    expect(await lineas(agent, P2)).toEqual([['Lote B', 'Vacas', 100, 400]]);
    expect((await prisma.lote.findUnique({ where: { id: B.id } })).activo).toBe(true);
  });

  it('revertir una compra con lote nuevo deja el potrero vacío y el lote cerrado', async () => {
    const { agent, tipos, cat, P3 } = await preparar();
    const { movimientos } = await registrar(agent, {
      tipoId: tipos.COMPRA.id,
      guia: 'D-1',
      potreroId: P3.id,
      lineas: [{ cabezas: 10, nuevoLote: { categoriaId: cat.Vacas } }],
    });
    await agent.post(`${API}/movimientos/${movimientos[0].id}/revertir`).expect(201);
    expect(await lineas(agent, P3)).toEqual([]);
    expect((await prisma.lote.findUnique({ where: { id: movimientos[0].loteDestino.id } })).activo).toBe(false);
  });
});

describe('lista e historial', () => {
  it('la lista del campo trae entradas y salidas, las suma aparte y filtra por tipo y potrero', async () => {
    const { agent, tipos, causas, cat, campo, P1, P2, P3, A, B } = await preparar();
    await registrar(agent, { tipoId: tipos.MUERTE.id, loteId: A.id, cabezas: 2, causaId: causas['MO-001'].id });
    await registrar(agent, { tipoId: tipos.COMPRA.id, guia: 'G-1', potreroId: P3.id, lineas: [{ cabezas: 30, nuevoLote: { categoriaId: cat.Vacas } }] });
    await agent.post(`${API}/movimientos`).send({ loteOrigenId: B.id, cabezas: 10, destinoPotreroId: P1.id, modo: 'NUEVO', nuevoLote: { categoriaId: cat.Vacas } }).expect(201);

    const lista = async (q = '') => (await agent.get(`${API}/campos/${campo.id}/movimientos${q}`).expect(200)).body;
    const todo = await lista();
    expect(todo.resumen).toEqual({ movimientos: 3, cabezas: 10, entradas: 30, salidas: 2 });
    expect(todo.movimientos.map((m) => m.tipo.clave)).toEqual(['LOTE_NUEVO', 'COMPRA', 'MUERTE']);
    expect((await lista(`?tipoId=${tipos.MUERTE.id}`)).movimientos.map((m) => m.tipo.clave)).toEqual(['MUERTE']);
    expect((await lista(`?potreroId=${P3.id}`)).movimientos.map((m) => m.tipo.clave)).toEqual(['COMPRA']);
    expect((await lista(`?potreroId=${P2.id}`)).movimientos.map((m) => m.tipo.clave)).toEqual(['LOTE_NUEVO']);
  });

  it('el historial del lote muestra sus salidas', async () => {
    const { agent, tipos, causas, A } = await preparar();
    await registrar(agent, { tipoId: tipos.MUERTE.id, loteId: A.id, cabezas: 2, causaId: causas['CA-001'].id });
    const { movimientos } = (await agent.get(`${API}/lotes/${A.id}`).expect(200)).body;
    expect(movimientos.map((m) => [m.tipo.clave, m.cabezas])).toEqual([['MUERTE', 2]]);
  });
});
