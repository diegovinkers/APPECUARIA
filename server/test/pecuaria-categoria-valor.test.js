// Peso promedio y precio por categoría
// (docs/superpowers/specs/2026-11-19-peso-y-precio-por-categoria-design.md):
// los lotes sin peso usan el de su categoría (kilos "estimados"), y el precio
// da el valor del ganado.
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

// EJ: potrero 1 de 50 ha (campo natural) con 100 terneros SIN peso; potrero 2
// de 40 ha con 20 vacas de 450 kg.
async function preparar() {
  const base = await prepararCampo();
  const { potrero: P1 } = await base.potrero('1', { hectareas: 50, usoNombre: 'Campo natural', lotes: [['A', 'Terneros', 100, null]] });
  const { potrero: P2 } = await base.potrero('2', { hectareas: 40, usoNombre: 'Campo natural', lotes: [['B', 'Vacas', 20, 450]] });
  const categoria = (nombre, datos) => base.agent.patch(`/api/pecuaria/categorias/${base.cat[nombre]}`).send(datos);
  return { ...base, P1, P2, categoria };
}

const stock = async (agent, p) => (await agent.get(`/api/pecuaria/potreros/${p.id}`).expect(200)).body.stock;

describe('peso promedio y precio de la categoría', () => {
  it('se editan y se devuelven como números', async () => {
    const { agent, categoria, cat } = await preparar();
    const { body } = await categoria('Terneros', { pesoPromedioKg: '190', precioUsd: 2.5, precioPor: 'KG' }).expect(200);
    expect(body).toMatchObject({ pesoPromedioKg: 190, precioUsd: 2.5, precioPor: 'KG' });
    const lista = (await agent.get('/api/pecuaria/categorias').expect(200)).body;
    expect(lista.find((c) => c.id === cat.Terneros)).toMatchObject({ pesoPromedioKg: 190, precioUsd: 2.5 });
    expect(lista.find((c) => c.id === cat.Vacas)).toMatchObject({ pesoPromedioKg: null, precioUsd: null, precioPor: 'KG' });
  });

  it('valida: sin negativos y precio por KG o CABEZA', async () => {
    const { categoria } = await preparar();
    await categoria('Terneros', { pesoPromedioKg: -5 }).expect(400);
    await categoria('Terneros', { precioUsd: 0 }).expect(400);
    await categoria('Terneros', { precioPor: 'LITRO' }).expect(400);
    // Se pueden borrar.
    await categoria('Terneros', { pesoPromedioKg: 190 }).expect(200);
    const { body } = await categoria('Terneros', { pesoPromedioKg: null }).expect(200);
    expect(body.pesoPromedioKg).toBeNull();
  });
});

describe('kilos estimados', () => {
  it('sin peso en el lote ni en la categoría, como hoy: sin kilos', async () => {
    const { agent, P1 } = await preparar();
    expect(await stock(agent, P1)).toMatchObject({ kilos: 0, kilosCompletos: false, kilosEstimados: false, ugHa: 0 });
  });

  it('el lote sin peso usa el de su categoría y queda marcado como estimado', async () => {
    const { agent, categoria, campo, P1 } = await preparar();
    await categoria('Terneros', { pesoPromedioKg: 190 }).expect(200);
    // 100 × 190 = 19.000 kg en 50 ha = 380 kg/ha = 1 UG/ha.
    expect(await stock(agent, P1)).toMatchObject({ kilos: 19000, kilosCompletos: true, kilosEstimados: true, kgPvHa: 380, ugHa: 1 });
    const [enLista] = (await agent.get(`/api/pecuaria/campos/${campo.id}/potreros`).expect(200)).body;
    expect(enLista.stock).toMatchObject({ kilos: 19000, kilosEstimados: true });
    // En la ficha, cada línea dice el peso que se estimó.
    const [linea] = (await stock(agent, P1)).lineas;
    expect(linea).toMatchObject({ pesoPromedioKg: null, pesoEstimadoKg: 190 });
  });

  it('el lote con su peso cargado no usa el de la categoría', async () => {
    const { agent, categoria, P2 } = await preparar();
    await categoria('Vacas', { pesoPromedioKg: 400 }).expect(200);
    expect(await stock(agent, P2)).toMatchObject({ kilos: 9000, kilosEstimados: false });
  });
});

describe('valor del ganado', () => {
  it('precio por kilo: kilos × precio (con los kilos estimados)', async () => {
    const { agent, categoria, P1 } = await preparar();
    await categoria('Terneros', { pesoPromedioKg: 190, precioUsd: 2.5 }).expect(200);
    expect(await stock(agent, P1)).toMatchObject({ valorUsd: 47500, valorCompleto: true });
  });

  it('precio por cabeza: cabezas × precio, aunque no haya peso', async () => {
    const { agent, categoria, P1 } = await preparar();
    await categoria('Terneros', { precioUsd: 800, precioPor: 'CABEZA' }).expect(200);
    expect(await stock(agent, P1)).toMatchObject({ valorUsd: 80000, valorCompleto: true });
  });

  it('sin precio en la categoría el valor queda incompleto', async () => {
    const { agent, P2 } = await preparar();
    expect(await stock(agent, P2)).toMatchObject({ valorUsd: 0, valorCompleto: false });
  });

  it('el resumen suma el valor: en total, por grupo y por estancia', async () => {
    const { agent, categoria, campo } = await preparar();
    await categoria('Terneros', { precioUsd: 800, precioPor: 'CABEZA' }).expect(200);
    await categoria('Vacas', { precioUsd: 1.5 }).expect(200);
    // 80.000 de los terneros + 20 × 450 × 1,5 = 13.500 de las vacas.
    const una = (await agent.get(`/api/pecuaria/campos/${campo.id}/resumen`).expect(200)).body;
    expect(una.valor).toEqual({ usd: 93500, completo: true });
    expect(una.porGrupo.find((g) => g.grupo === 'CN')).toMatchObject({ valorUsd: 93500 });
    const todas = (await agent.get('/api/pecuaria/resumen').expect(200)).body;
    expect(todas.valor.usd).toBe(93500);
    expect(todas.estancias.find((e) => e.id === campo.id)).toMatchObject({ valorUsd: 93500 });
  });

  it('la vista previa de un movimiento también usa el peso de la categoría', async () => {
    const { agent, categoria, P1, P2 } = await preparar();
    await categoria('Terneros', { pesoPromedioKg: 190 }).expect(200);
    const A = (await stock(agent, P1)).lineas[0];
    const previa = (
      await agent.post('/api/pecuaria/movimientos/vista-previa').send({ loteOrigenId: A.loteId, cabezas: 100, destinoPotreroId: P2.id, modo: 'ENTERO' }).expect(200)
    ).body;
    // En el 2: 9.000 kg de vacas + 19.000 estimados de terneros.
    expect(previa.destino.despues).toMatchObject({ kilos: 28000, kilosEstimados: true });
  });
});
