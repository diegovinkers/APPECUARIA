import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { useTestDatabase } from './helpers.js';
import { auditoria, hoy, prepararCampo } from './pecuaria-helpers.js';

useTestDatabase();

// Campo ficticio EJ con el potrero 10.3: 144,5 ha, Raygras, lote A = 350 Terneros de 250 kg al 13/11.
async function preparar() {
  const base = await prepararCampo();
  const { potrero, lote } = await base.potrero('10.3', {
    hectareas: 144.5,
    usoNombre: 'Raygras',
    lotes: [['Lote A', 'Terneros', 350, 250]],
  });
  // Otro potrero con su lote, para probar que no se mezclan.
  const otro = await base.potrero('20', { hectareas: 10, lotes: [['Lote X', 'Vacas', 5, 450]] });
  return { ...base, potrero, A: lote['Lote A'], X: otro.lote['Lote X'] };
}

describe('detalle del potrero', () => {
  it('muestra el stock actual por lote con los cálculos', async () => {
    const { agent, potrero, A } = await preparar();
    const { body } = await agent.get(`/api/pecuaria/potreros/${potrero.id}`).expect(200);

    expect(body).toMatchObject({
      nombre: '10.3',
      hectareas: 144.5,
      campo: { sigla: 'EJ', nombre: 'Estancia Ejemplo' },
      usoActual: { nombre: 'Raygras', grupo: 'VERDEO', desde: '2026-11-01' },
      kgPorUg: 380,
      stock: {
        fecha: '2026-11-13',
        origen: 'PLANILLA',
        cabezas: 350,
        kilos: 87500,
        kilosCompletos: true,
        cabHa: 2.42,
        kgPvHa: 605.54,
        ugHa: 1.59,
      },
    });
    expect(body.stock.lineas).toEqual([
      expect.objectContaining({ loteId: A.id, lote: 'Lote A', categoria: 'Terneros', cabezas: 350, pesoPromedioKg: 250, kilos: 87500 }),
    ]);
  });

  it('la lista de potreros también trae Cab./ha y UG/ha', async () => {
    const { agent, campo } = await preparar();
    const lista = (await agent.get(`/api/pecuaria/campos/${campo.id}/potreros`).expect(200)).body;
    expect(lista.find((p) => p.nombre === '10.3').stock).toMatchObject({ fecha: '2026-11-13', cabezas: 350, cabHa: 2.42, ugHa: 1.59 });
    // Los lotes de cada potrero, para mostrarlos y filtrar por categoría.
    expect(lista.find((p) => p.nombre === '10.3').stock.lotes).toEqual([
      { loteId: expect.any(Number), lote: 'Lote A', categoriaId: expect.any(Number), categoria: 'Terneros', sexo: 'MACHO', cabezas: 350, pesoPromedioKg: 250 },
    ]);
  });

  it('404 si el potrero no existe; 401 sin sesión', async () => {
    const { agent } = await preparar();
    await agent.get('/api/pecuaria/potreros/9999').expect(404);
    await request(app).get('/api/pecuaria/potreros/1').expect(401);
  });
});

describe('editar el stock (por lote)', () => {
  it('cambiar cabezas y peso de un lote y agregar otro crea una versión nueva, sin tocar la anterior, y lo audita', async () => {
    const { agent, potrero, cat, A } = await preparar();
    const { body } = await agent
      .put(`/api/pecuaria/potreros/${potrero.id}/stock`)
      .send({
        lineas: [
          { loteId: A.id, categoriaId: cat.Terneros, cabezas: 300, pesoPromedioKg: 250 },
          { nombreLote: 'Terneros chicos 10.3', categoriaId: cat['Terneros chicos'], cabezas: 50, pesoPromedioKg: 180 },
        ],
        nota: 'Separados los más chicos',
      })
      .expect(200);

    expect(body.aviso).toBeNull();
    expect(body.potrero.stock).toMatchObject({ fecha: hoy(), origen: 'MANUAL', cabezas: 350, nota: 'Separados los más chicos' });
    expect(body.potrero.stock.lineas.map((l) => [l.lote, l.categoria, l.cabezas])).toEqual([
      ['Lote A', 'Terneros', 300],
      ['Terneros chicos 10.3', 'Terneros chicos', 50],
    ]);
    expect(await prisma.versionStock.count({ where: { potreroId: potrero.id } })).toBe(2);

    const [fila] = await auditoria('STOCK_CAMBIADO');
    expect(fila).toMatchObject({ entidad: 'potrero', entidadId: String(potrero.id) });
    expect(fila.detalle).toEqual({
      fecha: hoy(),
      antes: [{ lote: 'Lote A', categoria: 'Terneros', cabezas: 350, pesoPromedioKg: 250 }],
      despues: [
        { lote: 'Lote A', categoria: 'Terneros', cabezas: 300, pesoPromedioKg: 250 },
        { lote: 'Terneros chicos 10.3', categoria: 'Terneros chicos', cabezas: 50, pesoPromedioKg: 180 },
      ],
      nota: 'Separados los más chicos',
    });
  });

  it('cambiar la categoría de un lote lo recategoriza', async () => {
    const { agent, potrero, cat, A } = await preparar();
    await agent
      .put(`/api/pecuaria/potreros/${potrero.id}/stock`)
      .send({ lineas: [{ loteId: A.id, categoriaId: cat['Terneros chicos'], cabezas: 350, pesoPromedioKg: 250 }] })
      .expect(200);
    expect((await prisma.lote.findUnique({ where: { id: A.id } })).categoriaId).toBe(cat['Terneros chicos']);
  });

  it('un lote sin cabezas (o que no se manda) queda cerrado; sin lotes, el potrero queda vacío', async () => {
    const { agent, potrero, A } = await preparar();
    const { body } = await agent.put(`/api/pecuaria/potreros/${potrero.id}/stock`).send({ lineas: [] }).expect(200);
    expect(body.potrero.stock).toMatchObject({ cabezas: 0, lineas: [] });
    expect((await prisma.lote.findUnique({ where: { id: A.id } })).activo).toBe(false);
  });

  it('dos lotes de la misma categoría pueden convivir en un potrero', async () => {
    const { agent, potrero, cat, A } = await preparar();
    const { body } = await agent
      .put(`/api/pecuaria/potreros/${potrero.id}/stock`)
      .send({
        lineas: [
          { loteId: A.id, categoriaId: cat.Terneros, cabezas: 300, pesoPromedioKg: 240 },
          { nombreLote: 'Terneros pesados', categoriaId: cat.Terneros, cabezas: 50, pesoPromedioKg: 300 },
        ],
      })
      .expect(200);
    expect(body.potrero.stock.lineas.map((l) => l.lote)).toEqual(['Lote A', 'Terneros pesados']);
  });

  it('con una fecha anterior al último dato, guarda pero avisa que el stock actual sigue siendo el otro', async () => {
    const { agent, potrero, cat, A } = await preparar();
    const { body } = await agent
      .put(`/api/pecuaria/potreros/${potrero.id}/stock`)
      .send({ fecha: '2026-11-01', lineas: [{ loteId: A.id, categoriaId: cat.Terneros, cabezas: 10, pesoPromedioKg: 250 }] })
      .expect(200);
    expect(body.aviso).toMatch(/dato más nuevo.*13\/11\/2026/);
    expect(body.potrero.stock).toMatchObject({ fecha: '2026-11-13', cabezas: 350 });
  });

  it('valida fecha, categorías, lotes repetidos o de otro potrero, y cantidades', async () => {
    const { agent, potrero, cat, A, X } = await preparar();
    const url = `/api/pecuaria/potreros/${potrero.id}/stock`;
    await agent.put(url).send({ fecha: '2999-01-01', lineas: [] }).expect(400);
    await agent.put(url).send({ lineas: [{ loteId: A.id, categoriaId: cat.Vacas, cabezas: 2.5 }] }).expect(400);
    await agent.put(url).send({ lineas: [{ loteId: A.id, categoriaId: cat.Vacas, cabezas: 5, pesoPromedioKg: -1 }] }).expect(400);

    const noExiste = await agent.put(url).send({ lineas: [{ nombreLote: 'Z', categoriaId: 9999, cabezas: 5 }] }).expect(400);
    expect(noExiste.body.errors[0]).toMatch(/categoría.*no existe/);
    const repetido = await agent
      .put(url)
      .send({ lineas: [{ loteId: A.id, categoriaId: cat.Vacas, cabezas: 5 }, { loteId: A.id, categoriaId: cat.Vacas, cabezas: 3 }] })
      .expect(400);
    expect(repetido.body.errors[0]).toMatch(/Lote A.*dos veces/);
    const ajeno = await agent.put(url).send({ lineas: [{ loteId: X.id, categoriaId: cat.Vacas, cabezas: 5 }] }).expect(400);
    expect(ajeno.body.errors[0]).toMatch(/Lote X.*no está en este potrero/);

    await prisma.categoria.update({ where: { id: cat['Vacas CUT'] }, data: { activo: false } });
    const inactiva = await agent.put(url).send({ lineas: [{ nombreLote: 'Z', categoriaId: cat['Vacas CUT'], cabezas: 5 }] }).expect(400);
    expect(inactiva.body.errors[0]).toMatch(/Vacas CUT.*desactivada/);
  });
});

describe('cambiar el uso de suelo', () => {
  it('cierra el uso vigente y abre el nuevo, y lo audita', async () => {
    const { agent, potrero, uso } = await preparar();
    const { body } = await agent
      .put(`/api/pecuaria/potreros/${potrero.id}/uso`)
      .send({ usoSueloId: uso.Sorgo, desde: '2026-11-15' })
      .expect(200);
    expect(body.usoActual).toMatchObject({ nombre: 'Sorgo', desde: '2026-11-15' });

    const usos = await prisma.potreroUso.findMany({ where: { potreroId: potrero.id }, orderBy: { desde: 'asc' } });
    expect(usos.map((u) => [u.desde.toISOString().slice(0, 10), u.hasta?.toISOString().slice(0, 10) ?? null])).toEqual([
      ['2026-11-01', '2026-11-15'],
      ['2026-11-15', null],
    ]);
    const [fila] = await auditoria('USO_SUELO_CAMBIADO');
    expect(fila.detalle).toEqual({
      antes: { uso: 'Raygras', desde: '2026-11-01', areaUtilizable: null },
      despues: { uso: 'Sorgo', desde: '2026-11-15', areaUtilizable: null },
    });
  });

  it('no acepta el mismo uso, ni una fecha anterior al uso vigente', async () => {
    const { agent, potrero, uso } = await preparar();
    const url = `/api/pecuaria/potreros/${potrero.id}/uso`;
    const igual = await agent.put(url).send({ usoSueloId: uso.Raygras }).expect(400);
    expect(igual.body.errors[0]).toMatch(/ya tiene ese uso/);
    const antes = await agent.put(url).send({ usoSueloId: uso.Sorgo, desde: '2026-10-01' }).expect(400);
    expect(antes.body.errors[0]).toMatch(/no puede ser anterior.*01\/11\/2026/);
    await agent.put(url).send({ usoSueloId: 9999 }).expect(400);
  });
});

describe('historial del potrero', () => {
  it('lista las versiones de stock y los usos, del más nuevo al más viejo', async () => {
    const { agent, potrero, cat, uso, A } = await preparar();
    await agent
      .put(`/api/pecuaria/potreros/${potrero.id}/stock`)
      .send({ lineas: [{ loteId: A.id, categoriaId: cat.Terneros, cabezas: 340, pesoPromedioKg: 255 }] })
      .expect(200);
    await agent.put(`/api/pecuaria/potreros/${potrero.id}/uso`).send({ usoSueloId: uso.Sorgo }).expect(200);

    const { body } = await agent.get(`/api/pecuaria/potreros/${potrero.id}/historial`).expect(200);
    expect(body.versiones.map((v) => [v.fecha, v.origen, v.cabezas, v.usuario])).toEqual([
      [hoy(), 'MANUAL', 340, 'Alice Test'],
      ['2026-11-13', 'PLANILLA', 350, null],
    ]);
    expect(body.usos.map((u) => [u.uso.nombre, u.desde, u.hasta])).toEqual([
      ['Sorgo', hoy(), null],
      ['Raygras', '2026-11-01', hoy()],
    ]);
  });
});
