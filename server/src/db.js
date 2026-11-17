// Cliente de Prisma compartido por toda la app (cada instancia abre su propio
// pool de conexiones, así que hay una sola).
// El cliente se genera con `npm run db:generate` en src/generated/ (no va a git).
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Falta la variable de entorno DATABASE_URL');

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
