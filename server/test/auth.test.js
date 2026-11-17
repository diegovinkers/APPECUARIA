import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { COOKIE_NAME } from '../src/config.js';
import { prisma } from '../src/db.js';
import { ALICE, createRole, createUser, loggedAgent, sessionCookie, useTestDatabase } from './helpers.js';

useTestDatabase();

// Ni el campo del hash ni un hash de bcrypt ($2a$, $2b$...) en la respuesta.
const NO_HASH = /passwordHash|\$2[aby]\$/;

describe('sin registro público', () => {
  it('POST /api/register no existe', async () => {
    await request(app).post('/api/register').send({ ...ALICE, email: 'alice@ejemplo.test' }).expect(404);
    expect(await prisma.usuario.count()).toBe(0);
  });
});

describe('POST /api/login', () => {
  it('con usuario y contraseña correctos inicia sesión y devuelve el usuario con sus roles', async () => {
    const rol = await createRole('Comprador');
    await createUser({ ...ALICE, rolIds: [rol.id] });

    // El nombre de usuario no distingue mayúsculas ni espacios alrededor.
    const res = await request(app).post('/api/login').send({ usuario: '  ALICE ', password: ALICE.password }).expect(200);

    expect(res.body).toMatchObject({ usuario: 'alice', nombre: 'Alice Test', email: null, esSuperadmin: false });
    expect(res.body.roles).toEqual([{ id: rol.id, nombre: 'Comprador' }]);
    expect(JSON.stringify(res.body)).not.toMatch(NO_HASH);
    expect(sessionCookie(res)).toMatch(/HttpOnly/i);
  });

  it('registra la fecha del último acceso', async () => {
    const alice = await createUser(ALICE);
    expect(alice.ultimoAcceso).toBeNull();
    await loggedAgent(ALICE);
    const row = await prisma.usuario.findUnique({ where: { id: alice.id } });
    expect(row.ultimoAcceso).toBeInstanceOf(Date);
  });

  it('da el mismo error si el usuario no existe o si la contraseña es incorrecta', async () => {
    await createUser(ALICE);
    const wrongPassword = await request(app).post('/api/login').send({ usuario: ALICE.usuario, password: 'otra-cosa' });
    const unknownUser = await request(app).post('/api/login').send({ usuario: 'nadie', password: 'otra-cosa' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownUser.body);
    expect(wrongPassword.body).toEqual({ errors: ['Usuario o contraseña incorrectos'] });
    expect(sessionCookie(wrongPassword)).toBeUndefined();
  });

  it('un usuario desactivado no puede entrar', async () => {
    await createUser(ALICE);
    await prisma.usuario.update({ where: { usuario: ALICE.usuario }, data: { activo: false } });

    const res = await request(app).post('/api/login').send(ALICE).expect(403);
    expect(res.body.errors[0]).toMatch(/desactivado/);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('valida los datos y devuelve todos los errores juntos', async () => {
    const res = await request(app).post('/api/login').send({}).expect(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining(['El nombre de usuario es obligatorio', 'La contraseña es obligatoria']),
    );
  });
});

describe('sesión: /api/verify y /api/logout', () => {
  it('/verify devuelve el usuario de la cookie', async () => {
    await createUser(ALICE);
    const agent = await loggedAgent(ALICE);
    const res = await agent.get('/api/verify').expect(200);
    expect(res.body).toMatchObject({ usuario: 'alice', activo: true, roles: [] });
  });

  it('/verify responde 401 sin cookie o con un token inválido', async () => {
    await request(app).get('/api/verify').expect(401);
    await request(app).get('/api/verify').set('Cookie', `${COOKIE_NAME}=esto-no-es-un-token`).expect(401);
    await request(app).get('/api/verify').set('Cookie', `${COOKIE_NAME}=${'a'.repeat(43)}`).expect(401);
  });

  it('desactivar a un usuario (aun directo en la base) corta su sesión abierta al instante', async () => {
    await createUser(ALICE);
    const agent = await loggedAgent(ALICE);
    await prisma.usuario.update({ where: { usuario: ALICE.usuario }, data: { activo: false } });
    await agent.get('/api/verify').expect(401);
    expect(await prisma.sesion.count()).toBe(0);
  });

  it('/logout cierra la sesión', async () => {
    await createUser(ALICE);
    const agent = await loggedAgent(ALICE);
    await agent.post('/api/logout').expect(204);
    await agent.get('/api/verify').expect(401);
  });
});

describe('errores generales', () => {
  it('JSON malformado responde 400 con el formato de error de siempre', async () => {
    const res = await request(app)
      .post('/api/login')
      .set('Content-Type', 'application/json')
      .send('{"usuario": ')
      .expect(400);
    expect(res.body).toEqual({ errors: ['El JSON enviado no es válido'] });
  });

  it('ruta inexistente responde 404', async () => {
    await request(app).get('/api/no-existe').expect(404);
  });
});
