import { afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { COOKIE_NAME } from '../src/config.js';
import { prisma } from '../src/db.js';
import * as users from '../src/users/users.repository.js';
import { hashPassword } from '../src/auth/password.js';
import { seedModulos } from '../src/seed/seed.js';

// La cookie de sesión que puso una respuesta, o undefined.
export const sessionCookie = (res) => res.headers['set-cookie']?.find((c) => c.startsWith(`${COOKIE_NAME}=`));

// Vacía todas las tablas (menos la de migraciones) antes de cada test.
export function useTestDatabase() {
  beforeEach(async () => {
    const rows = await prisma.$queryRaw`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  });
  afterAll(() => prisma.$disconnect());
}

// Datos ficticios de prueba.
export const SUPER = { usuario: 'super.test', nombre: 'Super Test', password: 'super-password' };
export const ALICE = { usuario: 'alice', nombre: 'Alice Test', password: 'password123' };
export const BOB = { usuario: 'bob', nombre: 'Bob Test', email: 'bob@ejemplo.test', password: 'password456' };

export async function createUser({ password, ...data }) {
  return users.create({ ...data, passwordHash: await hashPassword(password) });
}

export async function createRole(nombre) {
  return prisma.rol.create({ data: { nombre }, select: { id: true, nombre: true } });
}

// Todos los permisos de Pecuaria (lo que tiene el jefe o el encargado).
export const PECUARIA_TODO = ['pecuaria:VER', 'pecuaria:CREAR', 'pecuaria:ANULAR', 'pecuaria:EDITAR'];

// Un rol con esos permisos ('modulo:ACCION'). Crea los módulos si faltan.
export async function rolConPermisos(nombre, permisos) {
  await seedModulos(prisma);
  const ids = [];
  for (const clave of permisos) {
    const [modulo, accion] = clave.split(':');
    const p = await prisma.permiso.findFirst({ where: { accion, modulo: { clave: modulo } }, select: { id: true } });
    if (!p) throw new Error(`Permiso inexistente en el test: ${clave}`);
    ids.push(p.id);
  }
  return prisma.rol.create({
    data: { nombre, permisos: { create: ids.map((permisoId) => ({ permisoId })) } },
    select: { id: true, nombre: true },
  });
}

// Crea un usuario con un rol propio de esos permisos y su alcance:
// todas = todas las estancias; campoIds = las que tiene asignadas.
export async function usuarioCon(datos, { permisos = [], todas = false, campoIds = [] } = {}) {
  const rol = await rolConPermisos(`Rol de ${datos.usuario}`, permisos);
  return users.create({
    ...datos,
    password: undefined,
    passwordHash: await hashPassword(datos.password),
    rolIds: [rol.id],
    todasLasEstancias: todas,
    campoIds,
  });
}

// Un "agent" guarda las cookies entre requests, como un navegador.
export async function loggedAgent({ usuario, password }) {
  const agent = request.agent(app);
  await agent.post('/api/login').send({ usuario, password }).expect(200);
  return agent;
}

export async function superAgent() {
  await createUser({ ...SUPER, esSuperadmin: true });
  return loggedAgent(SUPER);
}
