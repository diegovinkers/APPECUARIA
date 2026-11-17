import { describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { BCRYPT_COSTO } from '../src/auth/password.js';
import { ALICE, BOB, createUser, loggedAgent, superAgent, useTestDatabase } from './helpers.js';

useTestDatabase();

const NUEVA = 'nueva-clave-segura';
const cambiar = (agent, passwordActual, passwordNueva) => agent.put('/api/password').send({ passwordActual, passwordNueva });
const login = (usuario, password) => request(app).post('/api/login').send({ usuario, password });

describe('cambiar la propia contraseña (PUT /api/password)', () => {
  it('la vieja deja de servir y la nueva sí', async () => {
    await createUser(ALICE);
    const agent = await loggedAgent(ALICE);

    const res = await cambiar(agent, ALICE.password, NUEVA).expect(200);
    expect(res.body).toMatchObject({ usuario: 'alice', debeCambiarPassword: false });
    await login('alice', ALICE.password).expect(401);
    await login('alice', NUEVA).expect(200);
  });

  it('cierra las otras sesiones del usuario y deja abierta la actual', async () => {
    await createUser(ALICE);
    const pc = await loggedAgent(ALICE);
    const celular = await loggedAgent(ALICE);

    await cambiar(pc, ALICE.password, NUEVA).expect(200);
    await pc.get('/api/verify').expect(200);
    await celular.get('/api/verify').expect(401);
  });

  it('exige la contraseña actual correcta, y el error cuenta como intento fallido', async () => {
    await createUser(ALICE);
    const agent = await loggedAgent(ALICE);

    const res = await cambiar(agent, 'no-es-esta', NUEVA).expect(400);
    expect(res.body.errors).toEqual(['La contraseña actual no es correcta']);
    expect((await prisma.usuario.findUnique({ where: { usuario: 'alice' } })).intentosFallidos).toBe(1);
  });

  it('si se equivoca 5 veces, bloquea la cuenta y cierra todas sus sesiones', async () => {
    await createUser(ALICE);
    const agent = await loggedAgent(ALICE);
    const otra = await loggedAgent(ALICE);

    for (let i = 0; i < 4; i++) await cambiar(agent, 'no-es-esta', NUEVA).expect(400);
    const res = await cambiar(agent, 'no-es-esta', NUEVA).expect(429);
    expect(res.body.code).toBe('USUARIO_BLOQUEADO');
    await agent.get('/api/verify').expect(401);
    await otra.get('/api/verify').expect(401);
    await login('alice', ALICE.password).expect(429);
  });

  it('valida la nueva: mínimo 10 caracteres, máximo 72 bytes y distinta de la actual', async () => {
    await createUser(ALICE);
    const agent = await loggedAgent(ALICE);

    // 9 caracteres: una menos que el mínimo. Sin reglas de composición.
    const corta = await cambiar(agent, ALICE.password, 'nueve-car').expect(400);
    expect(corta.body.errors).toEqual(['La contraseña debe tener al menos 10 caracteres']);
    // 37 eñes = 37 caracteres pero 74 bytes: bcrypt ignoraría el final.
    const larga = await cambiar(agent, ALICE.password, 'ñ'.repeat(37)).expect(400);
    expect(larga.body.errors[0]).toMatch(/demasiado larga/);
    const igual = await cambiar(agent, ALICE.password, ALICE.password).expect(400);
    expect(igual.body.errors).toEqual(['La contraseña nueva tiene que ser distinta de la actual']);

    // 36 eñes = 72 bytes justos: vale.
    await cambiar(agent, ALICE.password, 'ñ'.repeat(36)).expect(200);
    await login('alice', 'ñ'.repeat(36)).expect(200);
  });

  it('sin sesión responde 401', async () => {
    await request(app).put('/api/password').send({ passwordActual: 'x', passwordNueva: NUEVA }).expect(401);
  });
});

describe('cambio obligatorio en el primer ingreso', () => {
  it('un usuario creado por un administrador tiene que cambiar la contraseña antes de seguir', async () => {
    const admin = await superAgent();
    const creado = await admin.post('/api/users').send(BOB).expect(201);
    expect(creado.body.debeCambiarPassword).toBe(true);

    const bob = request.agent(app);
    const res = await bob.post('/api/login').send(BOB).expect(200);
    expect(res.body.debeCambiarPassword).toBe(true);
    await bob.get('/api/verify').expect(200);

    // Cualquier otra ruta con sesión queda frenada hasta que la cambie.
    const frenado = await bob.get('/api/users').expect(403);
    expect(frenado.body.code).toBe('DEBE_CAMBIAR_PASSWORD');

    await cambiar(bob, BOB.password, NUEVA).expect(200);
    expect((await bob.get('/api/verify')).body.debeCambiarPassword).toBe(false);
    // Ahora llega a la ruta y la frena el permiso, no el cambio pendiente.
    const sinPermiso = await bob.get('/api/users').expect(403);
    expect(sinPermiso.body.code).toBeUndefined();
  });
});

describe('restablecer la contraseña de otro (PUT /api/users/:id/password)', () => {
  it('pone una temporal, cierra sus sesiones, lo desbloquea y lo obliga a cambiarla', async () => {
    const alice = await createUser(ALICE);
    const aliceAgent = await loggedAgent(ALICE);
    await prisma.usuario.update({ where: { id: alice.id }, data: { bloqueadoHasta: new Date(Date.now() + 600_000) } });
    const admin = await superAgent();

    const res = await admin.put(`/api/users/${alice.id}/password`).send({ password: 'temporal-123' }).expect(200);
    expect(res.body).toMatchObject({ debeCambiarPassword: true, bloqueadoHasta: null });
    await aliceAgent.get('/api/verify').expect(401);
    await login('alice', ALICE.password).expect(401);
    const nuevo = await login('alice', 'temporal-123').expect(200);
    expect(nuevo.body.debeCambiarPassword).toBe(true);
  });

  it('no se puede con uno mismo ni con otro superadministrador; 404 si no existe', async () => {
    const admin = await superAgent();
    const { body: me } = await admin.get('/api/verify');
    const otroSuper = await createUser({ ...BOB, esSuperadmin: true });

    const propio = await admin.put(`/api/users/${me.id}/password`).send({ password: NUEVA }).expect(400);
    expect(propio.body.errors[0]).toMatch(/Cambiar contraseña/);
    const deSuper = await admin.put(`/api/users/${otroSuper.id}/password`).send({ password: NUEVA }).expect(400);
    expect(deSuper.body.errors[0]).toMatch(/superadministrador/);
    await admin.put('/api/users/9999/password').send({ password: NUEVA }).expect(404);
  });

  it('valida la contraseña temporal', async () => {
    const alice = await createUser(ALICE);
    const admin = await superAgent();
    await admin.put(`/api/users/${alice.id}/password`).send({ password: '123' }).expect(400);
    await admin.put(`/api/users/${alice.id}/password`).send({}).expect(400);
  });
});

describe('hash de las contraseñas (bcrypt)', () => {
  it('un hash de costo viejo se rehace solo en el próximo login correcto', async () => {
    await prisma.usuario.create({
      data: { usuario: 'alice', nombre: 'Alice Test', passwordHash: await bcrypt.hash(ALICE.password, 4) },
    });
    await login('alice', ALICE.password).expect(200);

    const { passwordHash } = await prisma.usuario.findUnique({ where: { usuario: 'alice' } });
    expect(bcrypt.getRounds(passwordHash)).toBe(BCRYPT_COSTO);
    await login('alice', ALICE.password).expect(200);
  });

  it('fuera de los tests el costo es 12', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
    try {
      const { BCRYPT_COSTO: costoReal } = await import('../src/auth/password.js');
      expect(costoReal).toBe(12);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
