// El orden de los potreros es el de la planilla de Excel (27/11, pedido de Diego).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { seedPecuaria } from '../src/seed/seed.js';
import { ALICE, PECUARIA_TODO, loggedAgent, useTestDatabase, usuarioCon } from './helpers.js';
import { HOJA_EJ, crearPlanilla } from './planilla-fixture.js';
import { esPivot, ordenDeLaLista } from '../src/pecuaria/orden.js';

useTestDatabase();

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Las filas de EJ en la planilla: el orden por número pondría 3.5 antes de P 7.
const EN_LA_PLANILLA = ['1.1', '2.2/3/4', 'P 7', 'P 8', 'Pivot 9', '3.5'];
// En la lista, el pivot va abajo (27/11): EJ no tiene "Frente", así que al final.
const EN_LA_LISTA = ['1.1', '2.2/3/4', 'P 7', 'P 8', '3.5', 'Pivot 9'];

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
  it('al importar, cada potrero queda en el orden de su fila (los pivots abajo), y la lista de la API lo sigue', async () => {
    const { agent, campo } = await importarEJ();
    expect(await ordenados(campo.id)).toEqual(EN_LA_LISTA);
    const lista = (await agent.get(`/api/pecuaria/campos/${campo.id}/potreros`).expect(200)).body;
    expect(lista.map((p) => p.nombre)).toEqual(EN_LA_LISTA);
  });

  it('un potrero creado en la app va al final de su estancia', async () => {
    const { agent, campo } = await importarEJ();
    await agent.post(`/api/pecuaria/campos/${campo.id}/potreros`).send({ nombre: 'Corral nuevo', tipo: 'CORRAL' }).expect(201);
    expect((await ordenados(campo.id)).at(-1)).toBe('Corral nuevo');
    expect((await prisma.potrero.findFirst({ where: { nombre: 'Corral nuevo' } })).orden).toBe(EN_LA_LISTA.length + 1);
  });

  it('la migración saca el orden de la última importación confirmada (los que no están, al final)', async () => {
    const { campo } = await importarEJ();
    // Como estaban antes: todos en 0, y uno creado en la app.
    await prisma.potrero.updateMany({ where: { campoId: campo.id }, data: { orden: 0 } });
    await prisma.potrero.create({ data: { campoId: campo.id, nombre: 'A mano' } });

    await correrMigracion('20261127120000_orden_de_la_planilla');
    expect(await ordenados(campo.id)).toEqual([...EN_LA_PLANILLA, 'A mano']);
    // Y después, la de los pivots: sin "Frente", el pivot va al final.
    await correrMigracion('20261127180000_pivots_abajo');
    expect(await ordenados(campo.id)).toEqual(['1.1', '2.2/3/4', 'P 7', 'P 8', '3.5', 'A mano', 'Pivot 9']);
  });
});

async function correrMigracion(nombre) {
  const sql = readFileSync(new URL(`../prisma/migrations/${nombre}/migration.sql`, import.meta.url), 'utf8');
  for (const sentencia of sql.split(/;\s*(?:\n|$)/).filter((s) => s.replace(/--.*$/gm, '').trim())) {
    await prisma.$executeRawUnsafe(sentencia);
  }
}

// Como en La Gateada (27/11, pedido de Diego): los pivots, de arriba de todo a
// después de los "Frente".
const GATEADA = ['Pivot 1', 'Pivot 2', 'Pivot 3', '8.1', '91.1B', 'Cerro', 'P 1', 'P 55', 'Frente A', 'Frente B', 'Olivera', 'Pastoreo'];
const GATEADA_LISTA = ['8.1', '91.1B', 'Cerro', 'P 1', 'P 55', 'Frente A', 'Frente B', 'Pivot 1', 'Pivot 2', 'Pivot 3', 'Olivera', 'Pastoreo'];

describe('los pivots abajo (27/11)', () => {
  const nombres = (lista) => lista.map((nombre) => ({ nombre }));

  it('van después del último "Frente", en su orden; sin "Frente", al final; sin pivots, nada cambia', () => {
    expect(ordenDeLaLista(nombres(GATEADA)).map((p) => p.nombre)).toEqual(GATEADA_LISTA);
    expect(ordenDeLaLista(nombres(EN_LA_PLANILLA)).map((p) => p.nombre)).toEqual(EN_LA_LISTA);
    const sinPivots = nombres(['1', 'Frente A', '2']);
    expect(ordenDeLaLista(sinPivots)).toBe(sinPivots);
    expect([esPivot('Pivot 7'), esPivot(' pivot 2'), esPivot('PIVOT'), esPivot('Pivotes'), esPivot('P 7')]).toEqual([true, true, true, false, false]);
  });

  it('la migración los baja en lo ya cargado y no toca las estancias sin pivots', async () => {
    const eg = await prisma.campo.create({ data: { sigla: 'EG', nombre: 'Estancia con pivots' } });
    const otra = await prisma.campo.create({ data: { sigla: 'OT', nombre: 'Estancia sin pivots' } });
    for (const [i, nombre] of GATEADA.entries()) await prisma.potrero.create({ data: { campoId: eg.id, nombre, orden: i + 1 } });
    for (const [i, nombre] of ['Frente A', '2', '1'].entries()) await prisma.potrero.create({ data: { campoId: otra.id, nombre, orden: i + 1 } });

    await correrMigracion('20261127180000_pivots_abajo');
    expect(await ordenados(eg.id)).toEqual(GATEADA_LISTA);
    expect((await prisma.potrero.findMany({ where: { campoId: eg.id }, orderBy: { orden: 'asc' } })).map((p) => p.orden)).toEqual(GATEADA.map((_, i) => i + 1));
    expect(await ordenados(otra.id)).toEqual(['Frente A', '2', '1']);
    // Correrla de nuevo no cambia nada.
    await correrMigracion('20261127180000_pivots_abajo');
    expect(await ordenados(eg.id)).toEqual(GATEADA_LISTA);
  });
});
