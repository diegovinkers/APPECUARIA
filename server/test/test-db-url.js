// URL de la base de test: la variable TEST_DATABASE_URL (útil en CI) o, si no
// está, DATABASE_URL de server/.env.test. Nunca la de .env.
// Los tests vacían todas las tablas: si la base no termina en _test, se
// niegan a correr, para no borrar por error la de desarrollo.
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

export function testDatabaseUrl() {
  const path = fileURLToPath(new URL('../.env.test', import.meta.url));
  const url = process.env.TEST_DATABASE_URL || config({ path, processEnv: {}, quiet: true }).parsed?.DATABASE_URL;
  if (!url) {
    throw new Error('Falta DATABASE_URL en server/.env.test (copiá .env.test.example y completalo).');
  }
  const database = new URL(url).pathname.replace(/^\//, '');
  if (!database.endsWith('_test')) {
    throw new Error(`Los tests borran todos los datos: la base de test tiene que terminar en _test (es "${database}").`);
  }
  return url;
}
