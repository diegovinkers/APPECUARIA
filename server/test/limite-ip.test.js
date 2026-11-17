import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { ALICE, createUser, useTestDatabase } from './helpers.js';

// Este archivo usa un límite bajo (3 fallos por IP) y simula estar detrás de
// un proxy, para poder mandar cada test desde una IP distinta con
// X-Forwarded-For. vi.hoisted corre antes que los imports de arriba, así la
// configuración ya lo toma al cargarse.
const previo = vi.hoisted(() => {
  const anterior = { max: process.env.LOGIN_MAX_FALLOS_POR_IP, proxy: process.env.TRUST_PROXY };
  process.env.LOGIN_MAX_FALLOS_POR_IP = '3';
  process.env.TRUST_PROXY = '1';
  return anterior;
});

useTestDatabase();
afterAll(() => {
  process.env.LOGIN_MAX_FALLOS_POR_IP = previo.max;
  process.env.TRUST_PROXY = previo.proxy;
});

// Direcciones de documentación (RFC 5737): ficticias.
const desde = (ip) => ({
  login: (usuario, password) => request(app).post('/api/login').set('X-Forwarded-For', ip).send({ usuario, password }),
});

describe('límite de logins fallidos por IP', () => {
  it('corta después de 3 fallos desde la misma IP, aunque prueben usuarios distintos', async () => {
    await createUser(ALICE);
    const atacante = desde('203.0.113.10');
    await atacante.login('alice', 'mal').expect(401);
    await atacante.login('bob', 'mal').expect(401);
    await atacante.login('carla', 'mal').expect(401);

    const res = await atacante.login('alice', ALICE.password).expect(429);
    expect(res.body.code).toBe('DEMASIADOS_INTENTOS');
    expect(res.headers.ratelimit).toBeDefined();

    // Otra IP no se ve afectada.
    await desde('203.0.113.11').login('alice', ALICE.password).expect(200);
  });

  it('los logins correctos no cuentan', async () => {
    await createUser(ALICE);
    const oficina = desde('203.0.113.20');
    for (let i = 0; i < 5; i++) await oficina.login('alice', ALICE.password).expect(200);
    await oficina.login('alice', 'mal').expect(401);
    await oficina.login('alice', 'mal').expect(401);
    await oficina.login('alice', ALICE.password).expect(200);
  });

  it('con TRUST_PROXY, la auditoría guarda la IP real y no la del proxy', async () => {
    await createUser(ALICE);
    await desde('203.0.113.30').login('alice', ALICE.password).expect(200);
    const { ip } = await prisma.auditoria.findFirst();
    expect(ip).toBe('203.0.113.30');
  });
});
