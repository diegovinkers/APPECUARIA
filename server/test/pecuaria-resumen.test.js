import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { useTestDatabase } from './helpers.js';
import { dia, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

// Campo ficticio EJ:
//   A  Campo natural (CN), 100 ha: 100 Vacas de 450 + 50 Terneros de 200 (al 13/11)
//   B  Raygras (Verdeo), 40 ha: 80 Terneros de 200
//   F  Feedlot (corral), sin ha: 20 Vacas de 500
//   D  Arroz (Otro), 10 ha: 5 Vacas de 450
//   E  sin uso y sin stock
async function preparar() {
  const base = await prepararCampo();
  const a = await base.potrero('A', {
    hectareas: 100,
    usoNombre: 'Campo natural',
    fecha: '2026-11-01',
    lotes: [['A vacas viejo', 'Vacas', 999, 450]],
  });
  // Una versión más nueva de A: el resumen usa la última.
  await prisma.lote.update({ where: { id: a.lote['A vacas viejo'].id }, data: { nombre: 'A vacas' } });
  const terneros = await prisma.lote.create({
    data: { campoId: base.campo.id, potreroId: a.potrero.id, categoriaId: base.cat.Terneros, nombre: 'A terneros' },
  });
  await prisma.versionStock.create({
    data: {
      potreroId: a.potrero.id,
      fecha: dia('2026-11-13'),
      origen: 'PLANILLA',
      lineas: {
        create: [
          { loteId: a.lote['A vacas viejo'].id, categoriaId: base.cat.Vacas, cabezas: 100, pesoPromedioKg: 450 },
          { loteId: terneros.id, categoriaId: base.cat.Terneros, cabezas: 50, pesoPromedioKg: 200 },
        ],
      },
    },
  });
  await base.potrero('B', { hectareas: 40, usoNombre: 'Raygras', lotes: [['B terneros', 'Terneros', 80, 200]] });
  await base.potrero('F', { tipo: 'CORRAL', usoNombre: 'Raygras', fecha: '2026-11-12', lotes: [['F vacas', 'Vacas', 20, 500]] });
  await base.potrero('D', { hectareas: 10, usoNombre: 'Arroz', lotes: [['D vacas', 'Vacas', 5, 450]] });
  await base.potrero('E', { hectareas: 30 });
  return { agent: base.agent, campo: base.campo };
}

describe('resumen por campo', () => {
  it('reparte cada categoría en CN / Verdeos / Corral (y Otro), con el último dato de cada potrero', async () => {
    const { agent, campo } = await preparar();
    const { body } = await agent.get(`/api/pecuaria/campos/${campo.id}/resumen`).expect(200);

    expect(body).toMatchObject({ campo: { sigla: 'EJ', nombre: 'Estancia Ejemplo' }, fecha: '2026-11-13', kgPorUg: 380 });
    expect(body.filas).toEqual([
      { categoriaId: expect.any(Number), categoria: 'Terneros', CN: 50, VERDEO: 80, CORRAL: 0, OTRO: 0, total: 130 },
      { categoriaId: expect.any(Number), categoria: 'Vacas', CN: 100, VERDEO: 0, CORRAL: 20, OTRO: 5, total: 125 },
    ]);
    expect(body.totales).toEqual({ CN: 150, VERDEO: 80, CORRAL: 20, OTRO: 5, total: 255 });
  });

  it('el corral cuenta como Corral aunque su uso de suelo diga otra cosa', async () => {
    const { agent, campo } = await preparar();
    const { body } = await agent.get(`/api/pecuaria/campos/${campo.id}/resumen`).expect(200);
    expect(body.filas.find((f) => f.categoria === 'Vacas').CORRAL).toBe(20);
  });

  it('da la carga de cada grupo con las hectáreas conocidas', async () => {
    const { agent, campo } = await preparar();
    const { body } = await agent.get(`/api/pecuaria/campos/${campo.id}/resumen`).expect(200);
    const g = Object.fromEntries(body.porGrupo.map((x) => [x.grupo, x]));

    expect(g.CN).toMatchObject({ potreros: 1, hectareas: 100, cabezas: 150, kilos: 55000, kilosCompletos: true, cabHa: 1.5, ugHa: 1.45 });
    expect(g.VERDEO).toMatchObject({ potreros: 1, hectareas: 40, cabezas: 80, cabHa: 2, ugHa: 1.05 });
    // El feedlot no tiene hectáreas: cabezas sí, carga no.
    expect(g.CORRAL).toMatchObject({ potreros: 1, hectareas: 0, cabezas: 20, cabHa: null, ugHa: null });
    // E no tiene uso ni stock: suma potreros y hectáreas a Otro.
    expect(g.OTRO).toMatchObject({ potreros: 2, hectareas: 40, cabezas: 5 });
  });

  it('un campo sin datos da tablas vacías; uno que no existe, 404', async () => {
    const { agent } = await preparar();
    const vacio = await prisma.campo.create({ data: { sigla: 'VA', nombre: 'Vacío' } });
    const { body } = await agent.get(`/api/pecuaria/campos/${vacio.id}/resumen`).expect(200);
    expect(body).toMatchObject({ fecha: null, filas: [], totales: { total: 0 } });
    await agent.get('/api/pecuaria/campos/9999/resumen').expect(404);
    await request(app).get(`/api/pecuaria/campos/${vacio.id}/resumen`).expect(401);
  });

  it('si cambian los grupos o los kg por UG, el resumen cambia al instante (nada se guarda calculado)', async () => {
    const { agent, campo } = await preparar();
    const arroz = await prisma.usoSuelo.findUnique({ where: { nombre: 'Arroz' } });
    await agent.patch(`/api/pecuaria/usos-suelo/${arroz.id}`).send({ grupo: 'VERDEO' }).expect(200);
    await agent.put('/api/pecuaria/parametros/KG_POR_UG').send({ valor: 400 }).expect(200);

    const { body } = await agent.get(`/api/pecuaria/campos/${campo.id}/resumen`).expect(200);
    expect(body.totales).toMatchObject({ VERDEO: 85, OTRO: 0 });
    expect(body.kgPorUg).toBe(400);
    expect(body.porGrupo.find((g) => g.grupo === 'CN').ugHa).toBe(1.38);
  });
});
