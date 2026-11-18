// Dar de baja un potrero que ya no se usa: no se lista más,
// su historial queda, y uno con animales no se puede dar de baja.
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { useTestDatabase } from './helpers.js';
import { prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

describe('dar de baja un potrero', () => {
  it('uno vacío se da de baja y deja de aparecer en la lista (queda en la auditoría)', async () => {
    const { agent, campo, potrero } = await prepararCampo();
    const { potrero: pivot } = await potrero('Potrero viejo');
    await potrero('1', { hectareas: 50, lotes: [['A', 'Terneros', 100, 180]] });

    await agent.patch(`/api/pecuaria/potreros/${pivot.id}`).send({ activo: false }).expect(200);
    const lista = (await agent.get(`/api/pecuaria/campos/${campo.id}/potreros`).expect(200)).body;
    expect(lista.map((p) => p.nombre)).toEqual(['1']);
    // La ficha sigue existiendo (historial).
    await agent.get(`/api/pecuaria/potreros/${pivot.id}`).expect(200);
    const [a] = await prisma.auditoria.findMany({ where: { accion: 'POTRERO_EDITADO' } });
    expect(a.detalle).toEqual({ antes: { activo: true }, despues: { activo: false } });
  });

  it('uno con animales no se da de baja', async () => {
    const { agent, potrero } = await prepararCampo();
    const { potrero: p } = await potrero('1', { hectareas: 50, lotes: [['A', 'Terneros', 100, 180]] });
    const res = await agent.patch(`/api/pecuaria/potreros/${p.id}`).send({ activo: false }).expect(400);
    expect(res.body.errors[0]).toMatch(/tiene 100 cabezas/);
  });
});
