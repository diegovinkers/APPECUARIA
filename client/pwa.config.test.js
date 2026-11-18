import { describe, expect, it } from 'vitest';
import { pwaOptions } from './pwa.config.js';

describe('pwaOptions', () => {
  it('pide permiso para actualizar (nunca recarga sola)', () => {
    expect(pwaOptions.registerType).toBe('prompt');
    expect(pwaOptions.workbox.skipWaiting).not.toBe(true);
    expect(pwaOptions.workbox.clientsClaim).not.toBe(true);
  });

  it('no toca /api', () => {
    const deny = pwaOptions.workbox.navigateFallbackDenylist;
    expect(deny.some((re) => re.test('/api/pecuaria/potreros'))).toBe(true);
    expect(deny.some((re) => re.test('/api'))).toBe(true);
    expect(deny.some((re) => re.test('/pecuaria'))).toBe(false);
    expect(deny.some((re) => re.test('/apicultura'))).toBe(false);
    expect(pwaOptions.workbox.runtimeCaching ?? []).toEqual([]);
  });

  it('apagada en desarrollo', () => {
    expect(pwaOptions.devOptions?.enabled ?? false).toBe(false);
  });

  it('el registro lo hace la app (para mostrar el cartel), no un script aparte', () => {
    expect(pwaOptions.injectRegister).toBe(false);
  });

  it('manifiesto de SAPSA', () => {
    const m = pwaOptions.manifest;
    expect(m).toMatchObject({
      name: 'SAPSA',
      short_name: 'SAPSA',
      lang: 'es-UY',
      display: 'standalone',
      start_url: '/',
      theme_color: '#18181b',
      background_color: '#18181b',
    });
    expect(m.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });
});
