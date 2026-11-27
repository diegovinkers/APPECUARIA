// Copia de seguridad de la base (27/11, pedido de Diego). Railway la corre
// cada noche como un servicio aparte (cron) que arranca, hace esto y termina:
//   1. Saca la huella de la base (huella.js). Si es la misma que la de la
//      última copia, no guarda nada: esa noche no hubo cambios.
//   2. Copia la base entera (pg_dump, formato custom) y controla que traiga
//      las tablas (pg_restore --list).
//   3. La cifra (cifrado.js) y la sube (destino.js) a
//      copias/AAAA/MM/sapsa-AAAA-MM-DD-HHMM.dump.cifrada (hora de Uruguay).
//   4. La vuelve a bajar, la descifra y compara: si no es igual, falla.
//   5. Anota la huella en estado/ultima-copia.json.
// Nunca borra ninguna copia (decisión de Diego): se guardan todas.
//
// Variables: DATABASE_URL, COPIAS_CLAVE (la frase del cifrado, que guarda
// Diego), y el destino: COPIAS_R2_CUENTA, COPIAS_R2_BUCKET,
// COPIAS_R2_ACCESS_KEY_ID y COPIAS_R2_SECRET_ACCESS_KEY, o COPIAS_CARPETA
// para probar en la compu. Opcionales: PG_DUMP y PG_RESTORE (dónde están los
// programas) y COPIAS_FORZAR=1 (copia aunque no haya cambios).
// Uso: node src/copias/copia.js [--forzar]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { LARGO_MINIMO_CLAVE, cifrar, descifrar } from './cifrado.js';
import { destinoCarpeta, destinoR2 } from './destino.js';
import { calcularHuella } from './huella.js';

export const ESTADO = 'estado/ultima-copia.json';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// "copias/2026/11/sapsa-2026-11-27-0300.dump.cifrada", con la hora de Uruguay.
export function nombreCopia(ahora) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Montevideo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(ahora)
      .map((p) => [p.type, p.value]),
  );
  return `copias/${partes.year}/${partes.month}/sapsa-${partes.year}-${partes.month}-${partes.day}-${partes.hour}${partes.minute}.dump.cifrada`;
}

// Lo de cada noche, con todo lo de afuera pasado como funciones (así se prueba
// sin base ni R2). volcar() → Buffer con la copia; contarTablas(copia) → cuántas
// tablas con datos trae.
export async function hacerCopia({ huella, volcar, contarTablas, destino, clave, ahora = new Date(), forzar = false, log = console.log }) {
  const previo = await destino.leer(ESTADO);
  const ultima = previo ? JSON.parse(previo.toString('utf8')) : null;
  if (!forzar && ultima?.huella === huella) {
    log(`Sin cambios desde la última copia (${ultima.archivo}): esta noche no se guarda otra.`);
    return { guardada: false, ultima };
  }

  const copia = await volcar();
  const tablas = await contarTablas(copia);
  if (!copia.length || tablas === 0) throw new Error('La copia salió vacía: no se guarda');

  const cifrada = cifrar(copia, clave);
  const archivo = nombreCopia(ahora);
  await destino.guardar(archivo, cifrada);

  // Control: se baja lo guardado, se abre con la clave y se compara.
  const vuelta = await destino.leer(archivo);
  if (!vuelta || sha256(descifrar(vuelta, clave)) !== sha256(copia)) {
    throw new Error(`La copia guardada (${archivo}) no coincide con la original`);
  }

  const estado = { huella, archivo, fecha: ahora.toISOString(), bytes: cifrada.length, tablas };
  await destino.guardar(ESTADO, Buffer.from(JSON.stringify(estado, null, 2)), 'application/json');
  log(`Copia guardada y comprobada: ${archivo} (${(cifrada.length / 1024).toFixed(0)} KB, ${tablas} tablas con datos)${ultima ? '' : ' · es la primera'}.`);
  return { guardada: true, ...estado };
}

// --- Lo que corre en Railway -------------------------------------------------

function correr(programa, args, { entrada, ocultar = [] } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(programa, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const salida = [];
    let errores = '';
    p.stdout.on('data', (d) => salida.push(d));
    p.stderr.on('data', (d) => (errores += d));
    p.on('error', (e) => reject(new Error(`No se pudo ejecutar ${programa}: ${e.message}`)));
    p.on('close', (codigo) => {
      if (codigo === 0) return resolve(Buffer.concat(salida));
      let texto = errores.trim();
      for (const o of ocultar) if (o) texto = texto.replaceAll(o, '<oculto>');
      reject(new Error(`${programa} terminó con error (${codigo}): ${texto.slice(0, 500)}`));
    });
    p.stdin.end(entrada);
  });
}

// Qué falta en las variables (solo los nombres, nunca los valores).
export function leerConfiguracion(env = process.env) {
  const falta = [];
  if (!env.DATABASE_URL) falta.push('DATABASE_URL');
  if (!env.COPIAS_CLAVE) falta.push('COPIAS_CLAVE');
  else if (env.COPIAS_CLAVE.length < LARGO_MINIMO_CLAVE) falta.push(`COPIAS_CLAVE (tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres)`);
  const r2 = ['COPIAS_R2_CUENTA', 'COPIAS_R2_BUCKET', 'COPIAS_R2_ACCESS_KEY_ID', 'COPIAS_R2_SECRET_ACCESS_KEY'];
  if (!env.COPIAS_CARPETA) for (const v of r2) if (!env[v]) falta.push(v);
  if (falta.length) throw new Error(`Faltan variables para las copias: ${falta.join(', ')}`);
  return {
    url: env.DATABASE_URL,
    clave: env.COPIAS_CLAVE,
    destino: env.COPIAS_CARPETA
      ? destinoCarpeta(env.COPIAS_CARPETA)
      : destinoR2({
          cuenta: env.COPIAS_R2_CUENTA,
          bucket: env.COPIAS_R2_BUCKET,
          accessKeyId: env.COPIAS_R2_ACCESS_KEY_ID,
          secretAccessKey: env.COPIAS_R2_SECRET_ACCESS_KEY,
        }),
    pgDump: env.PG_DUMP || 'pg_dump',
    pgRestore: env.PG_RESTORE || 'pg_restore',
    forzar: env.COPIAS_FORZAR === '1',
  };
}

async function principal() {
  const cfg = leerConfiguracion();
  const forzar = cfg.forzar || process.argv.includes('--forzar');
  const cliente = new pg.Client({ connectionString: cfg.url });
  await cliente.connect();
  let huella;
  try {
    ({ huella } = await calcularHuella(cliente));
  } finally {
    await cliente.end();
  }
  console.log(`Copias de seguridad → ${cfg.destino.descripcion}`);
  await hacerCopia({
    huella,
    forzar,
    clave: cfg.clave,
    destino: cfg.destino,
    volcar: () => correr(cfg.pgDump, ['--format=custom', '--no-owner', '--no-privileges', `--dbname=${cfg.url}`], { ocultar: [cfg.url] }),
    contarTablas: async (copia) => {
      const lista = (await correr(cfg.pgRestore, ['--list'], { entrada: copia })).toString('utf8');
      return (lista.match(/ TABLE DATA public /g) ?? []).length;
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => {
    console.error(`La copia de seguridad falló: ${e.message}`);
    process.exit(1);
  });
}
