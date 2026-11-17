import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { ALICE, createUser, loggedAgent, superAgent, useTestDatabase } from './helpers.js';

useTestDatabase();

const MIN = 60_000;
const fallar = (usuario = ALICE.usuario) => request(app).post('/api/login').send({ usuario, password: 'incorrecta' });
const fila = (usuario = ALICE.usuario) => prisma.usuario.findUnique({ where: { usuario } });

describe('bloqueo por intentos fallidos', () => {
  it('al 5.º intento fallido bloquea la cuenta 15 minutos, aun con la contraseña correcta', async () => {
    await createUser(ALICE);
    for (let i = 0; i < 4; i++) await fallar().expect(401);

    const res = await fallar().expect(429);
    expect(res.body.code).toBe('USUARIO_BLOQUEADO');
    expect(res.body.errors[0]).toMatch(/bloqueado por demasiados intentos fallidos\. Probá de nuevo en 15 minutos/);

    await request(app).post('/api/login').send(ALICE).expect(429);
    const alice = await fila();
    expect(alice.bloqueadoHasta - Date.now()).toBeGreaterThan(14 * MIN);
    expect(alice.intentosFallidos).toBe(0);
  });

  it('cuando vence el bloqueo puede entrar', async () => {
    const alice = await createUser(ALICE);
    await prisma.usuario.update({ where: { id: alice.id }, data: { bloqueadoHasta: new Date(Date.now() - 1000) } });
    const res = await request(app).post('/api/login').send(ALICE).expect(200);
    expect(res.body.bloqueadoHasta).toBeNull();
    expect((await fila()).bloqueadoHasta).toBeNull();
  });

  it('un login correcto pone el contador en cero', async () => {
    await createUser(ALICE);
    for (let i = 0; i < 4; i++) await fallar().expect(401);
    await request(app).post('/api/login').send(ALICE).expect(200);
    for (let i = 0; i < 4; i++) await fallar().expect(401);

    expect(await fila()).toMatchObject({ intentosFallidos: 4, bloqueadoHasta: null });
  });

  it('con usuarios que no existen siempre da el error genérico (no hay nada que bloquear)', async () => {
    for (let i = 0; i < 7; i++) {
      const res = await fallar('nadie').expect(401);
      expect(res.body).toEqual({ errors: ['Usuario o contraseña incorrectos'] });
    }
  });

  it('el bloqueo no cierra las sesiones ya abiertas (si no, cualquiera podría echar a otro)', async () => {
    await createUser(ALICE);
    const agent = await loggedAgent(ALICE);
    for (let i = 0; i < 5; i++) await fallar();
    await agent.get('/api/verify').expect(200);
  });
});

describe('desbloquear (POST /api/users/:id/desbloquear)', () => {
  it('un administrador levanta el bloqueo y el usuario puede entrar', async () => {
    const alice = await createUser(ALICE);
    for (let i = 0; i < 5; i++) await fallar();
    const admin = await superAgent();

    const res = await admin.post(`/api/users/${alice.id}/desbloquear`).expect(200);
    expect(res.body).toMatchObject({ usuario: 'alice', bloqueadoHasta: null });
    await request(app).post('/api/login').send(ALICE).expect(200);
  });

  it('404 si no existe; nadie se desbloquea a sí mismo', async () => {
    const admin = await superAgent();
    const { body: me } = await admin.get('/api/verify');
    await admin.post('/api/users/9999/desbloquear').expect(404);
    await admin.post(`/api/users/${me.id}/desbloquear`).expect(400);
  });

  it('solo superadmin (por ahora)', async () => {
    const alice = await createUser(ALICE);
    const agent = await loggedAgent(ALICE);
    await agent.post(`/api/users/${alice.id}/desbloquear`).expect(403);
  });
});
