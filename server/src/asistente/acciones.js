// Las acciones del asistente, fase 2 (docs/superpowers/plans/2026-11-27-asistente-fase2.md).
//
// Cada herramienta `proponer_*`:
// - recibe lo que entendió Claude (ids de potreros y lotes, que salen de las
//   herramientas de la fase 1, y nombres del catálogo para el tipo, la
//   categoría y la causa);
// - arma el cuerpo de la ruta de siempre (`armar`);
// - corre SOLO la vista previa de esa ruta, con la cookie de la persona;
// - resume la vista previa para la tarjeta (`tarjeta`).
// NUNCA registra: lo registra la persona al tocar Confirmar
// (asistente.service.js → confirmarPropuesta), con la misma ruta y el mismo cuerpo.
import { z } from 'zod';
import { pedir } from './llamar.js';
import { buscarCampo, buscarCategoria, buscarTipo } from './herramientas.js';

const sinTildes = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const fechaUy = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const n = (x) => (x == null ? '—' : Number(x).toLocaleString('es-UY', { maximumFractionDigits: 2 }));
const usd = (x) => `USD ${Number(x).toLocaleString('es-UY', { maximumFractionDigits: 0 })}`;
const linkPotrero = (id) => `/pecuaria/potreros/${id}`;

// "8.1: 80 → 30 cab." (o "12: vacío → 50 cab.").
const cambioCabezas = (nombre, antes, despues) => {
  const a = antes?.cabezas ?? 0;
  const d = despues?.cabezas ?? 0;
  return `${nombre}: ${a === 0 ? 'vacío' : n(a)} → ${d === 0 ? 'vacío' : `${n(d)} cab.`}`;
};

// La fecha va en la tarjeta solo si no es hoy.
const renglonFecha = (fecha, hoy) => (fecha && fecha !== hoy ? [`Fecha: ${fechaUy(fecha)}`] : []);

// --- Lo que se le pide al catálogo ---

function categoriaOError(catalogo, texto) {
  const c = buscarCategoria(catalogo, texto);
  if (!c) throw new Error(`No encontré la categoría "${texto}". Usá un nombre del catálogo.`);
  return c;
}

// Tipos que se proponen con cada herramienta. Los de reproducción van por los
// procesos (fase 3) y el destete también.
const REPRODUCCION = new Set(['ECOGRAFIA', 'INSEMINACION', 'TRANSFERENCIA_EMBRIONES', 'ENTORE', 'ABORTO', 'FIN_SERVICIO', 'PARICION']);

function tipoOError(catalogo, texto, efectos, que) {
  const t = buscarTipo(catalogo, texto);
  if (!t) throw new Error(`No encontré el tipo "${texto}". Usá una clave o un nombre del catálogo.`);
  if (!efectos.includes(t.efecto)) throw new Error(`"${t.nombre}" no es ${que}.`);
  return t;
}

// "diarrea", "MU-003" → la causa del tipo.
export function buscarCausa(tipo, texto) {
  const q = sinTildes(texto);
  if (!q) return null;
  const causas = tipo.causas ?? [];
  return (
    causas.find((c) => sinTildes(c.codigo) === q || sinTildes(c.nombre) === q) ??
    causas.find((c) => sinTildes(c.nombre).includes(q)) ??
    null
  );
}

// Lo que tiene un lote hoy: su potrero y su línea de stock.
async function loteHoy(ctx, loteId) {
  const datos = await pedir(ctx, { ruta: `/lotes/${loteId}` });
  const potreroId = datos.lote?.potrero?.id;
  if (!datos.lote?.activo || !potreroId || !datos.actual) throw new Error(`El lote ${datos.lote?.nombre ?? loteId} no tiene animales hoy.`);
  const potrero = await pedir(ctx, { ruta: `/potreros/${potreroId}` });
  const linea = potrero.stock?.lineas?.find((l) => l.loteId === loteId);
  if (!linea) throw new Error(`El lote ${datos.lote.nombre} no está en ${potrero.nombre}.`);
  return { lote: datos.lote, linea, potrero };
}

const comunes = {
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('La fecha en que pasó (AAAA-MM-DD). Sin esto, hoy. Solo si la persona dijo otra fecha.')
    .optional(),
  nota: z.string().trim().min(1).max(255).describe('Una nota corta, solo si la persona la dijo.').optional(),
};
const id = (descripcion) => z.int().positive().describe(descripcion);
const peso = (descripcion) => z.number().positive().max(2000).describe(descripcion);
const ALTURA = z.enum(['BAJO', 'MEDIO', 'ALTO']);
const NOMBRE_ALTURA = { BAJO: 'Bajo', MEDIO: 'Medio', ALTO: 'Alto' };

// --- Las acciones ---

export const ACCIONES = [
  {
    nombre: 'proponer_movimiento',
    descripcion:
      'Propone mover animales de un potrero a otro de la MISMA estancia, o cambiar la categoría de un lote. No registra nada: arma la propuesta para que la persona toque Confirmar. ' +
      'Necesita el id del lote de origen y el del potrero de destino (salen de buscar_potreros o ficha_potrero). ' +
      'Cómo quedan los animales en el destino ("como"): "automatico" (por defecto: si van todas las cabezas, el lote entero; si va una parte y en el destino hay otra parte del mismo lote, se suma a ella; si no, sigue siendo el mismo lote repartido), ' +
      '"sumar" a un lote que ya está en el destino (loteDestinoId), "lote_nuevo" (un lote aparte, con su categoría y nombre) o "cambio_categoria" (todo el lote cambia de categoría y se queda en su potrero: no hace falta destino). ' +
      'Para mover a otra estancia usá proponer_entre_campos.',
    entrada: z.object({
      loteId: id('El lote de donde salen los animales.'),
      cabezas: z.int().min(1).max(1_000_000).describe('Cuántas cabezas se mueven.'),
      destinoPotreroId: id('El potrero adonde van (no hace falta en un cambio de categoría).').optional(),
      como: z.enum(['automatico', 'sumar', 'lote_nuevo', 'cambio_categoria']).optional(),
      loteDestinoId: id('Con "sumar": el lote del destino al que se suman.').optional(),
      categoria: z.string().trim().min(1).max(60).describe('Con "cambio_categoria": la categoría nueva. Con "lote_nuevo": la del lote nuevo (por defecto, la misma).').optional(),
      nombreLoteNuevo: z.string().trim().min(1).max(80).describe('Con "lote_nuevo": el nombre, si la persona lo dijo.').optional(),
      pesoPromedioKg: peso('El peso promedio de los que se mueven, si lo dijo.').optional(),
      pastoOrigen: ALTURA.describe('Cómo quedó el pasto del potrero que dejan, si lo dijo.').optional(),
      pastoDestino: ALTURA.describe('Cómo está el pasto del potrero al que llegan, si lo dijo.').optional(),
      ...comunes,
    }),
    aviso: () => 'Armando el movimiento…',
    rutaVistaPrevia: '/movimientos/vista-previa',
    rutaConfirmar: '/movimientos',
    async armar(ctx, e) {
      const { lote, linea, potrero } = await loteHoy(ctx, e.loteId);
      const como = e.como ?? 'automatico';
      const base = {
        loteOrigenId: e.loteId,
        cabezas: e.cabezas,
        ...(e.pesoPromedioKg && { pesoPromedioKg: e.pesoPromedioKg }),
        ...(e.fecha && { fecha: e.fecha }),
        ...(e.nota && { nota: e.nota }),
      };
      if (como === 'cambio_categoria') {
        if (!e.categoria) throw new Error('Falta la categoría nueva.');
        const c = categoriaOError(ctx.catalogo, e.categoria);
        return { ...base, destinoPotreroId: potrero.id, modo: 'CATEGORIA', categoriaId: c.id };
      }
      if (!e.destinoPotreroId) throw new Error('Falta el potrero de destino.');
      const cuerpo = {
        ...base,
        destinoPotreroId: e.destinoPotreroId,
        ...(e.pastoOrigen && { pastoOrigen: e.pastoOrigen }),
        ...(e.pastoDestino && { pastoDestino: e.pastoDestino }),
      };
      if (como === 'sumar') {
        if (!e.loteDestinoId) throw new Error('Falta el lote del destino al que se suman (loteDestinoId).');
        return { ...cuerpo, modo: 'SUMAR', loteDestinoId: e.loteDestinoId };
      }
      if (como === 'lote_nuevo') {
        const c = e.categoria ? categoriaOError(ctx.catalogo, e.categoria) : { id: linea.categoriaId };
        return { ...cuerpo, modo: 'NUEVO', nuevoLote: { categoriaId: c.id, ...(e.nombreLoteNuevo && { nombre: e.nombreLoteNuevo }) } };
      }
      // Automático: como lo propone la pantalla de mover.
      if (e.cabezas >= linea.cabezas) return { ...cuerpo, modo: 'ENTERO' };
      const destino = await pedir(ctx, { ruta: `/potreros/${e.destinoPotreroId}` });
      const pariente = destino.stock?.lineas?.find((l) => l.familiaId === linea.familiaId && l.loteId !== lote.id);
      if (pariente) return { ...cuerpo, modo: 'SUMAR', loteDestinoId: pariente.loteId };
      return { ...cuerpo, modo: 'NUEVO', mismoLote: true };
    },
    tarjeta(v, cuerpo, { hoy }) {
      if (cuerpo.modo === 'CATEGORIA') {
        return {
          titulo: `Cambiar de categoría: ${v.loteDestino}`,
          renglones: [`${n(cuerpo.cabezas)} cab. pasan a ${v.categoriaDestino}`, `Se quedan en ${v.origen.potrero}`, ...renglonFecha(v.fecha, hoy)],
          avisos: v.avisos ?? [],
          link: linkPotrero(v.origen.potreroId),
        };
      }
      const como = { SUMAR: `Se suman al lote ${v.loteDestino}`, ENTERO: `Va el lote entero (${v.loteDestino})`, NUEVO: `Quedan en el lote ${v.loteDestino}` }[cuerpo.modo];
      return {
        titulo: `Mover ${n(cuerpo.cabezas)} ${v.categoriaDestino} de ${v.origen.potrero} a ${v.destino.potrero}`,
        renglones: [
          cambioCabezas(v.origen.potrero, v.origen.antes, v.origen.despues),
          cambioCabezas(v.destino.potrero, v.destino.antes, v.destino.despues),
          como,
          ...(cuerpo.pesoPromedioKg ? [`Peso: ${n(cuerpo.pesoPromedioKg)} kg`] : []),
          ...(v.pasto?.salida || v.pasto?.entrada ? [`Pasto: ${[v.pasto.salida && `${v.pasto.salida} al salir`, v.pasto.entrada && `${v.pasto.entrada} al entrar`].filter(Boolean).join(' · ')}`] : []),
          ...renglonFecha(v.fecha, hoy),
          ...(cuerpo.nota ? [`Nota: ${cuerpo.nota}`] : []),
        ],
        avisos: v.avisos ?? [],
        link: linkPotrero(v.destino.potreroId),
      };
    },
  },
  {
    nombre: 'proponer_entre_campos',
    descripcion:
      'Propone llevar animales de una estancia a OTRA (por ejemplo de EG a La Seda, o de una estancia a un feedlot). No registra nada: arma la propuesta para que la persona toque Confirmar. ' +
      'Necesita el id del lote de origen y el del potrero de destino en la otra estancia. Si van todas las cabezas, va el lote entero; si va una parte, forma un lote nuevo en el destino. ' +
      'La guía de tránsito va si la persona la dijo.',
    entrada: z.object({
      loteId: id('El lote de donde salen los animales.'),
      cabezas: z.int().min(1).max(1_000_000).describe('Cuántas cabezas se llevan.'),
      destinoPotreroId: id('El potrero de la otra estancia adonde van.'),
      categoria: z.string().trim().min(1).max(60).describe('La categoría con la que llegan, si cambia (por defecto, la misma).').optional(),
      nombreLoteNuevo: z.string().trim().min(1).max(80).describe('El nombre del lote nuevo en el destino, si lo dijo.').optional(),
      pesoPromedioKg: peso('El peso promedio de los que se llevan, si lo dijo.').optional(),
      guia: z.string().trim().min(1).max(30).describe('El número de guía, si lo dijo.').optional(),
      ...comunes,
    }),
    aviso: () => 'Armando el movimiento entre estancias…',
    rutaVistaPrevia: '/movimientos/entre-campos/vista-previa',
    rutaConfirmar: '/movimientos/entre-campos',
    async armar(ctx, e) {
      const { linea } = await loteHoy(ctx, e.loteId);
      const c = e.categoria ? categoriaOError(ctx.catalogo, e.categoria) : null;
      const cuerpo = {
        loteOrigenId: e.loteId,
        cabezas: e.cabezas,
        destinoPotreroId: e.destinoPotreroId,
        ...(e.pesoPromedioKg && { pesoPromedioKg: e.pesoPromedioKg }),
        ...(e.guia && { guia: e.guia }),
        ...(e.fecha && { fecha: e.fecha }),
        ...(e.nota && { nota: e.nota }),
      };
      if (e.cabezas >= linea.cabezas) return { ...cuerpo, modo: 'ENTERO', ...(c && { categoriaId: c.id }) };
      return { ...cuerpo, modo: 'NUEVO', nuevoLote: { categoriaId: c?.id ?? linea.categoriaId, ...(e.nombreLoteNuevo && { nombre: e.nombreLoteNuevo }) } };
    },
    tarjeta(v, cuerpo, { hoy }) {
      const de = `${v.origen.campo?.sigla ?? ''} ${v.origen.potrero}`.trim();
      const a = `${v.destino.campo?.sigla ?? ''} ${v.destino.potrero}`.trim();
      return {
        titulo: `Llevar ${n(cuerpo.cabezas)} ${v.destino.categoria} de ${de} a ${a}`,
        renglones: [
          cambioCabezas(de, v.origen.antes, v.origen.despues),
          v.destino.loteEntero ? `Va el lote entero (${v.destino.lote})` : `Llegan al lote nuevo ${v.destino.lote}`,
          ...(cuerpo.guia ? [`Guía: ${cuerpo.guia}`] : []),
          ...(cuerpo.pesoPromedioKg ? [`Peso: ${n(cuerpo.pesoPromedioKg)} kg`] : []),
          ...renglonFecha(v.fecha, hoy),
          ...(cuerpo.nota ? [`Nota: ${cuerpo.nota}`] : []),
        ],
        avisos: v.avisos ?? [],
        link: linkPotrero(v.destino.potreroId),
      };
    },
  },
  {
    nombre: 'proponer_entrada_salida',
    descripcion:
      'Propone una entrada o una salida de animales: compra, nacimiento, traslado de entrada (entran a un potrero) o venta, muerte, consumo, pérdida, traslado de salida (salen de un lote). ' +
      'No registra nada: arma la propuesta para que la persona toque Confirmar. ' +
      'Salida: tipo, loteId y cabezas (y la causa si el tipo la pide; en una venta, el precio por kilo o por cabeza si lo dijo; por kilo hace falta el peso). ' +
      'Entrada: tipo, potreroId y una línea por grupo que entra (cabezas y la categoría de un lote nuevo, o el loteId de un lote que ya está en ese potrero). ' +
      'Las causas de cada tipo y si la causa o la guía son obligatorias están en el catálogo de las instrucciones: si falta una obligatoria, preguntala antes.',
    entrada: z.object({
      tipo: z.string().trim().min(1).max(60).describe('Clave o nombre del tipo (VENTA, MUERTE, COMPRA, NACIMIENTO…).'),
      loteId: id('Salida: el lote de donde salen.').optional(),
      cabezas: z.int().min(1).max(1_000_000).describe('Salida: cuántas cabezas salen.').optional(),
      potreroId: id('Entrada: el potrero adonde entran.').optional(),
      lineas: z
        .array(
          z.object({
            cabezas: z.int().min(1).max(1_000_000),
            categoria: z.string().trim().min(1).max(60).describe('La categoría del lote nuevo que forman.').optional(),
            loteId: id('O el lote del potrero al que se suman.').optional(),
            nombreLote: z.string().trim().min(1).max(80).describe('El nombre del lote nuevo, si lo dijo.').optional(),
            pesoPromedioKg: peso('El peso promedio, si lo dijo.').optional(),
          }),
        )
        .min(1)
        .max(10)
        .describe('Entrada: lo que entra.')
        .optional(),
      pesoPromedioKg: peso('Salida: el peso promedio de los que salen, si lo dijo.').optional(),
      causa: z.string().trim().min(1).max(80).describe('La causa (nombre o código del catálogo), si el tipo la pide o la persona la dijo.').optional(),
      guia: z.string().trim().min(1).max(30).describe('El número de guía, si lo dijo.').optional(),
      precioVentaUsd: z.number().positive().max(10_000_000).describe('Venta: el precio en dólares, si lo dijo.').optional(),
      precioVentaPor: z.enum(['KG', 'CABEZA']).describe('Venta: si el precio es por kilo o por cabeza.').optional(),
      loteMadresId: id('Nacimiento: el lote de las madres, si se sabe.').optional(),
      ...comunes,
    }),
    aviso: (e) => `Armando ${sinTildes(e.tipo) === 'venta' ? 'la venta' : 'el registro'}…`,
    rutaVistaPrevia: '/entradas-salidas/vista-previa',
    rutaConfirmar: '/entradas-salidas',
    async armar(ctx, e) {
      const tipo = tipoOError(ctx.catalogo, e.tipo, ['ENTRA', 'SALE'], 'una entrada ni una salida');
      let causa = null;
      if (e.causa) {
        causa = buscarCausa(tipo, e.causa);
        if (!causa) {
          const lista = (tipo.causas ?? []).map((c) => c.nombre).join(', ');
          throw new Error(`No encontré la causa "${e.causa}" para ${tipo.nombre}.${lista ? ` Las que hay: ${lista}.` : ''}`);
        }
      }
      const cuerpo = {
        tipoId: tipo.id,
        ...(causa && { causaId: causa.id }),
        ...(e.guia && { guia: e.guia }),
        ...(e.fecha && { fecha: e.fecha }),
        ...(e.nota && { nota: e.nota }),
      };
      if (tipo.efecto === 'SALE') {
        if (!e.loteId || !e.cabezas) throw new Error('En una salida hacen falta el lote (loteId) y las cabezas.');
        if (e.precioVentaUsd && !e.precioVentaPor) throw new Error('Falta si el precio es por kilo o por cabeza.');
        return {
          ...cuerpo,
          loteId: e.loteId,
          cabezas: e.cabezas,
          ...(e.pesoPromedioKg && { pesoPromedioKg: e.pesoPromedioKg }),
          ...(e.precioVentaUsd && { precioVentaUsd: e.precioVentaUsd, precioVentaPor: e.precioVentaPor }),
        };
      }
      if (!e.potreroId || !e.lineas?.length) throw new Error('En una entrada hacen falta el potrero (potreroId) y lo que entra (lineas).');
      return {
        ...cuerpo,
        potreroId: e.potreroId,
        ...(e.loteMadresId && { loteMadresId: e.loteMadresId }),
        lineas: e.lineas.map((l) => {
          if (!l.loteId && !l.categoria) throw new Error('Cada línea necesita la categoría del lote nuevo o el lote al que se suman.');
          return {
            cabezas: l.cabezas,
            ...(l.pesoPromedioKg && { pesoPromedioKg: l.pesoPromedioKg }),
            ...(l.loteId
              ? { loteId: l.loteId }
              : { nuevoLote: { categoriaId: categoriaOError(ctx.catalogo, l.categoria).id, ...(l.nombreLote && { nombre: l.nombreLote }) } }),
          };
        }),
      };
    },
    tarjeta(v, cuerpo, { hoy, catalogo }) {
      const tipo = catalogo.tipos.find((t) => t.id === cuerpo.tipoId);
      const causa = tipo?.causas?.find((c) => c.id === cuerpo.causaId);
      const sale = v.efecto === 'SALE';
      const cabezas = sale ? cuerpo.cabezas : cuerpo.lineas.reduce((s, l) => s + l.cabezas, 0);
      const categorias = sale
        ? []
        : cuerpo.lineas.map((l) => {
            const c = l.nuevoLote ? catalogo.categorias.find((x) => x.id === l.nuevoLote.categoriaId)?.nombre : null;
            return `${n(l.cabezas)} ${c ?? 'al lote que ya está'}${l.pesoPromedioKg ? ` (${n(l.pesoPromedioKg)} kg)` : ''}`;
          });
      return {
        titulo: `${tipo?.nombre ?? 'Registro'}: ${n(cabezas)} cab. ${sale ? 'de' : 'a'} ${v.potrero}`,
        renglones: [
          cambioCabezas(v.potrero, v.antes, v.despues),
          ...categorias,
          ...(sale && cuerpo.pesoPromedioKg ? [`Peso: ${n(cuerpo.pesoPromedioKg)} kg`] : []),
          ...(cuerpo.precioVentaUsd
            ? [`Precio: USD ${n(cuerpo.precioVentaUsd)} ${cuerpo.precioVentaPor === 'KG' ? 'el kilo' : 'por cabeza'}${v.valorVentaUsd ? ` · total ${usd(v.valorVentaUsd)}` : ''}`]
            : []),
          ...(causa ? [`Causa: ${causa.nombre}`] : []),
          ...(cuerpo.guia ? [`Guía: ${cuerpo.guia}`] : []),
          ...renglonFecha(v.fecha, hoy),
          ...(cuerpo.nota ? [`Nota: ${cuerpo.nota}`] : []),
        ],
        avisos: v.avisos ?? [],
        link: linkPotrero(v.potreroId),
      };
    },
  },
  {
    nombre: 'proponer_evento',
    descripcion:
      'Propone anotar un evento: pesada, recuento, vacuna (aftosa, carbunclo), tratamiento, castración, identificación, alimentación u otro tipo de evento del catálogo. ' +
      'No registra nada: arma la propuesta para que la persona toque Confirmar. ' +
      'A quién: "lotes" (con lo de cada lote: en una pesada el peso promedio; en un recuento las cabezas contadas y, si hay diferencia, el motivo), "potreroIds" (todos los lotes de esos potreros), ' +
      '"categoria" + "estancia" (todos los de esa categoría) o solo "estancia" (toda la estancia). ' +
      'Una pesada o un recuento van por lote. Los eventos de reproducción (ecografía, entore, inseminación, embriones, aborto) se cargan desde los procesos: no los propongas.',
    entrada: z.object({
      tipo: z.string().trim().min(1).max(60).describe('Clave o nombre del tipo de evento (PESADA, RECUENTO, VACUNA_AFTOSA…).'),
      lotes: z
        .array(
          z.object({
            loteId: id('El lote.'),
            pesoPromedioKg: peso('Pesada: el peso promedio.').optional(),
            pesadas: z.int().min(1).describe('Pesada: cuántas se pesaron, si fue una parte.').optional(),
            contadas: z.int().min(0).describe('Recuento: cuántas se contaron.').optional(),
            motivo: z.string().trim().min(1).max(120).describe('Recuento con diferencia: el motivo.').optional(),
            cabezas: z.int().min(1).describe('Otros eventos: a cuántas cabezas, si no fue a todo el lote.').optional(),
          }),
        )
        .min(1)
        .max(100)
        .optional(),
      potreroIds: z.array(id('Un potrero.')).min(1).max(100).optional(),
      categoria: z.string().trim().min(1).max(60).describe('Todos los de esta categoría (con la estancia).').optional(),
      estancia: z.string().trim().min(1).max(60).describe('La estancia (sola: toda la estancia; con categoría: esa categoría en la estancia).').optional(),
      producto: z.string().trim().min(1).max(120).describe('Vacuna o tratamiento: el producto, si lo dijo.').optional(),
      racion: z.string().trim().min(1).max(120).describe('Alimentación: la ración, si la dijo.').optional(),
      kgPorCabezaDia: z.number().positive().max(100).describe('Alimentación: kg por cabeza por día, si lo dijo.').optional(),
      ...comunes,
    }),
    aviso: () => 'Armando el evento…',
    rutaVistaPrevia: '/eventos-registro/vista-previa',
    rutaConfirmar: '/eventos-registro',
    async armar(ctx, e) {
      const tipo = tipoOError(ctx.catalogo, e.tipo, ['REGISTRO'], 'un evento');
      if (REPRODUCCION.has(tipo.clave)) throw new Error(`${tipo.nombre} se carga desde los procesos (Procesos en la barra de abajo), no desde el asistente.`);
      const datos = {
        ...(e.producto && { producto: e.producto }),
        ...(e.racion && { racion: e.racion }),
        ...(e.kgPorCabezaDia && { kgPorCabezaDia: e.kgPorCabezaDia }),
      };
      const cuerpo = {
        tipoId: tipo.id,
        ...(Object.keys(datos).length && { datos }),
        ...(e.fecha && { fecha: e.fecha }),
        ...(e.nota && { nota: e.nota }),
      };
      if (e.lotes?.length) return { ...cuerpo, nivel: 'LOTE', lineas: e.lotes };
      if (e.potreroIds?.length) return { ...cuerpo, nivel: 'POTRERO', potreroIds: e.potreroIds };
      if (!e.estancia) throw new Error('Falta a quién: lotes, potreros, una categoría con su estancia o la estancia.');
      const campo = buscarCampo(ctx.catalogo, e.estancia);
      if (!campo) throw new Error(`No encontré la estancia "${e.estancia}".`);
      if (e.categoria) return { ...cuerpo, nivel: 'CATEGORIA', campoId: campo.id, categoriaId: categoriaOError(ctx.catalogo, e.categoria).id };
      return { ...cuerpo, nivel: 'CAMPO', campoId: campo.id };
    },
    tarjeta(v, cuerpo, { hoy }) {
      return {
        titulo: `${v.tipo?.nombre ?? 'Evento'}: ${n(v.cabezas)} cab. en ${v.lotes} ${v.lotes === 1 ? 'lote' : 'lotes'}`,
        renglones: [
          ...(v.oracion ? [v.oracion.replace(/^Vas a anotar\s*/i, '').replace(/^./, (c) => c.toUpperCase())] : []),
          ...(v.cambiaStock ? ['Cambia el stock (las cabezas o el peso de los lotes)'] : []),
          ...renglonFecha(v.fecha, hoy),
          ...(cuerpo.nota ? [`Nota: ${cuerpo.nota}`] : []),
        ],
        avisos: v.avisos ?? [],
        link: cuerpo.potreroIds?.length === 1 ? linkPotrero(cuerpo.potreroIds[0]) : null,
      };
    },
  },
  {
    nombre: 'proponer_pasto',
    descripcion:
      'Propone anotar el pasto de uno o varios potreros (una recorrida, sin mover ganado): Bajo (menos de 10 cm), Medio (10 a 20) o Alto (más de 20). ' +
      'No registra nada: arma la propuesta para que la persona toque Confirmar. Los corrales y los feedlots no llevan pasto. ' +
      'Si el pasto se dice al mover animales, va en proponer_movimiento (pastoOrigen y pastoDestino).',
    entrada: z.object({
      lecturas: z
        .array(z.object({ potreroId: id('El potrero.'), altura: ALTURA }))
        .min(1)
        .max(60),
      ...comunes,
    }),
    aviso: () => 'Armando la recorrida de pasto…',
    rutaVistaPrevia: null,
    rutaConfirmar: '/pasto',
    async armar(ctx, e) {
      const ids = new Set();
      for (const l of e.lecturas) {
        if (ids.has(l.potreroId)) throw new Error('Hay un potrero repetido.');
        ids.add(l.potreroId);
      }
      return { lecturas: e.lecturas, ...(e.fecha && { fecha: e.fecha }), ...(e.nota && { nota: e.nota }) };
    },
    // No hay vista previa: se controla que cada potrero exista, sea de la
    // persona y lleve pasto (la ruta lo vuelve a controlar al confirmar).
    async vistaPrevia(ctx, cuerpo) {
      const potreros = await Promise.all(cuerpo.lecturas.map((l) => pedir(ctx, { ruta: `/potreros/${l.potreroId}` })));
      for (const p of potreros) if (p.llevaPasto === false) throw new Error(`${p.nombre} es un corral: no lleva pasto.`);
      return { fecha: cuerpo.fecha ?? null, potreros: potreros.map((p) => ({ id: p.id, nombre: p.nombre })) };
    },
    tarjeta(v, cuerpo, { hoy }) {
      const nombres = new Map(v.potreros.map((p) => [p.id, p.nombre]));
      return {
        titulo: `Pasto de ${cuerpo.lecturas.length} ${cuerpo.lecturas.length === 1 ? 'potrero' : 'potreros'}`,
        renglones: [
          ...cuerpo.lecturas.map((l) => `${nombres.get(l.potreroId)}: ${NOMBRE_ALTURA[l.altura]}`),
          ...renglonFecha(v.fecha, hoy),
          ...(cuerpo.nota ? [`Nota: ${cuerpo.nota}`] : []),
        ],
        avisos: [],
        link: cuerpo.lecturas.length === 1 ? linkPotrero(cuerpo.lecturas[0].potreroId) : null,
      };
    },
  },
];

const POR_NOMBRE = new Map(ACCIONES.map((a) => [a.nombre, a]));
export const accion = (nombre) => POR_NOMBRE.get(nombre) ?? null;

/**
 * Arma la propuesta: el cuerpo, la vista previa (con la cookie de la persona)
 * y la tarjeta. No registra nada. Lanza un Error con el mensaje de la ruta si
 * la vista previa no cierra (por ejemplo "en el 8.1 hay 30").
 * @returns {Promise<{ ruta, cuerpo, tarjeta }>}
 */
export async function proponer(ctx, a, entrada, { hoy }) {
  const cuerpo = await a.armar(ctx, entrada);
  const vista = a.vistaPrevia
    ? await a.vistaPrevia(ctx, cuerpo)
    : await pedir(ctx, { ruta: a.rutaVistaPrevia, metodo: 'POST', cuerpo });
  return { ruta: a.rutaConfirmar, cuerpo, tarjeta: a.tarjeta(vista, cuerpo, { hoy, catalogo: ctx.catalogo }) };
}
