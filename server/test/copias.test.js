// Copias de seguridad (27/11): huella, cifrado y la copia de cada noche.
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { prisma } from '../src/db.js';
import { cifrar, descifrar } from '../src/copias/cifrado.js';
import { ESTADO, hacerCopia, leerConfiguracion, nombreCopia } from '../src/copias/copia.js';
import { destinoCarpeta } from '../src/copias/destino.js';
import { calcularHuella } from '../src/copias/huella.js';
import { ALICE, createUser, useTestDatabase } from './helpers.js';
import { testDatabaseUrl } from './test-db-url.js';

useTestDatabase();

const CLAVE = 'una-frase-larga-de-prueba-para-cifrar';

describe('cifrado', () => {
  it('se abre con la misma clave; con otra, o si se toca un byte, da error', () => {
    const datos = Buffer.from('la base entera, de mentira');
    const cifrada = cifrar(datos, CLAVE);
    expect(cifrada.subarray(0, 8).toString()).toBe('SAPSACP1');
    expect(cifrada.includes(datos)).toBe(false);
    expect(descifrar(cifrada, CLAVE).equals(datos)).toBe(true);
    // Dos veces lo mismo da archivos distintos (sal y iv al azar).
    expect(cifrar(datos, CLAVE).equals(cifrada)).toBe(false);
    expect(() => descifrar(cifrada, 'otra-frase-larga-de-prueba-cualquiera')).toThrow(/clave no es la correcta/);
    const tocada = Buffer.from(cifrada);
    tocada[40] ^= 1;
    expect(() => descifrar(tocada, CLAVE)).toThrow(/dañado/);
    expect(() => descifrar(Buffer.from('cualquier cosa'), CLAVE)).toThrow(/No es una copia/);
    expect(() => cifrar(datos, 'corta')).toThrow(/al menos 20/);
  });
});

describe('nombre de la copia', () => {
  it('con la fecha y la hora de Uruguay, en una carpeta por año y mes', () => {
    expect(nombreCopia(new Date('2026-11-27T06:00:00Z'))).toBe('copias/2026/11/sapsa-2026-11-27-0300.dump.cifrada');
    expect(nombreCopia(new Date('2027-01-01T02:30:00Z'))).toBe('copias/2026/12/sapsa-2026-12-31-2330.dump.cifrada');
  });
});

describe('configuración', () => {
  it('dice qué variables faltan, sin mostrar ningún valor', () => {
    expect(() => leerConfiguracion({})).toThrow(
      'Faltan variables para las copias: DATABASE_URL, COPIAS_CLAVE, COPIAS_R2_CUENTA, COPIAS_R2_BUCKET, COPIAS_R2_ACCESS_KEY_ID, COPIAS_R2_SECRET_ACCESS_KEY',
    );
    let error;
    try {
      leerConfiguracion({ DATABASE_URL: 'postgresql://u:secreto@h/b', COPIAS_CLAVE: 'corta-secreta', COPIAS_CARPETA: 'x' });
    } catch (e) {
      error = e.message;
    }
    expect(error).toMatch(/COPIAS_CLAVE \(tiene que tener al menos 20 caracteres\)/);
    expect(error).not.toMatch(/secret/);
    const ok = leerConfiguracion({ DATABASE_URL: 'postgresql://u:p@h/b', COPIAS_CLAVE: CLAVE, COPIAS_CARPETA: 'c:/copias', COPIAS_FORZAR: '1' });
    expect(ok.destino.descripcion).toBe('carpeta c:/copias');
    expect(ok.forzar).toBe(true);
    expect(ok.pgDump).toBe('pg_dump');
  });
});

describe('la copia de cada noche', () => {
  let carpeta;
  let destino;
  beforeEach(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'copias-'));
    destino = destinoCarpeta(carpeta);
  });
  afterEach(() => rm(carpeta, { recursive: true, force: true }));

  const archivos = async () => (await readdir(join(carpeta, 'copias'), { recursive: true })).filter((f) => f.endsWith('.cifrada'));
  const noche = (huella, fecha, extra = {}) =>
    hacerCopia({
      huella,
      destino,
      clave: CLAVE,
      ahora: new Date(fecha),
      volcar: async () => Buffer.from(`copia con huella ${huella}`),
      contarTablas: async () => 12,
      log: () => {},
      ...extra,
    });

  it('guarda solo las noches con cambios, todas, sin borrar ninguna', async () => {
    expect((await noche('A', '2026-11-27T06:00:00Z')).guardada).toBe(true);
    // Mismo contenido: no se guarda otra.
    expect((await noche('A', '2026-11-28T06:00:00Z')).guardada).toBe(false);
    expect((await noche('B', '2026-11-29T06:00:00Z')).guardada).toBe(true);
    expect((await archivos()).sort()).toEqual([join('2026', '11', 'sapsa-2026-11-27-0300.dump.cifrada'), join('2026', '11', 'sapsa-2026-11-29-0300.dump.cifrada')]);
    // La guardada se abre con la clave y es la copia.
    const guardada = await readFile(join(carpeta, 'copias', '2026', '11', 'sapsa-2026-11-29-0300.dump.cifrada'));
    expect(descifrar(guardada, CLAVE).toString()).toBe('copia con huella B');
    const estado = JSON.parse(await readFile(join(carpeta, ESTADO), 'utf8'));
    expect(estado).toMatchObject({ huella: 'B', archivo: 'copias/2026/11/sapsa-2026-11-29-0300.dump.cifrada', tablas: 12 });
  });

  it('con --forzar guarda aunque no haya cambios', async () => {
    await noche('A', '2026-11-27T06:00:00Z');
    expect((await noche('A', '2026-11-27T18:00:00Z', { forzar: true })).guardada).toBe(true);
    expect(await archivos()).toHaveLength(2);
  });

  it('una copia vacía no se guarda, y si lo guardado no coincide, falla sin anotar la huella', async () => {
    await expect(noche('A', '2026-11-27T06:00:00Z', { contarTablas: async () => 0 })).rejects.toThrow(/vacía/);
    const roto = { ...destino, leer: async (n) => (n === ESTADO ? null : cifrar(Buffer.from('otra cosa'), CLAVE)) };
    await expect(noche('A', '2026-11-27T06:00:00Z', { destino: roto })).rejects.toThrow(/no coincide/);
    expect(await destino.leer(ESTADO)).toBeNull();
  });
});

describe('la huella de la base', () => {
  let cliente;
  beforeEach(async () => {
    cliente = new pg.Client({ connectionString: testDatabaseUrl() });
    await cliente.connect();
  });
  afterEach(() => cliente.end());
  const huella = async () => (await calcularHuella(cliente)).huella;

  it('no cambia porque alguien entre o salga; cambia con un dato de verdad', async () => {
    const alice = await createUser(ALICE);
    const campo = await prisma.campo.create({ data: { sigla: 'EJ', nombre: 'Estancia Ejemplo' } });
    const antes = await huella();

    // Entrar y salir: sesión, auditoría de login y logout, último acceso, intentos.
    await prisma.sesion.create({ data: { id: 'a'.repeat(64), usuarioId: alice.id, venceEn: new Date(Date.now() + 3_600_000) } });
    await prisma.auditoria.createMany({
      data: ['LOGIN_OK', 'LOGIN_FALLIDO', 'LOGOUT'].map((accion) => ({ accion, usuarioId: alice.id })),
    });
    await prisma.usuario.update({ where: { id: alice.id }, data: { ultimoAcceso: new Date(), intentosFallidos: 2 } });
    // Una revisión de precios de INAC que no trajo nada.
    await prisma.importacionPrecio.create({ data: { fuente: 'INAC', disparadoPor: 'PROGRAMADO', estado: 'SIN_CAMBIOS' } });
    expect(await huella()).toBe(antes);

    // Un dato de verdad: cambia.
    await prisma.campo.update({ where: { id: campo.id }, data: { nombre: 'Estancia Ejemplo Norte' } });
    const conCambio = await huella();
    expect(conCambio).not.toBe(antes);

    // Una acción auditada que no es de entrar o salir, también.
    await prisma.auditoria.create({ data: { accion: 'POTRERO_EDITADO', usuarioId: alice.id } });
    expect(await huella()).not.toBe(conCambio);
  });
});
