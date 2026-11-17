import { afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { COOKIE_NAME } from '../src/config.js';
import { prisma } from '../src/db.js';
import * as users from '../src/users/users.repository.js';
import { hashPassword } from '../src/auth/password.js';

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
