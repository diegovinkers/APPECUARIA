import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { runSeed, SeedError } from '../src/seed/seed.js';
import { USUARIOS_EJEMPLO } from '../src/seed/catalog.js';
import { useTestDatabase } from './helpers.js';

useTestDatabase();

// Valores ficticios, como los que irían en .env.
const ENV = {
  NODE_ENV: 'development',
  SUPERADMIN_USUARIO: 'Super.Seed',
  SUPERADMIN_NOMBRE: 'Super Seed',
  SUPERADMIN_PASSWORD: 'clave-del-super',
  SEED_PASSWORD_EJEMPLO: 'clave-de-ejemplo',
};
const quiet = () => {};

// Lo que crea el seed además de los usuarios: módulos y permisos, roles de
// ejemplo (4 de Pecuaria + 6 de ejemplo) y los catálogos de Pecuaria.
const CATALOGOS = { modulos: 8, permisos: 40, roles: 10, usosSuelo: 10, categorias: 9, parametros: 1, tiposMovimiento: 26, causas: 4 };

describe('seed', () => {
  it('crea módulos, todos los permisos, roles, el superadmin y los usuarios de ejemplo', async () => {
    const summary = await runSeed(prisma, ENV, quiet);

    expect(summary).toEqual({ ...CATALOGOS, usuarios: 1 + USUARIOS_EJEMPLO.length });
    const nombres = (await prisma.modulo.findMany({ orderBy: { orden: 'asc' } })).map((m) => m.nombre);
    expect(nombres).toEqual([
      'Pecuaria',
      'Gestão de Materiais',
      'Compras',
      'Recebimento/Pré Nota',
      'Gestão Financeira',
      'Usuarios',
      'Roles',
      'Auditoría',
    ]);

    const multirol = await prisma.usuario.findUnique({
      where: { usuario: 'multirol.demo' },
      include: { roles: { include: { rol: true } } },
    });
    expect(multirol.roles.map((r) => r.rol.nombre).sort()).toEqual(['Comprador', 'Recepción']);
  });

  it('el superadmin entra con la contraseña del entorno y tiene el indicador', async () => {
    await runSeed(prisma, ENV, quiet);
    const res = await request(app)
      .post('/api/login')
      .send({ usuario: 'super.seed', password: ENV.SUPERADMIN_PASSWORD })
      .expect(200);
    expect(res.body).toMatchObject({ esSuperadmin: true, activo: true });

    await request(app).post('/api/login').send({ usuario: 'comprador.demo', password: ENV.SEED_PASSWORD_EJEMPLO }).expect(200);
  });

  it('se puede repetir: no duplica nada ni pisa la contraseña del superadmin', async () => {
    await runSeed(prisma, ENV, quiet);
    const before = await prisma.usuario.findUnique({ where: { usuario: 'super.seed' } });

    const summary = await runSeed(prisma, { ...ENV, SUPERADMIN_PASSWORD: 'otra-clave-distinta' }, quiet);

    expect(summary).toEqual({ ...CATALOGOS, usuarios: 1 + USUARIOS_EJEMPLO.length });
    const after = await prisma.usuario.findUnique({ where: { usuario: 'super.seed' } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('no pisa lo que se editó desde la app', async () => {
    await runSeed(prisma, ENV, quiet);
    await prisma.modulo.update({ where: { clave: 'compras' }, data: { nombre: 'Compras (renombrado)' } });
    const comprador = await prisma.rol.findUnique({ where: { nombre: 'Comprador' } });
    await prisma.rolPermiso.deleteMany({ where: { rolId: comprador.id } });

    await runSeed(prisma, ENV, quiet);

    expect((await prisma.modulo.findUnique({ where: { clave: 'compras' } })).nombre).toBe('Compras (renombrado)');
    expect(await prisma.rolPermiso.count({ where: { rolId: comprador.id } })).toBe(0);
  });

  it('en producción, o sin SEED_PASSWORD_EJEMPLO, no crea usuarios de ejemplo', async () => {
    await runSeed(prisma, { ...ENV, NODE_ENV: 'production' }, quiet);
    expect(await prisma.usuario.count()).toBe(1);

    await runSeed(prisma, { ...ENV, SEED_PASSWORD_EJEMPLO: '' }, quiet);
    expect(await prisma.usuario.count()).toBe(1);
  });

  it('sin credenciales válidas del superadmin, falla sin crear nada', async () => {
    await expect(runSeed(prisma, { ...ENV, SUPERADMIN_PASSWORD: undefined }, quiet)).rejects.toThrow(SeedError);
    await expect(runSeed(prisma, { ...ENV, SUPERADMIN_PASSWORD: 'corta' }, quiet)).rejects.toThrow(/SUPERADMIN_PASSWORD/);
    expect(await prisma.modulo.count()).toBe(0);
    expect(await prisma.usuario.count()).toBe(0);
  });
});

describe('seed: roles de Pecuaria (paso 3 del rediseño)', () => {
  it('crea Dirección, Jefe pecuario, Encargado de estancia y Capataz con sus permisos', async () => {
    await runSeed(prisma, ENV, quiet);
    const permisosDe = async (nombre) =>
      (
        await prisma.rolPermiso.findMany({
          where: { rol: { nombre } },
          select: { permiso: { select: { accion: true, modulo: { select: { clave: true } } } } },
        })
      )
        .map(({ permiso }) => `${permiso.modulo.clave}:${permiso.accion}`)
        .sort();
    expect(await permisosDe('Dirección')).toEqual(['auditoria:VER', 'pecuaria:VER']);
    expect(await permisosDe('Jefe pecuario')).toEqual(['pecuaria:ANULAR', 'pecuaria:CREAR', 'pecuaria:EDITAR', 'pecuaria:VER']);
    expect(await permisosDe('Encargado de estancia')).toEqual(['pecuaria:ANULAR', 'pecuaria:CREAR', 'pecuaria:EDITAR', 'pecuaria:VER']);
    expect(await permisosDe('Capataz')).toEqual(['pecuaria:CREAR', 'pecuaria:VER']);
  });
});
