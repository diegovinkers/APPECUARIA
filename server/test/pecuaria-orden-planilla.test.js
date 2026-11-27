// El orden de los potreros es el de la planilla de Excel (27/11, pedido de Diego).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { seedPecuaria } from '../src/seed/seed.js';
import { ALICE, PECUARIA_TODO, loggedAgent, useTestDatabase, usuarioCon } from './helpers.js';
import { HOJA_EJ, crearPlanilla } from './planilla-fixture.js';

useTestDatabase();

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Las filas de EJ en la planilla: el orden por número pondría 3.5 antes de P 7.
const EN_LA_PLANILLA = ['1.1', '2.2/3/4', 'P 7', 'P 8', 'Pivot 9', '3.5'];

async function importarEJ() {
  await seedPecuaria(prisma, () => {});
  await usuarioCon(ALICE, { permisos: PECUARIA_TODO, todas: true });
  const agent = await loggedAgent(ALICE);
  const { body } = await agent
    .post('/api/pecuaria/importaciones/planilla?archivo=cargas.xlsx&campo=EJ')
    .set('Content-Type', XLSX)
    .send(await crearPlanilla({ '13.11.2026': HOJA_EJ }))
    .expect(201);
  await agent.post(`/api/pecuaria/importaciones/${body.id}/confirmar`).send({}).expect(200);
  const campo = await prisma.campo.findUnique({ where: { sigla: 'EJ' } });
  return { agent, campo };
}

const ordenados = async (campoId) => (await prisma.potrero.findMany({ where: { campoId }, orderBy: { orden: 'asc' } })).map((p) => p.nombre);

describe('orden de la planilla', () => {
  it('al importar, cada potrero queda en el orden de su fila, y la lista de la API lo sigue', async () => {
    const { agent, campo } = await importarEJ();
    expect(await ordenados(campo.id)).toEqual(EN_LA_PLANILLA);
    const lista = (await agent.get(`/api/pecuaria/campos/${campo.id}/potreros`).expect(200)).body;
    expect(lista.map((p) => p.nombre)).toEqual(EN_LA_PLANILLA);
  });

  it('un potrero creado en la app va al final de su estancia', async () => {
    const { agent, campo } = await importarEJ();
    await agent.post(`/api/pecuaria/campos/${campo.id}/potreros`).send({ nombre: 'Corral nuevo', tipo: 'CORRAL' }).expect(201);
    expect((await ordenados(campo.id)).at(-1)).toBe('Corral nuevo');
    expect((await prisma.potrero.findFirst({ where: { nombre: 'Corral nuevo' } })).orden).toBe(EN_LA_PLANILLA.length + 1);
  });

  it('la migración saca el orden de la última importación confirmada (los que no están, al final)', async () => {
    const { campo } = await importarEJ();
    // Como estaban antes: todos en 0, y uno creado en la app.
    await prisma.potrero.updateMany({ where: { campoId: campo.id }, data: { orden: 0 } });
    await prisma.potrero.create({ data: { campoId: campo.id, nombre: 'A mano' } });

    const sql = readFileSync(new URL('../prisma/migrations/20261127120000_orden_de_la_planilla/migration.sql', import.meta.url), 'utf8');
    for (const sentencia of sql.split(/;\s*(?:\n|$)/).filter((s) => s.replace(/--.*$/gm, '').trim())) {
      await prisma.$executeRawUnsafe(sentencia);
    }
    expect(await ordenados(campo.id)).toEqual([...EN_LA_PLANILLA, 'A mano']);
  });
});
