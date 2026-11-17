import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { ALICE, createUser, useTestDatabase } from './helpers.js';

useTestDatabase();

const FRONT = 'http://localhost:5173';
const AJENO = 'https://sitio-ajeno.test';

describe('encabezados', () => {
  it('agrega los encabezados de seguridad y no dice que es Express', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
  });

  it('las respuestas de la API no se guardan en caché', async () => {
    const res = await request(app).get('/api/verify').expect(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('origen de las requests (CSRF)', () => {
  it('rechaza las que cambian algo si vienen de otro sitio', async () => {
    await createUser(ALICE);
    const res = await request(app).post('/api/login').set('Origin', AJENO).send(ALICE).expect(403);
    expect(res.body).toEqual({ errors: ['Origen no permitido'] });
    expect(await prisma.sesion.count()).toBe(0);
  });

  it('acepta las que vienen del front de la app', async () => {
    await createUser(ALICE);
    await request(app).post('/api/login').set('Origin', FRONT).send(ALICE).expect(200);
  });

  it('CORS habilita solo al front de la app', async () => {
    const preflight = (origin) =>
      request(app).options('/api/login').set('Origin', origin).set('Access-Control-Request-Method', 'POST');

    const ok = await preflight(FRONT);
    expect(ok.headers['access-control-allow-origin']).toBe(FRONT);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const ajeno = await preflight(AJENO);
    expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
  });
});
