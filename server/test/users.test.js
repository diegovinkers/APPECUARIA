import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { ALICE, BOB, SUPER, createRole, createUser, loggedAgent, superAgent, useTestDatabase } from './helpers.js';

useTestDatabase();

describe('acceso a /api/users y /api/roles (por ahora, solo superadmin)', () => {
  it('sin sesión responde 401', async () => {
    await request(app).get('/api/users').expect(401);
    await request(app).get('/api/roles').expect(401);
  });

  it('un usuario sin indicador de superadmin recibe 403, tenga los roles que tenga', async () => {
    const rol = await createRole('Administrador');
    await createUser({ ...ALICE, rolIds: [rol.id] });
    const alice = await loggedAgent(ALICE);

    await alice.get('/api/users').expect(403);
    await alice.post('/api/users').send(BOB).expect(403);
    await alice.get('/api/roles').expect(403);
  });
});

describe('administración de usuarios', () => {
  it('lista los usuarios con sus roles y sin contraseñas', async () => {
    await createUser(ALICE);
    const admin = await superAgent();
    const res = await admin.get('/api/users').expect(200);

    expect(res.body.map((u) => u.usuario)).toEqual([ALICE.usuario, SUPER.usuario]);
    expect(res.body[0].roles).toEqual([]);
    // Ni el campo del hash ni un hash de bcrypt ($2a$, $2b$...).
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it('crea un usuario con uno o más roles, que después puede iniciar sesión', async () => {
    const admin = await superAgent();
    const compras = await createRole('Comprador');
    const recepcion = await createRole('Recepción');

    const res = await admin
      .post('/api/users')
      .send({ ...BOB, usuario: 'Bob', email: 'BOB@Ejemplo.test', rolIds: [recepcion.id, compras.id, compras.id] })
      .expect(201);
    expect(res.body).toMatchObject({ usuario: 'bob', email: 'bob@ejemplo.test', esSuperadmin: false, activo: true });
    expect(res.body.roles.map((r) => r.nombre)).toEqual(['Comprador', 'Recepción']);

    await request(app).post('/api/login').send({ usuario: 'bob', password: BOB.password }).expect(200);
  });

  it('el email y el código CIGAM son opcionales', async () => {
    const admin = await superAgent();
    const res = await admin.post('/api/users').send({ ...ALICE, email: '', codigoCigam: '  ' }).expect(201);
    expect(res.body).toMatchObject({ email: null, codigoCigam: null });
  });

  it('no deja crear superadministradores por la API', async () => {
    const admin = await superAgent();
    const res = await admin.post('/api/users').send({ ...ALICE, esSuperadmin: true }).expect(201);
    expect(res.body.esSuperadmin).toBe(false);
  });

  it('rechaza usuario, email o código CIGAM repetidos con un mensaje claro', async () => {
    const admin = await superAgent();
    await admin.post('/api/users').send({ ...BOB, codigoCigam: 'C-100' }).expect(201);

    const dupUser = await admin.post('/api/users').send({ ...ALICE, usuario: 'BOB' }).expect(409);
    expect(dupUser.body.errors).toEqual(['Ya existe un usuario con ese nombre de usuario']);
    const dupEmail = await admin.post('/api/users').send({ ...ALICE, email: 'Bob@ejemplo.test' }).expect(409);
    expect(dupEmail.body.errors).toEqual(['Ya existe un usuario con ese email']);
    const dupCigam = await admin.post('/api/users').send({ ...ALICE, codigoCigam: 'C-100' }).expect(409);
    expect(dupCigam.body.errors).toEqual(['Ya existe un usuario con ese código CIGAM']);
  });

  it('valida los datos: devuelve todos los errores juntos', async () => {
    const admin = await superAgent();
    const res = await admin.post('/api/users').send({ usuario: 'a b', email: 'no-es-email', password: '123' }).expect(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^El nombre de usuario solo puede tener/),
        'El nombre es obligatorio',
        'El email no es válido',
        'La contraseña debe tener al menos 10 caracteres',
      ]),
    );
  });

  it('rechaza roles inexistentes', async () => {
    const admin = await superAgent();
    const res = await admin.post('/api/users').send({ ...BOB, rolIds: [9999] }).expect(400);
    expect(res.body.errors).toEqual(['Alguno de los roles elegidos no existe']);
  });

  it('reemplaza los roles de un usuario y se aplica al instante en su sesión', async () => {
    const compras = await createRole('Comprador');
    const finanzas = await createRole('Financiero');
    const alice = await createUser({ ...ALICE, rolIds: [compras.id] });
    const aliceAgent = await loggedAgent(ALICE);
    const admin = await superAgent();

    await admin.put(`/api/users/${alice.id}/roles`).send({ rolIds: [finanzas.id] }).expect(200);
    const { body } = await aliceAgent.get('/api/verify').expect(200);
    expect(body.roles).toEqual([{ id: finanzas.id, nombre: 'Financiero' }]);

    // Lista vacía = sin roles.
    await admin.put(`/api/users/${alice.id}/roles`).send({ rolIds: [] }).expect(200);
    expect((await aliceAgent.get('/api/verify')).body.roles).toEqual([]);
  });

  it('desactivar corta la sesión y el acceso; reactivar lo devuelve', async () => {
    const alice = await createUser(ALICE);
    const aliceAgent = await loggedAgent(ALICE);
    const admin = await superAgent();

    const res = await admin.patch(`/api/users/${alice.id}/estado`).send({ activo: false }).expect(200);
    expect(res.body.activo).toBe(false);
    await aliceAgent.get('/api/verify').expect(401);
    await request(app).post('/api/login').send(ALICE).expect(403);

    await admin.patch(`/api/users/${alice.id}/estado`).send({ activo: true }).expect(200);
    await request(app).post('/api/login').send(ALICE).expect(200);
  });

  it('nadie cambia sus propios roles ni su estado, y un superadmin no se puede desactivar', async () => {
    const admin = await superAgent();
    const { body: me } = await admin.get('/api/verify');
    const otro = await createUser({ ...BOB, esSuperadmin: true });

    await admin.put(`/api/users/${me.id}/roles`).send({ rolIds: [] }).expect(400);
    await admin.patch(`/api/users/${me.id}/estado`).send({ activo: false }).expect(400);
    const res = await admin.patch(`/api/users/${otro.id}/estado`).send({ activo: false }).expect(400);
    expect(res.body.errors[0]).toMatch(/superadministrador/);
  });

  it('responde 404 para ids inexistentes o mal formados', async () => {
    const admin = await superAgent();
    for (const id of ['9999', 'no-es-un-id', '1.5', '99999999999']) {
      await admin.put(`/api/users/${id}/roles`).send({ rolIds: [] }).expect(404);
      await admin.patch(`/api/users/${id}/estado`).send({ activo: true }).expect(404);
    }
  });

  it('lista los roles disponibles', async () => {
    await createRole('Comprador');
    await createRole('Aprobador');
    const admin = await superAgent();
    const res = await admin.get('/api/roles').expect(200);
    expect(res.body.map((r) => r.nombre)).toEqual(['Aprobador', 'Comprador']);
  });
});
