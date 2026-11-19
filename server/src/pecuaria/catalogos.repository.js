// Catálogos editables de Pecuaria: usos de suelo, categorías y parámetros.
// Los usos y las categorías tienen alias: las formas en que la planilla los
// escribe, normalizadas. El nombre del registro siempre es uno de sus alias.
import { prisma } from '../db.js';
import { Prisma } from '../generated/prisma/client.ts';
import { conflict, parseId } from '../errors.js';
import { normalizarTexto } from './normalizar.js';
import { deducirSexo } from './sexo.js';

const isPrismaError = (error, code) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

// modelo: el catálogo; aliasModelo y fk: su tabla de alias; etiqueta: para los
// mensajes ("Ya existe el uso...", "ya corresponde al uso..."); alCrear:
// completa lo que falta antes de crear (por ejemplo, el sexo de una categoría).
function catalogoConAlias({ modelo, aliasModelo, fk, etiqueta, campos, alCrear = (data) => data }) {
  const select = {
    id: true,
    nombre: true,
    activo: true,
    orden: true,
    ...Object.fromEntries(campos.map((c) => [c, true])),
    alias: { select: { texto: true }, orderBy: { texto: 'asc' } },
  };
  // Los decimales (peso, precio) salen como número.
  const decimal = (v) => (v instanceof Prisma.Decimal ? Number(v) : v);
  const toPlain = (row) => row && { ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, decimal(v)])), alias: row.alias.map((a) => a.texto) };
  const textos = (lista) => [...new Set(lista.map(normalizarTexto))].filter(Boolean);

  // Que ningún texto sea ya alias de OTRO registro del catálogo.
  async function assertAliasLibres(lista, idPropio = null) {
    const ocupado = await prisma[aliasModelo].findFirst({
      where: { texto: { in: lista }, ...(idPropio && { NOT: { [fk]: idPropio } }) },
      select: { texto: true, [modelo]: { select: { nombre: true } } },
    });
    if (ocupado) throw conflict(`"${ocupado.texto}" ya corresponde ${etiqueta.al} "${ocupado[modelo].nombre}"`);
  }

  async function findById(id) {
    const rowId = parseId(id);
    if (!rowId) return null;
    return toPlain(await prisma[modelo].findUnique({ where: { id: rowId }, select }));
  }

  return {
    findById,

    async list() {
      const rows = await prisma[modelo].findMany({ select, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] });
      return rows.map(toPlain);
    },

    async create({ alias = [], ...datos }) {
      const data = alCrear(datos);
      const lista = textos([data.nombre, ...alias]);
      await assertAliasLibres(lista);
      try {
        return toPlain(
          await prisma[modelo].create({ data: { ...data, alias: { create: lista.map((texto) => ({ texto })) } }, select }),
        );
      } catch (error) {
        if (isPrismaError(error, 'P2002')) throw conflict(`Ya existe ${etiqueta.el} "${data.nombre}"`);
        throw error;
      }
    },

    // Si vienen alias, reemplazan a los anteriores. Si no, se conservan y, al
    // renombrar, se suma el nombre nuevo (el viejo sigue sirviendo).
    // Devuelve { antes, despues }, o null si no existe.
    async update(id, { alias, ...data }) {
      const antes = await findById(id);
      if (!antes) return null;
      const nombre = data.nombre ?? antes.nombre;
      const lista = textos(alias ? [nombre, ...alias] : [...antes.alias, nombre]);
      await assertAliasLibres(lista, antes.id);
      try {
        await prisma.$transaction([
          prisma[modelo].update({ where: { id: antes.id }, data }),
          prisma[aliasModelo].deleteMany({ where: { [fk]: antes.id } }),
          prisma[aliasModelo].createMany({ data: lista.map((texto) => ({ texto, [fk]: antes.id })) }),
        ]);
      } catch (error) {
        if (isPrismaError(error, 'P2002')) throw conflict(`Ya existe ${etiqueta.el} "${nombre}"`);
        throw error;
      }
      return { antes, despues: await findById(antes.id) };
    },

    // Lo que dice la planilla → el registro del catálogo, o null si no lo reconoce.
    async resolver(texto) {
      const normalizado = normalizarTexto(texto);
      if (!normalizado) return null;
      const alias = await prisma[aliasModelo].findUnique({ where: { texto: normalizado }, select: { [modelo]: { select } } });
      return toPlain(alias?.[modelo] ?? null);
    },
  };
}

export const usosSuelo = catalogoConAlias({
  modelo: 'usoSuelo',
  aliasModelo: 'usoSueloAlias',
  fk: 'usoSueloId',
  etiqueta: { el: 'el uso de suelo', al: 'al uso de suelo' },
  campos: ['grupo'],
});

export const categorias = catalogoConAlias({
  modelo: 'categoria',
  aliasModelo: 'categoriaAlias',
  fk: 'categoriaId',
  etiqueta: { el: 'la categoría', al: 'a la categoría' },
  campos: ['especie', 'sexo', 'idCategoriaCigam', 'pesoPromedioKg', 'precioUsd', 'precioPor'],
  // Sin sexo elegido: se deduce del nombre ("Terneras" → HEMBRA).
  alCrear: (data) => (data.sexo === undefined ? { ...data, sexo: deducirSexo(data.nombre) } : data),
});

export const resolverUsoSuelo = (texto) => usosSuelo.resolver(texto);
export const resolverCategoria = (texto) => categorias.resolver(texto);

// --- Parámetros ---

const toParametro = (row) => row && { clave: row.clave, valor: Number(row.valor), descripcion: row.descripcion };

export async function listParametros() {
  const rows = await prisma.parametro.findMany({ orderBy: { clave: 'asc' } });
  return rows.map(toParametro);
}

// Devuelve { antes, despues }, o null si el parámetro no existe.
export async function setParametro(clave, valor) {
  const antes = toParametro(await prisma.parametro.findUnique({ where: { clave } }));
  if (!antes) return null;
  const despues = toParametro(await prisma.parametro.update({ where: { clave }, data: { valor } }));
  return { antes, despues };
}
