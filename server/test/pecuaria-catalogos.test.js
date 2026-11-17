import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { seedPecuaria } from '../src/seed/seed.js';
import { resolverCategoria, resolverUsoSuelo } from '../src/pecuaria/catalogos.repository.js';
import { ALICE, createUser, loggedAgent, useTestDatabase } from './helpers.js';

useTestDatabase();

const quiet = () => {};

// En la v1 todos los usuarios con sesión pueden hacer lo mismo (fase 4 postergada).
async function usuarioComun() {
  await createUser(ALICE);
  return loggedAgent(ALICE);
}

const auditoria = (accion) => prisma.auditoria.findMany({ where: { accion }, orderBy: { id: 'asc' } });

describe('acceso a /api/pecuaria', () => {
  it('sin sesión responde 401', async () => {
    await request(app).get('/api/pecuaria/usos-suelo').expect(401);
    await request(app).get('/api/pecuaria/categorias').expect(401);
    await request(app).get('/api/pecuaria/parametros').expect(401);
  });

  it('cualquier usuario con sesión puede usarlo, sin ser superadmin ni tener roles', async () => {
    const agent = await usuarioComun();
    await agent.get('/api/pecuaria/usos-suelo').expect(200);
    await agent.post('/api/pecuaria/categorias').send({ nombre: 'Toros' }).expect(201);
  });
});

describe('catálogos iniciales de la planilla (seed)', () => {
  it('crea los usos de suelo con su grupo, las categorías y 1 UG = 380 kg', async () => {
    await seedPecuaria(prisma, quiet);
    const agent = await usuarioComun();

    const usos = (await agent.get('/api/pecuaria/usos-suelo').expect(200)).body;
    const grupo = Object.fromEntries(usos.map((u) => [u.nombre, u.grupo]));
    expect(grupo).toMatchObject({
      'Campo natural': 'CN',
      Raygras: 'VERDEO',
      'Festuca nueva': 'VERDEO',
      'Festuca vieja': 'VERDEO',
      Sorgo: 'VERDEO',
      'PP+': 'VERDEO',
      Corral: 'CORRAL',
      'Sin uso cargado': 'OTRO',
    });

    const categorias = (await agent.get('/api/pecuaria/categorias').expect(200)).body;
    expect(categorias.map((c) => c.nombre)).toContain('Terneros chicos');

    const parametros = (await agent.get('/api/pecuaria/parametros').expect(200)).body;
    expect(parametros).toContainEqual(expect.objectContaining({ clave: 'KG_POR_UG', valor: 380 }));
  });

  it('reconoce las 11 formas en que la planilla de EG escribe las categorías', async () => {
    await seedPecuaria(prisma, quiet);
    const variantes = [
      'Ternero chicos', 'Ternero', 'Ternera', 'Vacas invernar', 'VAQ. PARIDA', 'Ternero chico',
      'Terneras chicas', 'Terneros', 'Vacas', 'Vacas paridas', 'vacas CUT',
    ];
    for (const texto of variantes) {
      expect(await resolverCategoria(texto), texto).not.toBeNull();
    }
    expect((await resolverCategoria('Ternero chicos')).nombre).toBe('Terneros chicos');
    expect((await resolverCategoria('Ternero')).nombre).toBe('Terneros');
    // Ternero chico es una categoría propia, no un ternero.
    expect((await resolverCategoria('Ternero chico')).id).not.toBe((await resolverCategoria('Terneros')).id);
  });

  it('reconoce los usos de suelo como los escribe la planilla de EG', async () => {
    await seedPecuaria(prisma, quiet);
    const casos = {
      'FESTUCA NUEVA': 'Festuca nueva',
      'FESTUCA VIEJA': 'Festuca vieja',
      Raygras: 'Raygras',
      SEMILLERO: 'Semillero',
      SORGO: 'Sorgo',
      sorgo: 'Sorgo',
      Arroz: 'Arroz',
      'pp+': 'PP+',
      CN: 'Campo natural',
      'C. Natural': 'Campo natural',
    };
    for (const [texto, nombre] of Object.entries(casos)) {
      expect((await resolverUsoSuelo(texto))?.nombre, texto).toBe(nombre);
    }
    expect(await resolverUsoSuelo('Alfalfa')).toBeNull();
    expect(await resolverUsoSuelo('')).toBeNull();
  });

  it('se puede repetir sin duplicar ni pisar lo que se editó', async () => {
    await seedPecuaria(prisma, quiet);
    const raygras = await prisma.usoSuelo.findUnique({ where: { nombre: 'Raygras' } });
    await prisma.usoSuelo.update({ where: { id: raygras.id }, data: { nombre: 'Raigrás', grupo: 'OTRO' } });
    await prisma.parametro.update({ where: { clave: 'KG_POR_UG' }, data: { valor: 400 } });
    const antes = { usos: await prisma.usoSuelo.count(), categorias: await prisma.categoria.count() };

    await seedPecuaria(prisma, quiet);

    expect(await prisma.usoSuelo.count()).toBe(antes.usos);
    expect(await prisma.categoria.count()).toBe(antes.categorias);
    expect(await prisma.usoSuelo.findUnique({ where: { nombre: 'Raygras' } })).toBeNull();
    expect(Number((await prisma.parametro.findUnique({ where: { clave: 'KG_POR_UG' } })).valor)).toBe(400);
  });
});

describe('usos de suelo', () => {
  it('crea un uso con grupo y alias, y el nombre siempre cuenta como alias', async () => {
    const agent = await usuarioComun();
    const res = await agent
      .post('/api/pecuaria/usos-suelo')
      .send({ nombre: 'Avena', grupo: 'VERDEO', alias: ['AVENA NEGRA', ' avena  negra '] })
      .expect(201);

    expect(res.body).toMatchObject({ nombre: 'Avena', grupo: 'VERDEO', activo: true });
    expect(res.body.alias.sort()).toEqual(['avena', 'avena negra']);
    expect((await resolverUsoSuelo('Avena Negra')).id).toBe(res.body.id);
  });

  it('el grupo es obligatorio y tiene que ser CN, VERDEO, CORRAL u OTRO', async () => {
    const agent = await usuarioComun();
    const res = await agent.post('/api/pecuaria/usos-suelo').send({ nombre: 'Avena', grupo: 'PRADERA' }).expect(400);
    expect(res.body.errors[0]).toMatch(/grupo/i);
  });

  it('rechaza un nombre repetido o un alias que ya usa otro uso', async () => {
    const agent = await usuarioComun();
    await agent.post('/api/pecuaria/usos-suelo').send({ nombre: 'Avena', grupo: 'VERDEO' }).expect(201);

    const dupNombre = await agent.post('/api/pecuaria/usos-suelo').send({ nombre: 'AVENA', grupo: 'VERDEO' }).expect(409);
    expect(dupNombre.body.errors[0]).toMatch(/Avena/);
    const dupAlias = await agent
      .post('/api/pecuaria/usos-suelo')
      .send({ nombre: 'Avena negra', grupo: 'VERDEO', alias: ['avena'] })
      .expect(409);
    expect(dupAlias.body.errors[0]).toMatch(/"avena".*Avena/);
  });

  it('edita el grupo (configurable hasta que confirme el encargado) y lo audita con antes y después', async () => {
    const agent = await usuarioComun();
    const { body: uso } = await agent.post('/api/pecuaria/usos-suelo').send({ nombre: 'Semillero', grupo: 'OTRO' });

    const res = await agent.patch(`/api/pecuaria/usos-suelo/${uso.id}`).send({ grupo: 'VERDEO' }).expect(200);
    expect(res.body.grupo).toBe('VERDEO');

    const [fila] = await auditoria('USO_SUELO_EDITADO');
    expect(fila).toMatchObject({ entidad: 'uso_suelo', entidadId: String(uso.id) });
    expect(fila.detalle).toEqual({ antes: { grupo: 'OTRO' }, despues: { grupo: 'VERDEO' } });
    expect(await auditoria('USO_SUELO_CREADO')).toHaveLength(1);
  });

  it('al renombrar, el nombre viejo sigue sirviendo como alias', async () => {
    const agent = await usuarioComun();
    const { body: uso } = await agent.post('/api/pecuaria/usos-suelo').send({ nombre: 'Raygras', grupo: 'VERDEO' });

    await agent.patch(`/api/pecuaria/usos-suelo/${uso.id}`).send({ nombre: 'Raigrás' }).expect(200);

    expect((await resolverUsoSuelo('raygras')).nombre).toBe('Raigrás');
    expect((await resolverUsoSuelo('raigras')).nombre).toBe('Raigrás');
  });

  it('responde 404 para ids inexistentes o mal formados', async () => {
    const agent = await usuarioComun();
    for (const id of ['9999', 'abc']) {
      await agent.patch(`/api/pecuaria/usos-suelo/${id}`).send({ grupo: 'CN' }).expect(404);
    }
  });
});

describe('categorías', () => {
  it('crea una categoría (vacuna por defecto) con alias y la audita', async () => {
    const agent = await usuarioComun();
    const res = await agent
      .post('/api/pecuaria/categorias')
      .send({ nombre: 'Novillos', alias: ['Novillo', 'NOV. 1-2'] })
      .expect(201);

    expect(res.body).toMatchObject({ nombre: 'Novillos', especie: 'VACUNO', activo: true });
    expect((await resolverCategoria('nov. 1-2')).id).toBe(res.body.id);
    expect(await auditoria('CATEGORIA_CREADA')).toHaveLength(1);
  });

  it('edita nombre, orden, estado y alias; los alias nuevos reemplazan a los anteriores', async () => {
    const agent = await usuarioComun();
    const { body: cat } = await agent.post('/api/pecuaria/categorias').send({ nombre: 'Vacas', alias: ['Vaca', 'Vacas cría'] });

    const res = await agent
      .patch(`/api/pecuaria/categorias/${cat.id}`)
      .send({ orden: 3, activo: false, alias: ['Vaca'] })
      .expect(200);

    expect(res.body).toMatchObject({ orden: 3, activo: false });
    expect(res.body.alias.sort()).toEqual(['vaca', 'vacas']);
    expect(await resolverCategoria('Vacas cría')).toBeNull();
    const [fila] = await auditoria('CATEGORIA_EDITADA');
    expect(fila.detalle.antes).toMatchObject({ orden: 0, activo: true });
  });

  it('un alias no puede ser de dos categorías', async () => {
    const agent = await usuarioComun();
    await agent.post('/api/pecuaria/categorias').send({ nombre: 'Terneros', alias: ['Ternero'] }).expect(201);
    const res = await agent.post('/api/pecuaria/categorias').send({ nombre: 'Terneros chicos', alias: ['ternero'] }).expect(409);
    expect(res.body.errors[0]).toMatch(/"ternero".*Terneros/);
  });
});

describe('parámetros', () => {
  it('cambia los kg por UG y lo audita con el valor anterior', async () => {
    await seedPecuaria(prisma, quiet);
    const agent = await usuarioComun();

    const res = await agent.put('/api/pecuaria/parametros/KG_POR_UG').send({ valor: 400 }).expect(200);
    expect(res.body).toMatchObject({ clave: 'KG_POR_UG', valor: 400 });

    const [fila] = await auditoria('PARAMETRO_CAMBIADO');
    expect(fila).toMatchObject({ entidad: 'parametro', entidadId: 'KG_POR_UG', detalle: { antes: 380, despues: 400 } });
  });

  it('rechaza valores que no sean un número positivo, y parámetros que no existen', async () => {
    await seedPecuaria(prisma, quiet);
    const agent = await usuarioComun();

    for (const valor of [0, -5, 'mucho', null]) {
      await agent.put('/api/pecuaria/parametros/KG_POR_UG').send({ valor }).expect(400);
    }
    await agent.put('/api/pecuaria/parametros/NO_EXISTE').send({ valor: 10 }).expect(404);
  });
});
