// Uso: npm run db:seed
// Lee las credenciales de .env (ver .env.example). Se puede repetir sin riesgo.
import 'dotenv/config';
import { prisma } from '../src/db.js';
import { runSeed, SeedError } from '../src/seed/seed.js';

try {
  await runSeed(prisma);
} catch (error) {
  console.error(error instanceof SeedError ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
