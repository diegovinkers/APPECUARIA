// La API sirve el front compilado en la misma dirección (ver src/front.js).
// FRONT_DIR apunta a test/fixtures/front (vitest.config.js).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { servirFront } from '../src/front.js';

describe('front compilado', () => {
  it('la raíz devuelve index.html, sin guardarse en caché', async () => {
    const res = await request(app).get('/').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Front de prueba');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('las rutas del front (React Router) también devuelven index.html', async () => {
    for (const ruta of ['/pecuaria', '/pecuaria/potreros/12', '/login']) {
      const res = await request(app).get(ruta).expect(200);
      expect(res.text).toContain('Front de prueba');
    }
  });

  it('los archivos de /assets se sirven y se guardan un año', async () => {
    const res = await request(app).get('/assets/app-abc123.js').expect(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('los otros archivos se sirven pero se revisan cada vez', async () => {
    const res = await request(app).get('/robots.txt').expect(200);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('un archivo que no existe da 404, no la app', async () => {
    const res = await request(app).get('/assets/viejo-999.js').expect(404);
    expect(res.body).toEqual({ errors: ['Ruta no encontrada'] });
  });

  it('una ruta de la API que no existe sigue dando 404 en JSON', async () => {
    for (const ruta of ['/api/no-existe', '/api', '/api/x/y.js']) {
      const res = await request(app).get(ruta).expect(404);
      expect(res.body).toEqual({ errors: ['Ruta no encontrada'] });
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('solo GET y HEAD reciben la app; un POST a una ruta del front da 404', async () => {
    await request(app).head('/pecuaria').expect(200);
    await request(app).post('/pecuaria').expect(404);
  });

  it('las páginas del front llevan los encabezados de seguridad', async () => {
    const res = await request(app).get('/pecuaria').expect(200);
    expect(res.headers['content-security-policy']).toMatch(/script-src 'self'/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  // PWA: el service worker y el manifiesto se revisan cada vez. Con caché larga,
  // un celular podría quedar pegado a una versión vieja de la app.
  it('el service worker (sw.js) se sirve y se revisa cada vez', async () => {
    const res = await request(app).get('/sw.js').expect(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('el manifiesto de la PWA se sirve con su tipo y se revisa cada vez', async () => {
    const res = await request(app).get('/manifest.webmanifest').expect(200);
    expect(res.headers['content-type']).toMatch(/application\/manifest\+json/);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('la CSP deja usar el manifiesto y el service worker del mismo sitio', async () => {
    const csp = (await request(app).get('/pecuaria').expect(200)).headers['content-security-policy'];
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).not.toMatch(/manifest-src 'none'/);
    expect(csp).not.toMatch(/worker-src 'none'/);
  });

  it('/health sigue respondiendo', async () => {
    await request(app).get('/health').expect(200, { status: 'ok' });
  });
});

describe('sin front compilado (desarrollo)', () => {
  it('si la carpeta no tiene index.html, no sirve nada', async () => {
    const vacia = fs.mkdtempSync(path.join(os.tmpdir(), 'sapsa-front-'));
    try {
      const { router, activo } = servirFront(vacia);
      expect(activo).toBe(false);
      const solo = express().use(router).use((req, res) => res.status(404).end());
      await request(solo).get('/').expect(404);
      await request(solo).get('/pecuaria').expect(404);
    } finally {
      fs.rmSync(vacia, { recursive: true, force: true });
    }
  });
});

describe('CLIENT_URL en Render', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('vacía, usa la dirección que pone Render', async () => {
    vi.stubEnv('CLIENT_URL', '');
    vi.stubEnv('RENDER_EXTERNAL_URL', 'https://sapsa-app.onrender.com');
    vi.resetModules();
    const { CLIENT_ORIGINS } = await import('../src/config.js');
    expect(CLIENT_ORIGINS).toEqual(['https://sapsa-app.onrender.com']);
  });

  it('si está cargada, manda CLIENT_URL', async () => {
    vi.stubEnv('CLIENT_URL', 'https://app.ejemplo.test/');
    vi.stubEnv('RENDER_EXTERNAL_URL', 'https://sapsa-app.onrender.com');
    vi.resetModules();
    const { CLIENT_ORIGINS } = await import('../src/config.js');
    expect(CLIENT_ORIGINS).toEqual(['https://app.ejemplo.test']);
  });

  it('fuera de Render y sin CLIENT_URL, el front de desarrollo', async () => {
    vi.stubEnv('CLIENT_URL', '');
    vi.stubEnv('RENDER_EXTERNAL_URL', '');
    vi.resetModules();
    const { CLIENT_ORIGINS } = await import('../src/config.js');
    expect(CLIENT_ORIGINS).toEqual(['http://localhost:5173']);
  });
});
