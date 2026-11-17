// Configuración del CLI de Prisma (migraciones, seed, studio).
// Prisma 7 no lee el .env por su cuenta: lo carga dotenv acá. Si DATABASE_URL
// ya está definida en el entorno (como en los tests), dotenv no la pisa.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
