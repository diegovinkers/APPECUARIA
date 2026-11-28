// Las herramientas del asistente, fase 1: solo lectura
// (docs/superpowers/specs/2026-11-27-asistente-design.md).
//
// Cada herramienta:
// - declara su `entrada` con zod (de ahí sale el JSON Schema para Claude, y con
//   lo mismo se valida lo que manda Claude antes de usarlo);
// - lee con `pedir()`: las mismas rutas de las pantallas, con la cookie de la
//   persona (sesión, permisos y alcance por estancia de siempre);
// - devuelve solo lo que hace falta (la lista de potreros entera pesa 100 KB),
//   y `aTexto()` saca los datos de personas antes de mandarlo.
import { z } from 'zod';
import { pedir } from './llamar.js';
import { filtrarBusqueda, textosPotrero } from './busqueda.js';

const sinTildes = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

// --- El catálogo (estancias, categorías, usos, tipos) ---

export async function leerCatalogo(ctx) {
  const [campos, categorias, usos, tipos] = await Promise.all([
    pedir(ctx, { ruta: '/campos' }),
    pedir(ctx, { ruta: '/categorias' }),
    pedir(ctx, { ruta: '/usos-suelo' }),
    pedir(ctx, { ruta: '/tipos-movimiento' }),
  ]);
  return {
    campos: campos.filter((c) => c.activo !== false).map((c) => ({ id: c.id, sigla: c.sigla, nombre: c.nombre, tipo: c.tipo })),
    categorias: categorias
      .filter((c) => c.activo !== false)
      .map((c) => ({ id: c.id, nombre: c.nombre, sexo: c.sexo ?? null, alias: c.alias ?? [] })),
    usos: usos.filter((u) => u.activo !== false).map((u) => ({ nombre: u.nombre, grupo: u.grupo, alias: u.alias ?? [] })),
    tipos: tipos
      .filter((t) => t.activo !== false)
      .map((t) => ({
        id: t.id,
        clave: t.clave,
        nombre: t.nombre,
        efecto: t.efecto,
        pideCausa: Boolean(t.pideCausa),
        pideGuia: Boolean(t.pideGuia),
        causas: (t.causas ?? []).filter((c) => c.activo !== false).map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre })),
      })),
  };
}

const esFeedlot = (campo) => campo?.tipo === 'CONFINAMIENTO';

// "EG", "la gateada", "Gateada" → la estancia (o el feedlot) del catálogo.
export function buscarCampo(catalogo, texto) {
  const q = sinTildes(texto);
  if (!q) return null;
  return (
    catalogo.campos.find((c) => sinTildes(c.sigla) === q) ??
    catalogo.campos.find((c) => sinTildes(c.nombre) === q) ??
    catalogo.campos.find((c) => sinTildes(c.nombre).includes(q)) ??
    null
  );
}

function campoOError(catalogo, texto) {
  const campo = buscarCampo(catalogo, texto);
  if (!campo) {
    const lista = catalogo.campos.map((c) => `${c.sigla} (${c.nombre})`).join(', ');
    throw new Error(`No encontré "${texto}" entre las estancias y feedlots de esta persona: ${lista}.`);
  }
  return campo;
}

// "terneros", "vaquillonas 1-2", un alias de la planilla → la categoría.
export function buscarCategoria(catalogo, texto) {
  const q = sinTildes(texto);
  if (!q) return null;
  const todas = catalogo.categorias;
  return (
    todas.find((c) => sinTildes(c.nombre) === q) ??
    todas.find((c) => c.alias.some((a) => sinTildes(a) === q)) ??
    todas.find((c) => sinTildes(c.nombre).startsWith(q)) ??
    null
  );
}

function categoriaOError(catalogo, texto) {
  const categoria = buscarCategoria(catalogo, texto);
  if (!categoria) throw new Error(`No encontré la categoría "${texto}". Usá un nombre del catálogo.`);
  return categoria;
}

export function buscarTipo(catalogo, texto) {
  const q = sinTildes(texto);
  return catalogo.tipos.find((t) => sinTildes(t.clave) === q || sinTildes(t.nombre) === q) ?? null;
}

// --- Formas cortas ---

const nombrePotrero = (p) => [p.campo?.sigla, p.nombre].filter(Boolean).join(' ');
const linkPotrero = (id) => `/pecuaria/potreros/${id}`;

function potreroCorto(p) {
  const s = p.stock ?? {};
  return {
    id: p.id,
    potrero: nombrePotrero(p),
    link: linkPotrero(p.id),
    tipo: p.tipo === 'POTRERO' ? undefined : p.tipo,
    hectareas: p.hectareas,
    hectareasAConfirmar: p.hectareasAConfirmar || undefined,
    areaUtilizable: p.areaUtilizable,
    uso: p.usoActual?.nombre,
    grupoUso: p.usoActual?.grupo,
    usoDesde: p.usoActual?.desde,
    cabezas: s.cabezas ?? 0,
    cabHa: s.cabHa,
    kgPvHa: s.kgPvHa,
    kilosEstimados: s.kilosEstimados || undefined,
    valorUsd: s.valorUsd != null ? Math.round(s.valorUsd) : undefined,
    stockAl: s.fecha,
    lotes: (s.lotes ?? s.lineas ?? []).map((l) => ({
      loteId: l.loteId,
      lote: l.lote,
      link: `/pecuaria/lotes/${l.loteId}`,
      categoria: l.categoria,
      cabezas: l.cabezas,
      pesoPromedioKg: l.pesoPromedioKg,
      fechaEntrada: l.fechaEntrada,
      pesoEntradaKg: l.pesoEntradaKg,
      pesoEstimadoKg: l.pesoEstimadoKg,
    })),
    pasto: p.pasto,
    descanso: p.descanso,
    feedlot: p.feedlot,
  };
}

const sigla = (p) => p?.campo?.sigla;
const lugar = (p) => (p ? [sigla(p), p.nombre].filter(Boolean).join(' ') : undefined);

function movimientoCorto(m) {
  return {
    id: m.id,
    fecha: m.fecha,
    tipo: m.tipo?.nombre,
    cabezas: m.cabezas,
    categoria: m.categoriaOrigen === m.categoriaDestino || !m.categoriaDestino ? m.categoriaOrigen : `${m.categoriaOrigen ?? '—'} → ${m.categoriaDestino}`,
    de: lugar(m.potreroOrigen),
    a: lugar(m.potreroDestino),
    loteDe: m.loteOrigen?.nombre,
    loteA: m.loteDestino?.nombre,
    pesoPromedioKg: m.pesoPromedioKg,
    causa: m.causa?.nombre ?? m.causa,
    guia: m.guia,
    precioVentaUsd: m.precioVentaUsd,
    precioVentaPor: m.precioVentaPor,
    valorVentaUsd: m.valorVentaUsd,
    nota: m.nota,
    revertido: m.revertido || undefined,
    esReversionDe: m.revierteA,
    eventoMultiple: m.evento ? { id: m.evento.id, tipo: m.evento.tipo, pasos: m.evento.pasos } : undefined,
  };
}

function procesoCorto(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    link: `/pecuaria/procesos/${p.id}`,
    estancia: p.campo?.sigla,
    estado: p.estado,
    campania: p.campania,
    modalidad: p.modalidad,
    fechaInicio: p.fechaInicio,
    etapa: p.textoEtapa ?? p.etapa,
    diagnosticoAMedias: p.aMedias?.texto,
    potreros: p.potreros,
    cabezas: p.cabezas,
    proximoEvento: p.proxima?.titulo ?? p.proxima?.texto,
    embudo: p.embudoCorto,
    vacasSinDecidir: p.pendientes || undefined,
  };
}

// --- Las herramientas ---

const texto = (max, descripcion) => z.string().trim().min(1).max(max).describe(descripcion);
const id = (descripcion) => z.int().positive().describe(descripcion);
const fecha = (descripcion) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe(descripcion);
const ESTANCIA = 'Sigla o nombre de la estancia o del feedlot (por ejemplo "EG" o "La Gateada"). Sin esto, todas las de la persona.';

export const HERRAMIENTAS = [
  {
    nombre: 'buscar_potreros',
    descripcion:
      'Lista potreros (o corrales) con lo que tienen hoy: uso del suelo, hectáreas, cabezas, lotes por categoría con su peso, cab/ha, kg PV/ha, valor, pasto y días de descanso. ' +
      'Sirve para encontrar un potrero por su nombre ("8.1", "p1", "frente a") y para preguntas como "¿qué potreros tienen terneros?", "¿cuáles están vacíos?", "¿dónde hay más carga?". ' +
      'Trae como mucho `limite` potreros, con el total y la suma de lo filtrado.',
    entrada: z.object({
      texto: texto(60, 'Parte del nombre del potrero o del lote, como lo dijo la persona ("8.1", "p1", "frente").').optional(),
      estancia: texto(60, ESTANCIA).optional(),
      categoria: texto(60, 'Solo los potreros con animales de esta categoría (nombre del catálogo).').optional(),
      grupoUso: z.enum(['CN', 'VERDEO', 'OTRO']).describe('Solo campo natural (CN), verdeos o el resto (OTRO).').optional(),
      conAnimales: z.boolean().describe('true: solo con animales; false: solo vacíos.').optional(),
      ordenarPor: z.enum(['nombre', 'cabezas', 'cabHa', 'kgPvHa', 'descanso']).describe('Por defecto, el orden de la planilla.').optional(),
      limite: z.int().min(1).max(60).describe('Cuántos potreros traer como mucho (por defecto 25).').optional(),
    }),
    aviso: (e) => (e.texto ? `Buscando el potrero ${e.texto}…` : 'Mirando los potreros…'),
    async ejecutar(ctx, e) {
      const campo = e.estancia ? campoOError(ctx.catalogo, e.estancia) : null;
      const categoria = e.categoria ? categoriaOError(ctx.catalogo, e.categoria) : null;
      // La lista de una estancia no siempre trae su sigla: se la ponemos.
      const lista = campo
        ? (await pedir(ctx, { ruta: `/campos/${campo.id}/potreros` })).map((p) => ({ ...p, campo: p.campo ?? { sigla: campo.sigla } }))
        : await pedir(ctx, { ruta: '/potreros', query: { grupo: 'estancias' } });
      let filtrados = lista.filter((p) => {
        if (p.activo === false) return false;
        const lotes = p.stock?.lotes ?? [];
        if (categoria && !lotes.some((l) => l.categoriaId === categoria.id)) return false;
        if (e.grupoUso && (p.usoActual?.grupo ?? 'OTRO') !== e.grupoUso) return false;
        const cabezas = p.stock?.cabezas ?? 0;
        if (e.conAnimales === true && cabezas === 0) return false;
        if (e.conAnimales === false && cabezas > 0) return false;
        return true;
      });
      // Como en la app: busca en todo el potrero y, si no hay nada preciso, lo que se parece.
      filtrados = filtrarBusqueda(filtrados, e.texto ?? '', textosPotrero);
      const orden = {
        cabezas: (a, b) => (b.stock?.cabezas ?? 0) - (a.stock?.cabezas ?? 0),
        cabHa: (a, b) => (b.stock?.cabHa ?? -1) - (a.stock?.cabHa ?? -1),
        kgPvHa: (a, b) => (b.stock?.kgPvHa ?? -1) - (a.stock?.kgPvHa ?? -1),
        descanso: (a, b) => (b.descanso?.conGanado ? -1 : (b.descanso?.dias ?? -1)) - (a.descanso?.conGanado ? -1 : (a.descanso?.dias ?? -1)),
        nombre: (a, b) => nombrePotrero(a).localeCompare(nombrePotrero(b), 'es', { numeric: true }),
      }[e.ordenarPor];
      if (orden) filtrados = [...filtrados].sort(orden);
      const limite = e.limite ?? 25;
      return {
        total: filtrados.length,
        mostrados: Math.min(limite, filtrados.length),
        suma: {
          cabezas: filtrados.reduce((s, p) => s + (p.stock?.cabezas ?? 0), 0),
          hectareas: Math.round(filtrados.reduce((s, p) => s + (p.hectareas ?? 0), 0)),
          cabezasDeLaCategoria: categoria
            ? filtrados.reduce((s, p) => s + (p.stock?.lotes ?? []).filter((l) => l.categoriaId === categoria.id).reduce((t, l) => t + l.cabezas, 0), 0)
            : undefined,
        },
        potreros: filtrados.slice(0, limite).map(potreroCorto),
      };
    },
  },
  {
    nombre: 'ficha_potrero',
    descripcion:
      'Todo sobre un potrero: lo que tiene hoy (lotes, cabezas, pesos, carga, pasto, descanso), los procesos en curso de sus lotes, ' +
      'los últimos cambios (movimientos y eventos, con cómo cambiaron las cabezas y la carga), los usos del suelo y las lecturas de pasto. ' +
      'Necesita el id del potrero (lo da buscar_potreros).',
    entrada: z.object({
      potreroId: id('El id del potrero.'),
      cambios: z.int().min(1).max(30).describe('Cuántos cambios recientes traer (por defecto 10).').optional(),
    }),
    aviso: () => 'Abriendo la ficha del potrero…',
    async ejecutar(ctx, e) {
      const [potrero, historial] = await Promise.all([
        pedir(ctx, { ruta: `/potreros/${e.potreroId}` }),
        pedir(ctx, { ruta: `/potreros/${e.potreroId}/historial` }),
      ]);
      return {
        potrero: { ...potreroCorto(potrero), procesos: potrero.procesos },
        ultimosCambios: (historial.versiones ?? []).slice(0, e.cambios ?? 10).map((v) => ({
          fecha: v.fecha,
          que: v.titulo,
          detalle: v.detalle,
          cabezas: v.cabezas,
          carga: v.carga,
          cambio: v.cambio,
          nota: v.nota,
          pasto: v.pasto,
        })),
        usos: (historial.usos ?? []).slice(0, 6).map((u) => ({ uso: u.uso?.nombre, grupo: u.uso?.grupo, desde: u.desde, hasta: u.hasta })),
        eventos: (historial.eventos ?? []).slice(0, 10),
        pasto: (historial.pasto ?? []).slice(0, 6),
      };
    },
  },
  {
    nombre: 'resumen',
    descripcion:
      'El resumen del ganado: cabezas por categoría y por grupo de uso (campo natural, verdeos, corral), hectáreas, carga y valor del ganado en USD, ' +
      'de todas las estancias de la persona (con una fila por estancia) o de una sola. Con feedlots: true, el de los feedlots (por etapa de encierre).',
    entrada: z.object({
      estancia: texto(60, ESTANCIA).optional(),
      feedlots: z.boolean().describe('true para el resumen de todos los feedlots.').optional(),
    }),
    aviso: (e) => (e.estancia ? `Armando el resumen de ${e.estancia}…` : 'Armando el resumen…'),
    async ejecutar(ctx, e) {
      if (e.estancia) {
        const campo = campoOError(ctx.catalogo, e.estancia);
        return { estancia: `${campo.sigla} (${campo.nombre})`, ...(await pedir(ctx, { ruta: `/campos/${campo.id}/resumen` })) };
      }
      return pedir(ctx, { ruta: '/resumen', query: { grupo: e.feedlots ? 'feedlots' : 'estancias' } });
    },
  },
  {
    nombre: 'historial',
    descripcion:
      'Lo que se registró: movimientos (de potrero a potrero, entre estancias, cambios de categoría, compras, ventas con su precio, muertes, nacimientos, reversiones) ' +
      'y eventos (pesadas, recuentos, vacunas, pasto…), del más nuevo al más viejo. Se puede filtrar por fechas, estancia, potrero, lote, categoría y tipo. ' +
      'Trae el total de cada cosa y como mucho `limite` filas.',
    entrada: z.object({
      ver: z.enum(['movimientos', 'eventos', 'todo']).describe('Por defecto, todo.').optional(),
      desde: fecha('Desde esta fecha (AAAA-MM-DD), inclusive.').optional(),
      hasta: fecha('Hasta esta fecha (AAAA-MM-DD), inclusive.').optional(),
      estancia: texto(60, ESTANCIA).optional(),
      potreroId: id('Solo lo de este potrero.').optional(),
      loteId: id('Solo lo de este lote.').optional(),
      categoria: texto(60, 'Solo lo de esta categoría.').optional(),
      tipo: texto(60, 'Clave o nombre del tipo de movimiento o evento del catálogo (por ejemplo VENTA o "Pesada").').optional(),
      limite: z.int().min(1).max(80).describe('Cuántas filas traer como mucho (por defecto 40).').optional(),
    }),
    aviso: () => 'Revisando el historial…',
    async ejecutar(ctx, e) {
      const campo = e.estancia ? campoOError(ctx.catalogo, e.estancia) : null;
      const categoria = e.categoria ? categoriaOError(ctx.catalogo, e.categoria) : null;
      let tipo = null;
      if (e.tipo) {
        tipo = buscarTipo(ctx.catalogo, e.tipo);
        if (!tipo) throw new Error(`No encontré el tipo "${e.tipo}". Usá una clave o un nombre del catálogo.`);
      }
      const query = {
        ver: e.ver ?? 'todo',
        desde: e.desde,
        hasta: e.hasta,
        potreroId: e.potreroId,
        loteId: e.loteId,
        categoriaId: categoria?.id,
        tipoId: tipo?.id,
      };
      const datos = campo
        ? await pedir(ctx, { ruta: `/campos/${campo.id}/movimientos`, query })
        : await pedir(ctx, { ruta: '/movimientos', query });
      const limite = e.limite ?? 40;
      const movimientos = datos.movimientos ?? [];
      const eventos = datos.eventos ?? [];
      return {
        totales: datos.resumen,
        movimientos: { total: movimientos.length, filas: movimientos.slice(0, limite).map(movimientoCorto) },
        eventos: { total: eventos.length, filas: eventos.slice(0, limite) },
      };
    },
  },
  {
    nombre: 'ver_lote',
    descripcion: 'Un lote: dónde está, su categoría, cabezas y peso, su historia (movimientos y eventos) y, si está repartido, en qué potreros están sus partes.',
    entrada: z.object({ loteId: id('El id del lote (lo dan buscar_potreros o ficha_potrero).') }),
    aviso: () => 'Abriendo el lote…',
    ejecutar: (ctx, e) => pedir(ctx, { ruta: `/lotes/${e.loteId}` }),
  },
  {
    nombre: 'procesos',
    descripcion:
      'Los procesos del ciclo reproductivo (entore, IATF, transferencia de embriones → ecografía → parición → destete): en qué etapa está cada uno, ' +
      'cuántas cabezas, en qué potreros y cuál es el próximo evento (con los días que faltan o el atraso).',
    entrada: z.object({
      estado: z.enum(['ABIERTO', 'CERRADO', 'ANULADO', 'TODOS']).describe('Por defecto, los abiertos.').optional(),
      estancia: texto(60, ESTANCIA).optional(),
    }),
    aviso: () => 'Mirando los procesos…',
    async ejecutar(ctx, e) {
      const campo = e.estancia ? campoOError(ctx.catalogo, e.estancia) : null;
      const lista = campo
        ? await pedir(ctx, { ruta: `/campos/${campo.id}/procesos`, query: { estado: e.estado } })
        : await pedir(ctx, { ruta: '/procesos', query: { estado: e.estado } });
      return { total: lista.length, procesos: lista.map(procesoCorto) };
    },
  },
  {
    nombre: 'ficha_proceso',
    descripcion: 'Todo sobre un proceso: cronograma (fechas estimadas y reales), embudo (servidas, preñadas, paridas, destetadas), lotes por estado y potrero, y lo que se cargó.',
    entrada: z.object({ procesoId: id('El id del proceso (lo da la herramienta procesos).') }),
    aviso: () => 'Abriendo el proceso…',
    ejecutar: (ctx, e) => pedir(ctx, { ruta: `/procesos/${e.procesoId}` }),
  },
  {
    nombre: 'feedlot',
    descripcion:
      'El análisis de los feedlots por corral: categoría, cabezas, días de encierre, peso de entrada y peso estimado de hoy, ganancia diaria, salida probable (y si está atrasada), comedero por cabeza y valor.',
    entrada: z.object({ feedlot: texto(60, 'Sigla o nombre del feedlot. Sin esto, todos.').optional() }),
    aviso: () => 'Mirando los corrales…',
    async ejecutar(ctx, e) {
      if (e.feedlot) {
        const campo = campoOError(ctx.catalogo, e.feedlot);
        if (!esFeedlot(campo)) throw new Error(`${campo.sigla} no es un feedlot.`);
        return pedir(ctx, { ruta: `/campos/${campo.id}/feedlot` });
      }
      return pedir(ctx, { ruta: '/feedlots' });
    },
  },
  {
    nombre: 'precios_inac',
    descripcion: 'Los precios de hacienda de INAC de la última semana publicada (novillo, vaca, vaquillona, ternero…), en USD por kilo, con la semana anterior para comparar.',
    entrada: z.object({}),
    aviso: () => 'Buscando los precios de INAC…',
    ejecutar: (ctx) => pedir(ctx, { ruta: '/precios/ultimos' }),
  },
];

const POR_NOMBRE = new Map(HERRAMIENTAS.map((h) => [h.nombre, h]));
export const herramienta = (nombre) => POR_NOMBRE.get(nombre) ?? null;

// Las definiciones para la API de Anthropic. eager_input_streaming: la entrada
// llega mientras se genera; la validamos nosotros con zod (validarEntrada).
export function definiciones() {
  return HERRAMIENTAS.map((h) => {
    const { $schema, ...esquema } = z.toJSONSchema(h.entrada);
    return { name: h.nombre, description: h.descripcion, input_schema: esquema, eager_input_streaming: true };
  });
}

export function validarEntrada(h, entrada) {
  return h.entrada.safeParse(entrada ?? {});
}
