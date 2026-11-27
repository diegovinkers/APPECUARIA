// Cifrado de las copias (27/11): AES-256-GCM con una clave que sale de la
// frase de COPIAS_CLAVE (scrypt). Sin la frase, la copia no se puede abrir; si
// alguien cambia un solo byte, al descifrar da error (GCM lo detecta).
//
// Formato del archivo: "SAPSACP1" (8) + sal (16) + iv (12) + cifrado + etiqueta (16).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const MARCA = Buffer.from('SAPSACP1');
// scrypt: N = 2^15 (lento a propósito, para que adivinar la frase cueste).
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const LARGO_MINIMO_CLAVE = 20;

const claveDe = (frase, sal) => scryptSync(frase, sal, 32, SCRYPT);

export function cifrar(datos, frase) {
  if (!frase || frase.length < LARGO_MINIMO_CLAVE) throw new Error(`La clave de las copias tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres`);
  const sal = randomBytes(16);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', claveDe(frase, sal), iv);
  const cuerpo = Buffer.concat([c.update(datos), c.final()]);
  return Buffer.concat([MARCA, sal, iv, cuerpo, c.getAuthTag()]);
}

export function descifrar(archivo, frase) {
  const b = Buffer.from(archivo);
  if (b.length < MARCA.length + 16 + 12 + 16 || !b.subarray(0, MARCA.length).equals(MARCA)) {
    throw new Error('No es una copia cifrada de SAPSA');
  }
  const sal = b.subarray(8, 24);
  const iv = b.subarray(24, 36);
  const etiqueta = b.subarray(b.length - 16);
  const d = createDecipheriv('aes-256-gcm', claveDe(frase, sal), iv);
  d.setAuthTag(etiqueta);
  try {
    return Buffer.concat([d.update(b.subarray(36, b.length - 16)), d.final()]);
  } catch {
    throw new Error('No se pudo abrir la copia: la clave no es la correcta o el archivo está dañado');
  }
}
