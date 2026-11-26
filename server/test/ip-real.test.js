import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { ALICE, createUser, useTestDatabase } from './helpers.js';

// Como en Railway: un proxy que manda la IP real en X-Real-IP. Límite bajo
// (3 fallos por IP) para ver que cuenta por esa IP. vi.hoisted corre antes que
// los imports, así la configuración ya lo toma al cargarse.
const previo = vi.hoisted(() => {
  const anterior = {
    max: process.env.LOGIN_MAX_FALLOS_POR_IP,
    proxy: process.env.TRUST_PROXY,
    header: process.env.IP_HEADER,
  };
  process.env.LOGIN_MAX_FALLOS_POR_IP = '3';
  process.env.TRUST_PROXY = '1';
  process.env.IP_HEADER = 'X-Real-IP';
  return anterior;
});

useTestDatabase();
afterAll(() => {
  process.env.LOGIN_MAX_FALLOS_POR_IP = previo.max;
  process.env.TRUST_PROXY = previo.proxy;
  process.env.IP_HEADER = previo.header;
});

// Direcciones de documentación (RFC 5737 y 3849): ficticias.
const login = (encabezados, usuario, password) => {
  const req = request(app).post('/api/login');
  for (const [nombre, valor] of Object.entries(encabezados)) req.set(nombre, valor);
  return req.send({ usuario, password });
};

describe('IP real desde un encabezado del proxy (IP_HEADER)', () => {
  it('la auditoría y la sesión guardan la IP de X-Real-IP', async () => {
    await createUser(ALICE);
    await login({ 'X-Real-IP': '198.51.100.7' }, 'alice', ALICE.password).expect(200);
    const { ip } = await prisma.auditoria.findFirst();
    expect(ip).toBe('198.51.100.7');
    const sesion = await prisma.sesion.findFirst();
    expect(sesion.ip).toBe('198.51.100.7');
  });

  it('manda X-Real-IP aunque X-Forwarded-For diga otra cosa', async () => {
    await createUser(ALICE);
    await login({ 'X-Real-IP': '198.51.100.8', 'X-Forwarded-For': '203.0.113.99' }, 'alice', ALICE.password).expect(200);
    const { ip } = await prisma.auditoria.findFirst();
    expect(ip).toBe('198.51.100.8');
  });

  it('acepta IPv6', async () => {
    await createUser(ALICE);
    await login({ 'X-Real-IP': '2001:db8::1' }, 'alice', ALICE.password).expect(200);
    const { ip } = await prisma.auditoria.findFirst();
    expect(ip).toBe('2001:db8::1');
  });

  it('si el encabezado no es una IP, queda la que calcula Express', async () => {
    await createUser(ALICE);
    await login({ 'X-Real-IP': 'no-es-una-ip', 'X-Forwarded-For': '203.0.113.40' }, 'alice', ALICE.password).expect(200);
    const { ip } = await prisma.auditoria.findFirst();
    expect(ip).toBe('203.0.113.40');
  });

  it('el límite de logins fallidos cuenta por la IP de X-Real-IP', async () => {
    await createUser(ALICE);
    const atacante = { 'X-Real-IP': '198.51.100.50' };
    await login(atacante, 'alice', 'mal').expect(401);
    await login(atacante, 'bob', 'mal').expect(401);
    await login(atacante, 'carla', 'mal').expect(401);
    await login(atacante, 'alice', ALICE.password).expect(429);
    // Otra IP real, detrás del mismo proxy, entra.
    await login({ 'X-Real-IP': '198.51.100.51' }, 'alice', ALICE.password).expect(200);
  });
});
