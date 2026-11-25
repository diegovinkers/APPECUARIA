// La ficha del potrero (24/11): el historial trae, en cada versión, un título
// corto, el detalle, la carga (cabezas, peso, kg/ha, cab/ha) y cuánto cambió
// contra la versión anterior. Las entradas y salidas (sin potrero de un lado)
// no rompen el historial.
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

const API = '/api/pecuaria';

// P1 100 ha: Lote A = 300 Terneros de 250 kg · P2 50 ha: Lote B = 100 Vacas de 400 kg
async function preparar() {
  const base = await prepararCampo();
  const p1 = await base.potrero('P1', { hectareas: 100, usoNombre: 'Campo natural', lotes: [['Lote A', 'Terneros', 300, 250]] });
  const p2 = await base.potrero('P2', { hectareas: 50, usoNombre: 'Raygras', lotes: [['Lote B', 'Vacas', 100, 400]] });
  const tipos = Object.fromEntries((await base.agent.get(`${API}/tipos-movimiento`).expect(200)).body.map((t) => [t.clave, t]));
  const causas = Object.fromEntries((await base.agent.get(`${API}/causas`).expect(200)).body.map((c) => [c.codigo, c]));
  return { ...base, tipos, causas, P1: p1.potrero, P2: p2.potrero, A: p1.lote['Lote A'], B: p2.lote['Lote B'] };
}

const historial = async (agent, potrero) => (await agent.get(`${API}/potreros/${potrero.id}/historial`).expect(200)).body;

describe('historial del potrero con carga y variación', () => {
  it('cada movimiento dice qué pasó y cuánto cambiaron las cabezas, el peso y la carga', async () => {
    const { agent, cat, P1, P2, A } = await preparar();
    // 100 terneros de P1 a P2 (lote nuevo).
    await agent
      .post(`${API}/movimientos`)
      .send({ loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P2.id, modo: 'NUEVO', nuevoLote: { nombre: 'Terneros de P1', categoriaId: cat.Terneros } })
      .expect(201);

    const h1 = await historial(agent, P1);
    const [ahora, antes] = h1.versiones;
    expect(ahora).toMatchObject({ titulo: 'Salieron 100', detalle: 'Terneros a P2', cabezas: 200 });
    expect(ahora.carga).toMatchObject({ cabezas: 200, pesoPromedio: 250, kgPvHa: 500, cabHa: 2 });
    expect(ahora.cambio).toEqual({ cabezas: -100, pesoPromedio: 0, kgPvHa: -250, cabHa: -1 });
    // La primera (la planilla) no tiene contra qué compararse.
    expect(antes).toMatchObject({ titulo: 'Planilla', cambio: null });
    expect(antes.carga).toMatchObject({ cabezas: 300, kgPvHa: 750, cabHa: 3 });

    const [llego] = (await historial(agent, P2)).versiones;
    expect(llego).toMatchObject({ titulo: 'Entraron 100', detalle: 'Terneros de P1' });
    // 100 vacas de 400 + 100 terneros de 250 = 325 kg promedio en 50 ha.
    expect(llego.carga).toMatchObject({ cabezas: 200, pesoPromedio: 325, kgPvHa: 1300, cabHa: 4 });
    expect(llego.cambio).toMatchObject({ cabezas: 100, pesoPromedio: -75, kgPvHa: 500, cabHa: 2 });
    expect(llego.movimiento).toMatch(/^Llegaron 100 Terneros desde P1/);
  });

  it('una salida (muerte) y una entrada (compra) no rompen el historial y usan el nombre del tipo', async () => {
    const { agent, tipos, causas, cat, P1, A } = await preparar();
    await agent
      .post(`${API}/entradas-salidas`)
      .send({ tipoId: tipos.MUERTE.id, loteId: A.id, cabezas: 3, causaId: causas['CA-001'].id })
      .expect(201);
    await agent
      .post(`${API}/entradas-salidas`)
      .send({ tipoId: tipos.COMPRA.id, potreroId: P1.id, guia: 'D-1', lineas: [{ cabezas: 20, pesoPromedioKg: 180, nuevoLote: { categoriaId: cat.Terneros } }] })
      .expect(201);

    const [compra, muerte] = (await historial(agent, P1)).versiones;
    expect(compra).toMatchObject({ titulo: 'Compra', detalle: '+20 Terneros', cambio: { cabezas: 20 } });
    expect(muerte).toMatchObject({ titulo: 'Muerte', detalle: '−3 Terneros', cambio: { cabezas: -3, cabHa: -0.03 } });
    expect(muerte.movimiento).toMatch(/^Muerte: salieron 3 Terneros/);
  });

  it('lo revertido no aparece en la ficha: ni la reversión ni el movimiento (en la lista de movimientos sí)', async () => {
    const { agent, campo, cat, P1, P2, A } = await preparar();
    const { movimiento } = (
      await agent
        .post(`${API}/movimientos`)
        .send({ loteOrigenId: A.id, cabezas: 5, destinoPotreroId: P2.id, modo: 'NUEVO', nuevoLote: { nombre: 'Terneros de P1', categoriaId: cat.Terneros } })
        .expect(201)
    ).body;
    await agent.post(`${API}/movimientos/${movimiento.id}/revertir`).expect(201);
    // Después, uno que queda.
    await agent
      .post(`${API}/movimientos`)
      .send({ loteOrigenId: A.id, cabezas: 10, destinoPotreroId: P2.id, modo: 'NUEVO', nuevoLote: { nombre: 'Otros', categoriaId: cat.Terneros } })
      .expect(201);

    const v1 = (await historial(agent, P1)).versiones;
    expect(v1.map((v) => v.titulo)).toEqual(['Salieron 10', 'Planilla']);
    // La variación es contra la fila que se ve (la planilla: 300 → 290).
    expect(v1[0].cambio).toMatchObject({ cabezas: -10 });
    const v2 = (await historial(agent, P2)).versiones;
    expect(v2.map((v) => v.titulo)).toEqual(['Entraron 10', 'Planilla']);

    // La lista de movimientos sigue mostrando todo.
    const { movimientos } = (await agent.get(`${API}/campos/${campo.id}/movimientos`).expect(200)).body;
    expect(movimientos.map((m) => m.modo)).toContain('REVERSION');
    expect(movimientos.find((m) => m.id === movimiento.id)).toMatchObject({ revertido: true });
  });

  it('una pesada aparece con su título y cambia el peso, no las cabezas', async () => {
    const { agent, tipos, P1, A } = await preparar();
    await agent
      .post(`${API}/eventos-registro`)
      .send({ tipoId: tipos.PESADA.id, lineas: [{ loteId: A.id, pesoPromedioKg: 262 }] })
      .expect(201);
    const [pesada] = (await historial(agent, P1)).versiones;
    expect(pesada).toMatchObject({ titulo: 'Pesada', cambio: { cabezas: 0, pesoPromedio: 12, kgPvHa: 36, cabHa: 0 } });
    expect(pesada.detalle).toMatch(/de 250 a 262 kg/);
  });
});
