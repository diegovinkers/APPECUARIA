import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './test/test-db-url.js';

export default defineConfig({
  test: {
    environment: 'node',
    // Valores solo para tests. La base sale de .env.test, nunca de .env.
    env: {
      NODE_ENV: 'test',
      CLIENT_URL: 'http://localhost:5173',
      DATABASE_URL: testDatabaseUrl(),
      // Valores fijos: los tests no dependen de lo que haya en .env.
      SESION_INACTIVIDAD_MINUTOS: '30',
      SESION_MAXIMA_HORAS: '8',
      LOGIN_MAX_INTENTOS: '5',
      LOGIN_BLOQUEO_MINUTOS: '15',
      // Alto, para que los tests que fallan logins a propósito no choquen con
      // el límite por IP (tiene su propio archivo de test, con un límite bajo).
      LOGIN_MAX_FALLOS_POR_IP: '10000',
      TRUST_PROXY: '',
      // Un front compilado de mentira, para probar que la API lo sirve.
      FRONT_DIR: 'test/fixtures/front',
      RENDER_EXTERNAL_URL: '',
      // Precios de INAC: un token de prueba (la ruta de GitHub Actions) y sin
      // clave de Anthropic (los tests simulan a Claude).
      PRECIOS_TOKEN: 'token-de-prueba-de-precios-0123456789abcdef',
      PRECIOS_CONTACTO: '',
      ANTHROPIC_API_KEY: '',
    },
    // Aplica las migraciones a la base de test antes de empezar.
    globalSetup: './test/global-setup.js',
    // Todos los archivos comparten la misma base: uno por vez.
    fileParallelism: false,
    hookTimeout: 60_000,
  },
});
