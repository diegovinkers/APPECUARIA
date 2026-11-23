// Carga inicial: módulos, permisos, roles de ejemplo, el superadministrador y
// (fuera de producción) usuarios ficticios. Las credenciales salen del entorno
// (.env), nunca del código.
//
// Se puede correr las veces que haga falta: solo crea lo que falta y nunca
// pisa lo que ya se editó (nombres de módulos, permisos de roles, contraseñas).
import { z } from 'zod';
import { hashPassword } from '../auth/password.js';
import { emailField, newPasswordField, nombreField, usuarioField } from '../auth/auth.schema.js';
import { Accion } from '../generated/prisma/enums.ts';
import { MODULOS, ROLES, USUARIOS_EJEMPLO } from './catalog.js';
import { CATEGORIAS, CAUSAS, PARAMETROS, TIPOS_MOVIMIENTO, USOS_SUELO } from './pecuaria.catalog.js';
import { normalizarTexto } from '../pecuaria/normalizar.js';
import { deducirSexo } from '../pecuaria/sexo.js';
import { ESTADOS_INICIALES, PLAZOS_INICIALES } from '../pecuaria/procesos.plazos.js';

export class SeedError extends Error {}

// Nombre + alias, normalizados y sin repetir: así se guardan los alias.
const textosAlias = ({ nombre, alias = [] }) => [...new Set([nombre, ...alias].map(normalizarTexto))].filter(Boolean);

// Catálogos de Pecuaria. Cada catálogo se crea solo si está vacío: lo que se
// editó desde la app (nombres, grupos, alias) no se toca. Los parámetros que
// faltan se crean con su valor inicial; los que existen no se cambian.
export async function seedPecuaria(prisma, log = console.log) {
  if ((await prisma.usoSuelo.count()) === 0) {
    for (const [i, uso] of USOS_SUELO.entries()) {
      await prisma.usoSuelo.create({
        data: {
          nombre: uso.nombre,
          grupo: uso.grupo,
          orden: (i + 1) * 10,
          alias: { create: textosAlias(uso).map((texto) => ({ texto })) },
        },
      });
    }
    log(`Usos de suelo creados: ${USOS_SUELO.length}`);
  }
  if ((await prisma.categoria.count()) === 0) {
    for (const [i, categoria] of CATEGORIAS.entries()) {
      await prisma.categoria.create({
        data: {
          nombre: categoria.nombre,
          sexo: deducirSexo(categoria.nombre),
          orden: (i + 1) * 10,
          alias: { create: textosAlias(categoria).map((texto) => ({ texto })) },
        },
      });
    }
    log(`Categorías creadas: ${CATEGORIAS.length}`);
  }
  for (const parametro of PARAMETROS) {
    await prisma.parametro.upsert({ where: { clave: parametro.clave }, update: {}, create: parametro });
  }
  // Procesos: los plazos de cada etapa y los nombres de los estados. Se crean
  // los que faltan; los que existen no se tocan (se editan desde la app).
  for (const [clave, e] of Object.entries(PLAZOS_INICIALES)) {
    await prisma.etapaPlantilla.upsert({
      where: { tipoProceso_clave: { tipoProceso: 'REPRODUCTIVO', clave } },
      update: {},
      create: { tipoProceso: 'REPRODUCTIVO', clave, nombre: e.nombre, plazo: e.plazo, unidad: e.unidad, desde: e.desde, avisoDias: e.avisoDias, orden: e.orden },
    });
  }
  for (const [rol, e] of Object.entries(ESTADOS_INICIALES)) {
    await prisma.estadoReproductivo.upsert({ where: { rol }, update: {}, create: { rol, nombre: e.nombre, orden: e.orden } });
  }
  // Tipos de movimiento: se crean los que faltan, por clave. No alcanza con
  // "si está vacío" porque la migración ya crea los 5 que usa la app para
  // mover. Como los tipos no se borran (solo se desactivan), lo que falta es
  // lo que nunca se creó; los que existen no se tocan.
  const tiposAntes = await prisma.tipoMovimiento.count();
  for (const tipo of TIPOS_MOVIMIENTO) {
    await prisma.tipoMovimiento.upsert({ where: { clave: tipo.clave }, update: {}, create: tipo });
  }
  const tiposCreados = (await prisma.tipoMovimiento.count()) - tiposAntes;
  if (tiposCreados) log(`Tipos de movimiento creados: ${tiposCreados}`);
  // Causas: las que faltan, por código (como los tipos). Las que ya existen
  // no se tocan: se editan desde la app.
  const tipoId = new Map((await prisma.tipoMovimiento.findMany({ select: { id: true, clave: true } })).map((t) => [t.clave, t.id]));
  const causasAntes = await prisma.causaMovimiento.count();
  for (const [i, causa] of CAUSAS.entries()) {
    const ids = causa.tipos.map((clave) => tipoId.get(clave)).filter(Boolean);
    await prisma.causaMovimiento.upsert({
      where: { codigo: causa.codigo },
      update: {},
      create: { codigo: causa.codigo, nombre: causa.nombre, orden: (i + 1) * 10, tipos: { create: ids.map((id) => ({ tipoId: id })) } },
    });
  }
  const causasCreadas = (await prisma.causaMovimiento.count()) - causasAntes;
  if (causasCreadas) log(`Causas creadas: ${causasCreadas}`);

  const [usosSuelo, categorias, parametros, tiposMovimiento, causas] = await Promise.all([
    prisma.usoSuelo.count(),
    prisma.categoria.count(),
    prisma.parametro.count(),
    prisma.tipoMovimiento.count(),
    prisma.causaMovimiento.count(),
  ]);
  return { usosSuelo, categorias, parametros, tiposMovimiento, causas };
}

// Módulos (los que faltan; un nombre editado no se toca) y todos sus permisos.
export async function seedModulos(prisma) {
  for (const modulo of MODULOS) {
    const { id } = await prisma.modulo.upsert({ where: { clave: modulo.clave }, update: {}, create: modulo });
    await prisma.permiso.createMany({
      data: Object.values(Accion).map((accion) => ({ moduloId: id, accion })),
      skipDuplicates: true,
    });
  }
}

const superadminSchema = z.object({
  SUPERADMIN_USUARIO: usuarioField,
  SUPERADMIN_NOMBRE: nombreField,
  SUPERADMIN_PASSWORD: newPasswordField,
  SUPERADMIN_EMAIL: emailField,
});

function parseEnv(schema, env, hint) {
  const result = schema.safeParse(env);
  if (result.success) return result.data;
  const lines = result.error.issues.map((issue) => `  - ${issue.path.join('.') || 'valor'}: ${issue.message}`);
  throw new SeedError([hint, ...lines].join('\n'));
}

export async function runSeed(prisma, env = process.env, log = console.log) {
  const admin = parseEnv(superadminSchema, env, 'Revisá las variables SUPERADMIN_* en .env (ver .env.example):');

  // 1. Módulos y todos sus permisos (módulo × acción).
  await seedModulos(prisma);

  // 2. Roles de ejemplo, solo los que no existen (un rol editado no se toca).
  const permisos = await prisma.permiso.findMany({ select: { id: true, accion: true, modulo: { select: { clave: true } } } });
  const permisoId = new Map(permisos.map((p) => [`${p.modulo.clave}:${p.accion}`, p.id]));
  for (const rol of ROLES) {
    if (await prisma.rol.findUnique({ where: { nombre: rol.nombre }, select: { id: true } })) continue;
    const ids = Object.entries(rol.permisos).flatMap(([clave, acciones]) => acciones.map((a) => permisoId.get(`${clave}:${a}`)));
    if (ids.includes(undefined)) throw new SeedError(`El rol "${rol.nombre}" usa un módulo o acción que no existe`);
    await prisma.rol.create({
      data: { nombre: rol.nombre, descripcion: rol.descripcion, permisos: { create: ids.map((id) => ({ permisoId: id })) } },
    });
    log(`Rol creado: ${rol.nombre}`);
  }

  // 3. Superadministrador. Si ya existe, se asegura que sea superadmin y esté
  //    activo, pero su contraseña NO se cambia.
  const existing = await prisma.usuario.findUnique({ where: { usuario: admin.SUPERADMIN_USUARIO }, select: { id: true } });
  if (existing) {
    await prisma.usuario.update({ where: { id: existing.id }, data: { esSuperadmin: true, activo: true } });
    log(`Superadministrador ya existente: ${admin.SUPERADMIN_USUARIO} (contraseña sin cambios)`);
  } else {
    await prisma.usuario.create({
      data: {
        usuario: admin.SUPERADMIN_USUARIO,
        nombre: admin.SUPERADMIN_NOMBRE,
        email: admin.SUPERADMIN_EMAIL,
        passwordHash: await hashPassword(admin.SUPERADMIN_PASSWORD),
        esSuperadmin: true,
      },
    });
    log(`Superadministrador creado: ${admin.SUPERADMIN_USUARIO}`);
  }

  // 4. Usuarios ficticios: nunca en producción, y solo si hay contraseña.
  if (env.NODE_ENV === 'production') {
    log('Producción: no se crean usuarios de ejemplo.');
  } else if (!env.SEED_PASSWORD_EJEMPLO) {
    log('SEED_PASSWORD_EJEMPLO vacía: no se crean usuarios de ejemplo.');
  } else {
    const { SEED_PASSWORD_EJEMPLO: password } = parseEnv(
      z.object({ SEED_PASSWORD_EJEMPLO: newPasswordField }),
      env,
      'Revisá SEED_PASSWORD_EJEMPLO en .env:',
    );
    const passwordHash = await hashPassword(password);
    const roles = await prisma.rol.findMany({ select: { id: true, nombre: true } });
    const rolId = new Map(roles.map((r) => [r.nombre, r.id]));
    for (const u of USUARIOS_EJEMPLO) {
      if (await prisma.usuario.findUnique({ where: { usuario: u.usuario }, select: { id: true } })) continue;
      // Si alguien borró o renombró un rol de ejemplo, el usuario queda sin ese rol.
      const rolIds = u.roles.map((nombre) => rolId.get(nombre)).filter(Boolean);
      await prisma.usuario.create({
        data: {
          usuario: u.usuario,
          nombre: u.nombre,
          email: u.email,
          passwordHash,
          roles: { create: rolIds.map((id) => ({ rolId: id })) },
        },
      });
      log(`Usuario de ejemplo creado: ${u.usuario}`);
    }
  }

  // 5. Catálogos de Pecuaria (usos de suelo, categorías, parámetros, tipos de movimiento y causas).
  const pecuaria = await seedPecuaria(prisma, log);

  const [modulos, totalPermisos, totalRoles, usuarios] = await Promise.all([
    prisma.modulo.count(),
    prisma.permiso.count(),
    prisma.rol.count(),
    prisma.usuario.count(),
  ]);
  log(
    `Listo: ${modulos} módulos, ${totalPermisos} permisos, ${totalRoles} roles, ${usuarios} usuarios, ` +
      `${pecuaria.usosSuelo} usos de suelo, ${pecuaria.categorias} categorías, ` +
      `${pecuaria.tiposMovimiento} tipos de movimiento, ${pecuaria.causas} causas.`,
  );
  return { modulos, permisos: totalPermisos, roles: totalRoles, usuarios, ...pecuaria };
}
