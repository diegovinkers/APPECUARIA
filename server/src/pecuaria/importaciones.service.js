// Importación de la planilla de cargas en dos pasos:
//   1. previsualizar: lee el archivo, resuelve los catálogos y guarda una
//      Importacion PENDIENTE con lo que se va a cargar (no toca nada más);
//   2. confirmar: crea lo que falta (campo, potreros), actualiza el uso de
//      suelo y agrega una versión de stock por potrero. Nada se pisa.
import { createHash } from 'node:crypto';
import { prisma } from '../db.js';
import { badRequest, conflict, notFound, parseId } from '../errors.js';
import { categorias, usosSuelo } from './catalogos.repository.js';
import { normalizarTexto } from './normalizar.js';
import { PlanillaError, leerPlanilla } from './planilla.parser.js';
import { crearLote, crearVersion } from './lotes.js';

export const fechaISO = (d) => (d ? d.toISOString().slice(0, 10) : null);
export const aFecha = (iso) => new Date(`${iso}T00:00:00Z`);
// La fecha de hoy en Uruguay, como "AAAA-MM-DD".
export const hoyISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Montevideo' });
const fechaUY = (d) => d.toLocaleDateString('es-UY', { timeZone: 'America/Montevideo' });

const sinDato = (n) => (n == null ? 'sin dato' : `${n} ha`);
const enPotreros = (nombres) => `(${nombres.length === 1 ? 'potrero' : 'potreros'} ${nombres.join(', ')})`;

// Resuelve textos de la planilla contra un catálogo, con caché. Lo que no
// reconoce queda anotado con los potreros donde aparece.
function resolvedor(catalogo) {
  const cache = new Map();
  const desconocidos = new Map();
  return {
    desconocidos,
    async resolver(texto, potrero) {
      const clave = normalizarTexto(texto);
      if (!cache.has(clave)) cache.set(clave, await catalogo.resolver(texto));
      const registro = cache.get(clave);
      if (!registro) {
        const lista = desconocidos.get(texto) ?? [];
        if (!lista.includes(potrero)) lista.push(potrero);
        desconocidos.set(texto, lista);
      }
      return registro;
    },
  };
}

function vistaPrevia(row) {
  const d = row.datos;
  return {
    id: row.id,
    tipo: row.tipo,
    estado: row.estado,
    archivo: row.archivo,
    hoja: row.hoja,
    hojas: d.hojas,
    fechaDatos: fechaISO(row.fechaDatos),
    campo: d.campo,
    resumen: d.resumen,
    potreros: d.potreros,
    otrosCampos: d.otrosCampos,
    advertencias: row.advertencias ?? [],
    errores: d.errores,
    puedeConfirmar: row.estado === 'PENDIENTE' && d.errores.length === 0,
    creadoEn: row.creadoEn,
    confirmadaEn: row.confirmadaEn,
  };
}

const yaImportada = (hashArchivo, hoja) =>
  prisma.importacion.findFirst({
    where: { tipo: 'PLANILLA', estado: 'CONFIRMADA', hashArchivo, hoja },
    select: { confirmadaEn: true },
  });

export async function previsualizarPlanilla({ buffer, archivo, hoja, campo, usuarioId }) {
  if (!buffer?.length) throw badRequest('Elegí el archivo de la planilla');
  let lectura;
  try {
    lectura = await leerPlanilla(buffer, { hoja, campo });
  } catch (error) {
    if (error instanceof PlanillaError) throw badRequest(error.message);
    throw error;
  }
  const hashArchivo = createHash('sha256').update(buffer).digest('hex');
  const errores = [...lectura.errores];
  const advertencias = [...lectura.advertencias];

  // Catálogos: un uso vacío (los pivots) es "Sin uso cargado".
  const usos = resolvedor(usosSuelo);
  const cats = resolvedor(categorias);
  const campoDb = await prisma.campo.findUnique({ where: { sigla: lectura.campo }, select: { id: true, nombre: true } });
  const existentes = new Map(
    campoDb
      ? (await prisma.potrero.findMany({ where: { campoId: campoDb.id }, select: { nombre: true, hectareas: true } })).map(
          (p) => [p.nombre, p.hectareas == null ? null : Number(p.hectareas)],
        )
      : [],
  );

  const potreros = [];
  for (const p of lectura.potreros) {
    const uso = await usos.resolver(p.usoTexto || 'Sin uso cargado', p.nombre);
    const lineas = [];
    for (const l of p.lineas) {
      const categoria = await cats.resolver(l.categoriaTexto, p.nombre);
      lineas.push({ ...l, categoriaId: categoria?.id ?? null, categoria: categoria?.nombre ?? null });
    }
    const existe = existentes.has(p.nombre);
    if (existe && existentes.get(p.nombre) !== p.hectareas) {
      advertencias.push(
        `Potrero ${p.nombre}: la planilla dice ${sinDato(p.hectareas)}, en la app hay ${sinDato(existentes.get(p.nombre))}: queda la de la app`,
      );
    }
    potreros.push({
      ...p,
      existe,
      uso: uso && { id: uso.id, nombre: uso.nombre, grupo: uso.grupo },
      lineas,
      cabezas: lineas.reduce((s, l) => s + l.cabezas, 0),
    });
  }

  for (const [texto, lista] of usos.desconocidos) {
    errores.push(
      `El uso de suelo "${texto}" ${enPotreros(lista)} no está en el catálogo: agregalo como uso o como alias de uno existente y volvé a subir la planilla`,
    );
  }
  for (const [texto, lista] of cats.desconocidos) {
    errores.push(
      `La categoría "${texto}" ${enPotreros(lista)} no está en el catálogo: agregala como categoría o como alias de una existente y volvé a subir la planilla`,
    );
  }
  const previa = await yaImportada(hashArchivo, lectura.hoja);
  if (previa) errores.push(`Esta hoja de este archivo ya se importó el ${fechaUY(previa.confirmadaEn)}`);

  const porCategoria = new Map();
  for (const l of potreros.flatMap((p) => p.lineas)) {
    const nombre = l.categoria ?? l.categoriaTexto;
    porCategoria.set(nombre, (porCategoria.get(nombre) ?? 0) + l.cabezas);
  }
  const resumen = {
    potreros: potreros.length,
    potrerosNuevos: potreros.filter((p) => !p.existe).length,
    cabezas: potreros.reduce((s, p) => s + p.cabezas, 0),
    porCategoria: [...porCategoria].map(([categoria, cabezas]) => ({ categoria, cabezas })).sort((a, b) => b.cabezas - a.cabezas),
  };

  const row = await prisma.importacion.create({
    data: {
      tipo: 'PLANILLA',
      archivo,
      hashArchivo,
      hoja: lectura.hoja,
      fechaDatos: lectura.fechaDatos ? aFecha(lectura.fechaDatos) : null,
      datos: {
        hojas: lectura.hojas.map((h) => h.nombre),
        campo: { sigla: lectura.campo, existe: Boolean(campoDb), id: campoDb?.id ?? null, nombre: campoDb?.nombre ?? null },
        potreros,
        resumen,
        otrosCampos: lectura.otrosCampos,
        errores,
      },
      advertencias,
      usuarioId,
    },
  });
  return vistaPrevia(row);
}

async function buscar(id) {
  const importacionId = parseId(id);
  const row = importacionId && (await prisma.importacion.findUnique({ where: { id: importacionId } }));
  if (!row) throw notFound('Importación no encontrada');
  return row;
}

export async function obtener(id) {
  return vistaPrevia(await buscar(id));
}

const ESTADO = { CONFIRMADA: 'confirmada', DESCARTADA: 'descartada' };

export async function confirmar(id, { fecha, nombreCampo }, usuarioId) {
  const row = await buscar(id);
  if (row.tipo !== 'PLANILLA') throw badRequest('Esta importación no es de una planilla');
  if (row.estado !== 'PENDIENTE') throw conflict(`Esta importación ya está ${ESTADO[row.estado]}`);
  const d = row.datos;
  if (d.errores.length) {
    throw badRequest('La vista previa tiene errores: corregí la planilla (o los catálogos) y volvé a subirla');
  }
  if (await yaImportada(row.hashArchivo, row.hoja)) throw conflict('Esta hoja de este archivo ya se importó');

  const f = aFecha(fecha ?? fechaISO(row.fechaDatos) ?? hoyISO());
  const resultado = await prisma.$transaction(
    async (tx) => {
      // Si otro la confirmó o descartó al mismo tiempo, no se carga dos veces.
      const { count } = await tx.importacion.updateMany({
        where: { id: row.id, estado: 'PENDIENTE' },
        data: { estado: 'CONFIRMADA', confirmadaEn: new Date(), fechaDatos: f },
      });
      if (count === 0) throw conflict('Esta importación ya no está pendiente');

      const sigla = d.campo.sigla;
      const campo =
        (await tx.campo.findUnique({ where: { sigla } })) ??
        (await tx.campo.create({ data: { sigla, nombre: nombreCampo || sigla } }));

      let potrerosNuevos = 0;
      for (const p of d.potreros) {
        // Un potrero que ya existe conserva sus datos (la app manda: por
        // ejemplo, las hectáreas corregidas a mano).
        let potrero = await tx.potrero.findUnique({ where: { campoId_nombre: { campoId: campo.id, nombre: p.nombre } } });
        if (!potrero) {
          potrero = await tx.potrero.create({
            data: {
              campoId: campo.id,
              nombre: p.nombre,
              hectareas: p.hectareas,
              hectareasAConfirmar: p.hectareasAConfirmar,
              subdivisiones: { create: p.subdivisiones.map((codigo) => ({ codigo })) },
            },
          });
          potrerosNuevos++;
        }

        // Uso de suelo: si cambió, se cierra el vigente y se abre el nuevo.
        // Una planilla más vieja que el uso vigente no lo cambia.
        const vigente = await tx.potreroUso.findFirst({ where: { potreroId: potrero.id, hasta: null }, orderBy: { desde: 'desc' } });
        if (!vigente || (vigente.usoSueloId !== p.uso.id && vigente.desde <= f)) {
          if (vigente) await tx.potreroUso.update({ where: { id: vigente.id }, data: { hasta: f } });
          await tx.potreroUso.create({ data: { potreroId: potrero.id, usoSueloId: p.uso.id, desde: f, usuarioId } });
        }

        // La planilla es la foto completa del potrero, por categoría. Cada fila
        // va al lote del potrero con esa categoría (el que está activo, o el
        // último que hubo); si no hay, se crea uno con nombre automático. Los
        // lotes del potrero que la planilla no trae quedan cerrados.
        const usados = new Set();
        const lineas = [];
        for (const l of p.lineas) {
          let lote = await tx.lote.findFirst({
            where: { potreroId: potrero.id, categoriaId: l.categoriaId, id: { notIn: [...usados] } },
            orderBy: [{ activo: 'desc' }, { id: 'desc' }],
          });
          if (lote && !lote.activo) lote = await tx.lote.update({ where: { id: lote.id }, data: { activo: true } });
          if (!lote) {
            lote = await crearLote(tx, {
              campoId: campo.id,
              potrero,
              categoria: { id: l.categoriaId, nombre: l.categoria },
            });
          }
          usados.add(lote.id);
          lineas.push({ ...l, loteId: lote.id });
        }
        await tx.lote.updateMany({
          where: { potreroId: potrero.id, activo: true, id: { notIn: [...usados] } },
          data: { activo: false },
        });
        await crearVersion(tx, { potreroId: potrero.id, fecha: f, origen: 'PLANILLA', importacionId: row.id, usuarioId, lineas });
      }
      return { campoId: campo.id, potrerosNuevos, versiones: d.potreros.length, cabezas: d.resumen.cabezas };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  return { id: row.id, estado: 'CONFIRMADA', archivo: row.archivo, hoja: row.hoja, fecha: fechaISO(f), campo: d.campo.sigla, ...resultado };
}

export async function descartar(id) {
  const row = await buscar(id);
  const { count } = await prisma.importacion.updateMany({ where: { id: row.id, estado: 'PENDIENTE' }, data: { estado: 'DESCARTADA' } });
  if (count === 0) throw conflict(`Esta importación ya está ${ESTADO[row.estado] ?? 'cerrada'}`);
  return obtener(row.id);
}
