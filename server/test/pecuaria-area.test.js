// Área utilizable de cada potrero (docs/superpowers/specs/2026-11-19-area-utilizable-design.md):
// la carga por hectárea se calcula sobre ella; vacía = todas las hectáreas.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { useTestDatabase } from './helpers.js';
import { auditoria, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

// EJ: potrero 1 de 50 ha con 100 terneros de 190 kg (campo natural), potrero 2 de 40 ha vacío.
async function preparar() {
  const base = await prepararCampo();
  const { potrero: P1, lote: l1 } = await base.potrero('1', { hectareas: 50, usoNombre: 'Campo natural', lotes: [['A', 'Terneros', 100, 190]] });
  const { potrero: P2 } = await base.potrero('2', { hectareas: 40, usoNombre: 'Campo natural' });
  return { ...base, P1, P2, A: l1.A };
}

const ficha = async (agent, p) => (await agent.get(`/api/pecuaria/potreros/${p.id}`).expect(200)).body;
const editar = (agent, p, datos) => agent.patch(`/api/pecuaria/potreros/${p.id}`).send(datos);

describe('área utilizable', () => {
  it('por defecto la carga se calcula con todas las hectáreas', async () => {
    const { agent, P1 } = await preparar();
    const p = await ficha(agent, P1);
    expect(p).toMatchObject({ hectareas: 50, areaUtilizable: null });
    expect(p.stock.cabHa).toBe(2);
  });

  it('cargada, la carga se calcula sobre ella: en la ficha, la lista, el resumen y la vista previa', async () => {
    const { agent, campo, P1, P2, A } = await preparar();
    const { body } = await editar(agent, P1, { areaUtilizable: 40 }).expect(200);
    expect(body.areaUtilizable).toBe(40);
    const p = await ficha(agent, P1);
    expect(p.stock).toMatchObject({ cabHa: 2.5, kgPvHa: 475, ugHa: 1.25 });

    const [enLista] = (await agent.get(`/api/pecuaria/campos/${campo.id}/potreros`).expect(200)).body;
    expect(enLista).toMatchObject({ areaUtilizable: 40, stock: { cabHa: 2.5 } });

    const resumen = (await agent.get(`/api/pecuaria/campos/${campo.id}/resumen`).expect(200)).body;
    // Los dos potreros de CN: 40 + 40 ha utilizables (el 2 sin área: sus 40 ha).
    expect(resumen.porGrupo.find((g) => g.grupo === 'CN')).toMatchObject({ hectareas: 80, cabHa: 1.25 });

    await editar(agent, P2, { areaUtilizable: 20 }).expect(200);
    const previa = (
      await agent.post('/api/pecuaria/movimientos/vista-previa').send({ loteOrigenId: A.id, cabezas: 100, destinoPotreroId: P2.id, modo: 'ENTERO' }).expect(200)
    ).body;
    expect(previa.destino.despues.cabHa).toBe(5);
  });

  it('no puede ser mayor que las hectáreas (salvo hectáreas a confirmar); vacía vuelve a todas', async () => {
    const { agent, P1 } = await preparar();
    const mucha = await editar(agent, P1, { areaUtilizable: 60 }).expect(400);
    expect(mucha.body.errors[0]).toMatch(/no puede ser mayor que las hectáreas \(50\)/);
    // Bajar las hectáreas por debajo del área utilizable, tampoco.
    await editar(agent, P1, { areaUtilizable: 40 }).expect(200);
    await editar(agent, P1, { hectareas: 30 }).expect(400);
    // Con las hectáreas a confirmar, el área utilizable vale igual y se calcula con ella.
    const { body } = await editar(agent, P1, { hectareasAConfirmar: true, areaUtilizable: 80 }).expect(200);
    expect(body.areaUtilizable).toBe(80);
    expect((await ficha(agent, P1)).stock.cabHa).toBe(1.25);
    await editar(agent, P1, { hectareasAConfirmar: false, areaUtilizable: null }).expect(200);
    expect((await ficha(agent, P1)).stock.cabHa).toBe(2);
  });

  it('al editar queda en la auditoría', async () => {
    const { agent, P1 } = await preparar();
    await editar(agent, P1, { areaUtilizable: 40 }).expect(200);
    const [a] = await auditoria('POTRERO_EDITADO');
    expect(a.detalle).toMatchObject({ antes: { areaUtilizable: null }, despues: { areaUtilizable: 40 } });
  });

  it('al cambiar el uso de suelo se carga; si no se manda, vuelve a todas las hectáreas', async () => {
    const { agent, uso, P1 } = await preparar();
    await editar(agent, P1, { areaUtilizable: 45 }).expect(200);
    const { body } = await agent.put(`/api/pecuaria/potreros/${P1.id}/uso`).send({ usoSueloId: uso.Avena, areaUtilizable: 40 }).expect(200);
    expect(body).toMatchObject({ areaUtilizable: 40, usoActual: { nombre: 'Avena' } });
    const [a] = await auditoria('USO_SUELO_CAMBIADO');
    expect(a.detalle).toMatchObject({ despues: { uso: 'Avena', areaUtilizable: 40 }, antes: { areaUtilizable: 45 } });

    await agent.put(`/api/pecuaria/potreros/${P1.id}/uso`).send({ usoSueloId: uso['Campo natural'], areaUtilizable: 51 }).expect(400);
    const sinArea = (await agent.put(`/api/pecuaria/potreros/${P1.id}/uso`).send({ usoSueloId: uso['Campo natural'] }).expect(200)).body;
    expect(sinArea.areaUtilizable).toBeNull();
    expect(await prisma.potrero.findUnique({ where: { id: P1.id }, select: { areaUtilizable: true } })).toEqual({ areaUtilizable: null });
  });
});
