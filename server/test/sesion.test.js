import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { purgeExpiredSessions } from '../src/auth/session.js';
import { ALICE, createUser, loggedAgent, sessionCookie, superAgent, useTestDatabase } from './helpers.js';

useTestDatabase();

const MIN = 60_000;
const hace = (ms) => new Date(Date.now() - ms);
// "sapsa_sesion=TOKEN; Max-Age=...; ..." → TOKEN
const tokenDe = (res) => sessionCookie(res).split(';')[0].split('=')[1];

describe('sesiones guardadas en la base', () => {
  it('el login crea una sesión y la base guarda el SHA-256 del token, no el token', async () => {
    const alice = await createUser(ALICE);
    const res = await request(app).post('/api/login').set('User-Agent', 'navegador-de-prueba').send(ALICE).expect(200);

    const token = tokenDe(res);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const sesiones = await prisma.sesion.findMany();
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0].id).toBe(createHash('sha256').update(token).digest('hex'));
    expect(sesiones[0]).toMatchObject({ usuarioId: alice.id, userAgent: 'navegador-de-prueba' });
    expect(sesiones[0].venceEn - sesiones[0].creadaEn).toBe(8 * 60 * MIN);
  });

  it('la cookie es httpOnly, SameSite=Strict y dura lo mismo que el máximo de la sesión', async () => {
    await createUser(ALICE);
    const cookie = sessionCookie(await request(app).post('/api/login').send(ALICE).expect(200));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=28800/);
  });

  it('vence después de 30 minutos sin actividad', async () => {
    await createUser(ALICE);
    const agent = await loggedAgent(ALICE);
    await prisma.sesion.updateMany({ data: { ultimoUso: hace(30 * MIN + 1000) } });

    const res = await agent.get('/api/verify').expect(401);
    expect(res.body).toEqual({ errors: ['Tu sesión venció. Iniciá sesión de nuevo.'], code: 'SESION_VENCIDA' });
    expect(await prisma.sesion.count()).toBe(0);
  });

  it('con actividad sigue vigente y anota el último uso', async () => {
    await createUser(ALICE);
    const agent = await loggedAgent(ALICE);
    await prisma.sesion.updateMany({ data: { ultimoUso: hace(29 * MIN) } });

    await agent.get('/api/verify').expect(200);
    const sesion = await prisma.sesion.findFirst();
    expect(Date.now() - sesion.ultimoUso).toBeLessThan(MIN);
  });

  it('vence al llegar al máximo aunque se esté usando', async () => {
    await createUser(ALICE);
    const agent = await loggedAgent(ALICE);
    await prisma.sesion.updateMany({ data: { venceEn: hace(1000) } });
    await agent.get('/api/verify').expect(401);
  });

  it('después del logout la misma cookie ya no sirve (no se puede reusar)', async () => {
    await createUser(ALICE);
    const cookie = sessionCookie(await request(app).post('/api/login').send(ALICE).expect(200)).split(';')[0];

    await request(app).get('/api/verify').set('Cookie', cookie).expect(200);
    await request(app).post('/api/logout').set('Cookie', cookie).expect(204);
    await request(app).get('/api/verify').set('Cookie', cookie).expect(401);
    expect(await prisma.sesion.count()).toBe(0);
  });

  it('cada dispositivo tiene su sesión: cerrar una no cierra la otra', async () => {
    await createUser(ALICE);
    const pc = await loggedAgent(ALICE);
    const celular = await loggedAgent(ALICE);
    expect(await prisma.sesion.count()).toBe(2);

    await pc.post('/api/logout').expect(204);
    await pc.get('/api/verify').expect(401);
    await celular.get('/api/verify').expect(200);
  });

  it('desactivar a un usuario borra todas sus sesiones', async () => {
    const alice = await createUser(ALICE);
    await loggedAgent(ALICE);
    await loggedAgent(ALICE);
    const admin = await superAgent();

    await admin.patch(`/api/users/${alice.id}/estado`).send({ activo: false }).expect(200);
    expect(await prisma.sesion.count({ where: { usuarioId: alice.id } })).toBe(0);
    expect(await prisma.sesion.count()).toBe(1); // queda la del administrador
  });

  it('la limpieza periódica borra solo las sesiones vencidas', async () => {
    await createUser(ALICE);
    for (let i = 0; i < 3; i++) await loggedAgent(ALICE);
    const [inactiva, alMaximo] = await prisma.sesion.findMany();
    await prisma.sesion.update({ where: { id: inactiva.id }, data: { ultimoUso: hace(31 * MIN) } });
    await prisma.sesion.update({ where: { id: alMaximo.id }, data: { venceEn: hace(1000) } });

    expect(await purgeExpiredSessions()).toBe(2);
    expect(await prisma.sesion.count()).toBe(1);
  });
});
