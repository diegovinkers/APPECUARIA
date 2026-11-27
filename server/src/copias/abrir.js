// Abre una copia cifrada (27/11): la descifra y la deja como un .dump común,
// listo para restaurar. La clave se escribe a mano y no se ve en pantalla
// (o va en COPIAS_CLAVE). Uso, desde server/:
//   node src/copias/abrir.js <copia.dump.cifrada> [salida.dump]
// Para restaurar el .dump en un PostgreSQL que no sea el de Railway, ver
// la trampa de "pg_attver" en CLAUDE.md (hay que sacar esas líneas).
import { readFile, writeFile } from 'node:fs/promises';
import { descifrar } from './cifrado.js';

function pedirClave(pregunta) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) return reject(new Error('Escribí la clave en una terminal (o ponela en COPIAS_CLAVE)'));
    stdout.write(pregunta);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let clave = '';
    const tecla = (c) => {
      if (c === '\r' || c === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', tecla);
        stdout.write('\n');
        resolve(clave);
      } else if (c === '\u0003') {
        process.exit(130); // Ctrl+C
      } else if (c === '\u007f' || c === '\b') {
        clave = clave.slice(0, -1);
      } else {
        clave += c;
      }
    };
    stdin.on('data', tecla);
  });
}

const [entrada, salida = entrada?.replace(/\.cifrada$/, '') ?? ''] = process.argv.slice(2);
if (!entrada || salida === entrada) {
  console.error('Uso: node src/copias/abrir.js <copia.dump.cifrada> [salida.dump]');
  process.exit(1);
}
try {
  const clave = process.env.COPIAS_CLAVE || (await pedirClave('Clave de las copias (no se ve al escribir): '));
  await writeFile(salida, descifrar(await readFile(entrada), clave));
  console.log(`Listo: ${salida}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
