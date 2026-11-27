import 'dotenv/config';
import app from './app.js';
import { prisma } from './db.js';
import { PORT } from './config.js';
import { purgeExpiredSessions } from './auth/session.js';
import { purgarAsistente } from './asistente/asistente.service.js';

// Prisma se conecta recién en la primera consulta; esto hace que un error de
// conexión se vea al arrancar y no en el primer login.
try {
  await prisma.$queryRaw`SELECT 1`;
  console.log('>>> Base de datos conectada');
} catch (error) {
  console.error('No se pudo conectar a PostgreSQL. Revisá DATABASE_URL en .env y que el servicio esté iniciado.');
  console.error(error.message);
  process.exit(1);
}

// Las sesiones vencidas ya no sirven (se controlan en cada request); esto
// solo las borra de la tabla para que no se acumulen.
async function limpiarSesiones() {
  try {
    const borradas = await purgeExpiredSessions();
    if (borradas > 0) console.log(`>>> Sesiones vencidas borradas: ${borradas}`);
  } catch (error) {
    console.error('No se pudieron borrar las sesiones vencidas:', error.message);
  }
}
await limpiarSesiones();
setInterval(limpiarSesiones, 60 * 60 * 1000).unref();

// El asistente guarda las conversaciones 90 días (docs/superpowers/specs/2026-11-27-asistente-design.md).
async function limpiarAsistente() {
  try {
    const { conversaciones, textos } = await purgarAsistente();
    if (conversaciones + textos > 0) console.log(`>>> Asistente: ${conversaciones} conversaciones y ${textos} textos de más de 90 días borrados`);
  } catch (error) {
    console.error('No se pudo limpiar el asistente:', error.message);
  }
}
await limpiarAsistente();
setInterval(limpiarAsistente, 60 * 60 * 1000).unref();

app
  .listen(PORT, () => console.log(`>>> API en http://localhost:${PORT}`))
  .on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`El puerto ${PORT} ya está en uso. Cerrá la otra instancia o cambiá PORT en .env.`);
      process.exit(1);
    }
    throw error;
  });
