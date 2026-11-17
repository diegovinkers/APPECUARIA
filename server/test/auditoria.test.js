import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { ALICE, SUPER, createUser, loggedAgent, superAgent, useTestDatabase } from './helpers.js';

useTestDatabase();

const filas = () => prisma.auditoria.findMany({ orderBy: { id: 'asc' } });
const fallar = (usuario, password = 'incorrecta') => request(app).post('/api/login').send({ usuario, password });

describe('auditoría de logins', () => {
  it('registra logins correctos y fallidos con la IP, sin guardar lo que escribieron', async () => {
    const alice = await createUser(ALICE);
    await request(app).post('/api/login').send(ALICE).expect(200);
    await fallar('alice').expect(401);
    await fallar('nadie', 'MiClaveSecreta').expect(401);

    const registro = await filas();
    expect(registro.map((f) => [f.accion, f.usuarioId, f.detalle])).toEqual([
      ['LOGIN_OK', alice.id, null],
      ['LOGIN_FALLIDO', alice.id, { motivo: 'password', intentos: 1 }],
      ['LOGIN_FALLIDO', null, { motivo: 'usuario_inexistente' }],
    ]);
    expect(registro.every((f) => f.ip && f.fecha instanceof Date)).toBe(true);
    // Ni el usuario inexistente ni ninguna contraseña tipeada.
    expect(JSON.stringify(registro)).not.toMatch(/nadie|MiClaveSecreta|incorrecta/);
  });

  it('registra el bloqueo, los intentos durante el bloqueo y los de un usuario desactivado', async () => {
    const alice = await createUser(ALICE);
    for (let i = 0; i < 5; i++) await fallar('alice');
    await request(app).post('/api/login').send(ALICE).expect(429);
    await prisma.usuario.update({ where: { id: alice.id }, data: { bloqueadoHasta: null, activo: false } });
    await request(app).post('/api/login').send(ALICE).expect(403);

    const registro = (await filas()).map((f) => [f.accion, f.detalle?.motivo ?? null]);
    expect(registro.slice(-4)).toEqual([
      ['LOGIN_FALLIDO', 'password'],
      ['USUARIO_BLOQUEADO', null],
      ['LOGIN_FALLIDO', 'bloqueado'],
      ['LOGIN_FALLIDO', 'desactivado'],
    ]);
  });

  it('registra quién desbloqueó o restableció, sobre quién, y los cambios de contraseña y logout', async () => {
    const alice = await createUser(ALICE);
    const admin = await superAgent();
    const superId = (await prisma.usuario.findUnique({ where: { usuario: SUPER.usuario } })).id;

    await admin.post(`/api/users/${alice.id}/desbloquear`).expect(200);
    await admin.put(`/api/users/${alice.id}/password`).send({ password: 'temporal-123' }).expect(200);
    const aliceAgent = await loggedAgent({ usuario: 'alice', password: 'temporal-123' });
    await aliceAgent.put('/api/password').send({ passwordActual: 'temporal-123', passwordNueva: 'definitiva-456' }).expect(200);
    await aliceAgent.post('/api/logout').expect(204);

    const registro = (await filas()).map((f) => [f.accion, f.usuarioId, f.entidad, f.entidadId]);
    expect(registro).toEqual([
      ['LOGIN_OK', superId, 'usuario', String(superId)],
      ['USUARIO_DESBLOQUEADO', superId, 'usuario', String(alice.id)],
      ['PASSWORD_RESTABLECIDA', superId, 'usuario', String(alice.id)],
      ['LOGIN_OK', alice.id, 'usuario', String(alice.id)],
      ['PASSWORD_CAMBIADA', alice.id, 'usuario', String(alice.id)],
      ['LOGOUT', alice.id, 'usuario', String(alice.id)],
    ]);
  });

  it('un logout sin sesión no registra nada', async () => {
    await request(app).post('/api/logout').expect(204);
    expect(await prisma.auditoria.count()).toBe(0);
  });
});
