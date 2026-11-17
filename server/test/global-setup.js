// Corre una vez antes de todos los tests: deja la base de test con el esquema
// al día (migrate deploy solo aplica migraciones pendientes, no borra nada).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testDatabaseUrl } from './test-db-url.js';

export default function setup() {
  const serverDir = fileURLToPath(new URL('..', import.meta.url));
  const prismaCli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}
