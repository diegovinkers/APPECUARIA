import { z } from 'zod';

// Texto opcional: "", "   ", null o ausente se guardan como null.
const textoOpcional = (max, mensaje) =>
  z
    .preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max, mensaje).nullish())
    .transform((v) => v ?? null);

const nombre = (max, que) =>
  z
    .string({ error: `El nombre ${que} es obligatorio` })
    .trim()
    .min(1, `El nombre ${que} es obligatorio`)
    .max(max, `El nombre ${que} no puede superar los ${max} caracteres`);

const orden = z.int({ error: 'El orden tiene que ser un número entero' }).min(0).max(9999);
const activo = z.boolean({ error: 'activo tiene que ser true o false' });
const claveCigam = textoOpcional(30, 'La clave de CIGAM no puede superar los 30 caracteres');

// Las formas en que la planilla puede escribirlo. Se normalizan al guardar.
const alias = z
  .array(z.string({ error: 'Cada alias tiene que ser un texto' }).trim().max(60, 'Un alias no puede superar los 60 caracteres'), {
    error: 'Los alias tienen que ser una lista de textos',
  })
  .max(50, 'Demasiados alias');

const grupo = z.enum(['CN', 'VERDEO', 'CORRAL', 'OTRO'], { error: 'El grupo tiene que ser CN, VERDEO, CORRAL u OTRO' });
const especie = z.enum(['VACUNO', 'OVINO'], { error: 'La especie tiene que ser VACUNO u OVINO' });
// null = mixta o sin definir.
const sexoCategoria = z.enum(['MACHO', 'HEMBRA'], { error: 'El sexo tiene que ser MACHO, HEMBRA o vacío' }).nullable();
const tipoCampo = z.enum(['ESTANCIA', 'GRANJA', 'CONFINAMIENTO'], {
  error: 'El tipo de campo tiene que ser ESTANCIA, GRANJA o CONFINAMIENTO',
});
const tipoPotrero = z.enum(['POTRERO', 'CORRAL'], { error: 'El tipo de potrero tiene que ser POTRERO o CORRAL' });

// Acepta 171.73, "171.73" o "171,73" (como en la planilla). Vacío = sin dato.
// Área utilizable (ha): lo que usa de verdad el uso de suelo. null = todas.
const areaUtilizable = z.preprocess(
  (v) => (v === '' || v == null ? null : typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v),
  z
    .number({ error: 'El área utilizable tiene que ser un número mayor que cero' })
    .positive('El área utilizable tiene que ser un número mayor que cero')
    .max(99_999_999, 'El área utilizable es demasiada')
    .nullable(),
);

const hectareas = z.preprocess(
  (v) => (v === '' || v == null ? null : typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v),
  z
    .number({ error: 'Las hectáreas tienen que ser un número mayor que cero' })
    .positive('Las hectáreas tienen que ser un número mayor que cero')
    .max(99_999_999, 'Las hectáreas son demasiadas')
    .nullable(),
);

const subdivisiones = z
  .array(z.string({ error: 'Cada subdivisión tiene que ser un texto' }).trim().min(1).max(20, 'Una subdivisión no puede superar los 20 caracteres'), {
    error: 'Las subdivisiones tienen que ser una lista de textos',
  })
  .max(50, 'Demasiadas subdivisiones')
  .transform((lista) => [...new Set(lista)]);

const sigla = z
  .string({ error: 'La sigla es obligatoria' })
  .trim()
  .toUpperCase()
  .min(1, 'La sigla es obligatoria')
  .max(10, 'La sigla no puede superar los 10 caracteres');

// --- Usos de suelo ---

export const crearUsoSchema = z.object({
  nombre: nombre(60, 'del uso de suelo'),
  grupo,
  orden: orden.default(0),
  alias: alias.default([]),
});

export const editarUsoSchema = z.object({
  nombre: nombre(60, 'del uso de suelo').optional(),
  grupo: grupo.optional(),
  orden: orden.optional(),
  activo: activo.optional(),
  alias: alias.optional(),
});

// --- Categorías ---

// Peso promedio (kg) y precio (USD) de una categoría: opcionales; null = sin dato.
const numeroOpcional = (mensaje, max) =>
  z.preprocess(
    (v) => (v === '' || v == null ? null : typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v),
    z.number({ error: mensaje }).positive(mensaje).max(max, mensaje).nullable(),
  );
const pesoCategoria = numeroOpcional('El peso promedio tiene que ser un número de kilos mayor que cero', 2000);
const precioCategoria = numeroOpcional('El precio tiene que ser un número de dólares mayor que cero', 10_000_000);
const precioPor = z.enum(['KG', 'CABEZA'], { error: 'El precio es por KG o por CABEZA' });

export const crearCategoriaSchema = z.object({
  nombre: nombre(60, 'de la categoría'),
  especie: especie.default('VACUNO'),
  idCategoriaCigam: claveCigam,
  // Si no viene, se deduce del nombre.
  sexo: sexoCategoria.optional(),
  orden: orden.default(0),
  alias: alias.default([]),
  pesoPromedioKg: pesoCategoria.optional(),
  precioUsd: precioCategoria.optional(),
  precioPor: precioPor.optional(),
});

export const editarCategoriaSchema = z.object({
  nombre: nombre(60, 'de la categoría').optional(),
  especie: especie.optional(),
  idCategoriaCigam: claveCigam.optional(),
  sexo: sexoCategoria.optional(),
  orden: orden.optional(),
  activo: activo.optional(),
  alias: alias.optional(),
  pesoPromedioKg: pesoCategoria.optional(),
  precioUsd: precioCategoria.optional(),
  precioPor: precioPor.optional(),
});

// --- Tipos de movimiento y causas ("libro del rodeo") ---

const efecto = z.enum(['ENTRA', 'SALE', 'MUEVE', 'CATEGORIA', 'REGISTRO'], {
  error: 'El efecto tiene que ser ENTRA, SALE, MUEVE, CATEGORIA o REGISTRO',
});
const sexoAplica = z.enum(['CUALQUIERA', 'HEMBRA', 'MACHO'], { error: 'El sexo tiene que ser CUALQUIERA, HEMBRA o MACHO' });
const niveles = z
  .array(
    z.enum(['CAMPO', 'POTRERO', 'CATEGORIA', 'LOTE', 'PARTE_LOTE'], {
      error: 'Nivel desconocido: tiene que ser CAMPO, POTRERO, CATEGORIA, LOTE o PARTE_LOTE',
    }),
    { error: 'Los niveles tienen que ser una lista' },
  )
  .min(1, 'Elegí al menos un nivel')
  .transform((lista) => [...new Set(lista)]);
const siNo = (que) => z.boolean({ error: `${que} tiene que ser true o false` });

export const crearTipoSchema = z.object({
  nombre: nombre(60, 'del tipo'),
  // Si no viene, sale del nombre ("Venta o faena" → VENTA_O_FAENA). No se edita después.
  clave: z
    .string({ error: 'La clave tiene que ser un texto' })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,30}$/, 'La clave lleva de 2 a 30 letras sin tilde, números o guiones bajos (por ejemplo, VENTA_FAENA)')
    .optional(),
  efecto,
  pideCausa: siNo('pideCausa').default(false),
  pideGuia: siNo('pideGuia').default(false),
  sexo: sexoAplica.default('CUALQUIERA'),
  niveles,
  idTipoEventoCigam: claveCigam,
  orden: orden.default(0),
});

export const editarTipoSchema = z.object({
  nombre: nombre(60, 'del tipo').optional(),
  efecto: efecto.optional(),
  pideCausa: siNo('pideCausa').optional(),
  pideGuia: siNo('pideGuia').optional(),
  sexo: sexoAplica.optional(),
  niveles: niveles.optional(),
  idTipoEventoCigam: claveCigam.optional(),
  orden: orden.optional(),
  activo: activo.optional(),
});

const codigoCausa = z
  .string({ error: 'El código es obligatorio' })
  .trim()
  .toUpperCase()
  .min(1, 'El código es obligatorio')
  .max(20, 'El código no puede superar los 20 caracteres');
const tipoIds = z
  .array(z.int({ error: 'Cada tipo tiene que ser un id' }).positive('Cada tipo tiene que ser un id'), {
    error: 'Los tipos tienen que ser una lista de ids',
  })
  .max(100, 'Demasiados tipos')
  .transform((lista) => [...new Set(lista)]);

export const crearCausaSchema = z.object({
  codigo: codigoCausa,
  nombre: nombre(80, 'de la causa'),
  orden: orden.default(0),
  tipoIds: tipoIds.default([]),
});

export const editarCausaSchema = z.object({
  codigo: codigoCausa.optional(),
  nombre: nombre(80, 'de la causa').optional(),
  orden: orden.optional(),
  activo: activo.optional(),
  tipoIds: tipoIds.optional(),
});

// --- Parámetros ---

export const parametroSchema = z.object({
  valor: z
    .number({ error: 'El valor tiene que ser un número mayor que cero' })
    .positive('El valor tiene que ser un número mayor que cero')
    .max(99_999_999, 'El valor es demasiado grande'),
});

// --- Campos ---

export const crearCampoSchema = z.object({
  sigla,
  nombre: nombre(100, 'del campo'),
  tipo: tipoCampo.default('ESTANCIA'),
  idFazendaCigam: claveCigam,
  orden: orden.default(0),
});

export const editarCampoSchema = z.object({
  sigla: sigla.optional(),
  nombre: nombre(100, 'del campo').optional(),
  tipo: tipoCampo.optional(),
  idFazendaCigam: claveCigam.optional(),
  orden: orden.optional(),
  activo: activo.optional(),
});

// --- Potreros ---

export const crearPotreroSchema = z.object({
  nombre: nombre(60, 'del potrero'),
  tipo: tipoPotrero.default('POTRERO'),
  hectareas: hectareas.default(null),
  hectareasAConfirmar: z.boolean({ error: 'hectareasAConfirmar tiene que ser true o false' }).default(false),
  areaUtilizable: areaUtilizable.default(null),
  idAreaManejoCigam: claveCigam,
  orden: orden.default(0),
  subdivisiones: subdivisiones.default([]),
});

export const editarPotreroSchema = z.object({
  nombre: nombre(60, 'del potrero').optional(),
  tipo: tipoPotrero.optional(),
  hectareas: hectareas.optional(),
  hectareasAConfirmar: z.boolean({ error: 'hectareasAConfirmar tiene que ser true o false' }).optional(),
  areaUtilizable: areaUtilizable.optional(),
  idAreaManejoCigam: claveCigam.optional(),
  orden: orden.optional(),
  activo: activo.optional(),
  subdivisiones: subdivisiones.optional(),
});

// --- Importaciones ---

// Fecha del dato ("AAAA-MM-DD"): real, y no puede ser futura (hora de Uruguay).
const fechaDato = z
  .string({ error: 'La fecha tiene que tener el formato AAAA-MM-DD' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha tiene que tener el formato AAAA-MM-DD')
  .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'La fecha no es válida')
  .refine((v) => v <= new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Montevideo' }), 'La fecha no puede ser futura');

export const confirmarImportacionSchema = z.object({
  fecha: fechaDato.optional(),
  // Solo se usa si el campo todavía no existe.
  nombreCampo: textoOpcional(100, 'El nombre del campo no puede superar los 100 caracteres').optional(),
});

// --- Stock y uso de un potrero ---

export const stockSchema = z.object({
  fecha: fechaDato.optional(),
  lineas: z
    .array(
      z.object({
        // Un lote del potrero, o uno nuevo (con nombre opcional).
        loteId: z.int({ error: 'El lote no es válido' }).positive('El lote no es válido').optional(),
        nombreLote: textoOpcional(80, 'El nombre del lote no puede superar los 80 caracteres').optional(),
        categoriaId: z.int({ error: 'Elegí una categoría' }).positive('Elegí una categoría'),
        cabezas: z
          .int({ error: 'Las cabezas tienen que ser un número entero' })
          .min(0, 'Las cabezas no pueden ser negativas')
          .max(1_000_000, 'Demasiadas cabezas'),
        pesoPromedioKg: z
          .number({ error: 'El peso promedio tiene que ser un número' })
          .positive('El peso promedio tiene que ser mayor que cero')
          .max(2000, 'El peso promedio es demasiado alto')
          .nullish(),
      }),
      { error: 'Las líneas tienen que ser una lista' },
    )
    .max(50, 'Demasiadas categorías'),
  nota: textoOpcional(255, 'La nota no puede superar los 255 caracteres').optional(),
});

export const usoSchema = z.object({
  usoSueloId: z.int({ error: 'Elegí un uso de suelo' }).positive('Elegí un uso de suelo'),
  desde: fechaDato.optional(),
  // Lo que ocupa el uso nuevo. Si no se manda: todas las hectáreas.
  areaUtilizable: areaUtilizable.optional(),
});

// --- Lotes y movimientos ---

const idPositivo = (mensaje) => z.int({ error: mensaje }).positive(mensaje);

export const loteSchema = z.object({
  nombre: z
    .string({ error: 'El nombre del lote es obligatorio' })
    .trim()
    .min(1, 'El nombre del lote es obligatorio')
    .max(80, 'El nombre del lote no puede superar los 80 caracteres'),
});

export const movimientoSchema = z.object({
  fecha: fechaDato.optional(),
  loteOrigenId: idPositivo('Elegí el lote de origen'),
  cabezas: z
    .int({ error: 'Las cabezas tienen que ser un número entero' })
    .min(1, 'Tiene que moverse al menos una cabeza')
    .max(1_000_000, 'Demasiadas cabezas'),
  pesoPromedioKg: z
    .number({ error: 'El peso tiene que ser un número' })
    .positive('El peso tiene que ser mayor que cero')
    .max(2000, 'El peso es demasiado alto')
    .nullish(),
  destinoPotreroId: idPositivo('Elegí el potrero de destino'),
  modo: z.enum(['SUMAR', 'NUEVO', 'ENTERO', 'CATEGORIA'], { error: 'El modo tiene que ser SUMAR, NUEVO, ENTERO o CATEGORIA' }),
  loteDestinoId: idPositivo('El lote de destino no es válido').optional(),
  nuevoLote: z
    .object({
      nombre: textoOpcional(80, 'El nombre del lote no puede superar los 80 caracteres').optional(),
      categoriaId: idPositivo('Elegí la categoría del lote nuevo'),
    })
    .optional(),
  // ENTERO: la categoría nueva del lote (opcional). CATEGORIA: la categoría nueva (obligatoria).
  categoriaId: idPositivo('La categoría no es válida').optional(),
  // NUEVO: la parte sigue siendo del mismo lote (familia de lotes): misma
  // categoría y nombre automático; nuevoLote no hace falta.
  mismoLote: z.boolean({ error: 'mismoLote tiene que ser true o false' }).optional(),
  nota: textoOpcional(255, 'La nota no puede superar los 255 caracteres').optional(),
});

// Paso 5 del rediseño. Mover entre campos: como mover, con la guía (opcional).
export const entreCamposSchema = movimientoSchema.extend({
  modo: z.enum(['NUEVO', 'ENTERO'], { error: 'Entre campos se forma un lote nuevo (NUEVO) o se lleva el lote entero (ENTERO)' }),
  guia: textoOpcional(30, 'La guía no puede superar los 30 caracteres').optional(),
});

// Movimiento múltiple: varios movimientos simples, con una fecha y una nota.
export const multipleSchema = z.object({
  fecha: fechaDato.optional(),
  nota: textoOpcional(255, 'La nota no puede superar los 255 caracteres').optional(),
  pasos: z
    .array(movimientoSchema.omit({ fecha: true, nota: true }), { error: 'Los pasos tienen que ser una lista de movimientos' })
    .min(1, 'Agregá al menos un movimiento')
    .max(20, 'Hasta 20 movimientos en un movimiento múltiple'),
});

// --- Entradas y salidas ---
// Qué hace falta depende del tipo (lo controla el servicio): una salida sale
// de un lote (loteId + cabezas); una entrada llega a un potrero (potreroId +
// lineas, cada una a un lote que ya está o a uno nuevo).

const cabezasEntradaSalida = z
  .int({ error: 'Las cabezas tienen que ser un número entero' })
  .min(1, 'Tiene que ser al menos una cabeza')
  .max(1_000_000, 'Demasiadas cabezas');
const pesoOpcional = z
  .number({ error: 'El peso tiene que ser un número' })
  .positive('El peso tiene que ser mayor que cero')
  .max(2000, 'El peso es demasiado alto')
  .nullish();

export const entradaSalidaSchema = z.object({
  tipoId: idPositivo('Elegí qué pasó (el tipo de movimiento)'),
  fecha: fechaDato.optional(),
  nota: textoOpcional(255, 'La nota no puede superar los 255 caracteres').optional(),
  causaId: idPositivo('La causa no es válida').optional(),
  guia: textoOpcional(30, 'El número de guía no puede superar los 30 caracteres').optional(),
  campoOtroId: idPositivo('El otro campo no es válido').optional(),
  // Salidas
  loteId: idPositivo('El lote no es válido').optional(),
  cabezas: cabezasEntradaSalida.optional(),
  pesoPromedioKg: pesoOpcional,
  // Entradas
  potreroId: idPositivo('El potrero no es válido').optional(),
  loteMadresId: idPositivo('El lote de las madres no es válido').optional(),
  lineas: z
    .array(
      z.object({
        cabezas: cabezasEntradaSalida,
        pesoPromedioKg: pesoOpcional,
        loteId: idPositivo('El lote no es válido').optional(),
        nuevoLote: z
          .object({
            nombre: textoOpcional(80, 'El nombre del lote no puede superar los 80 caracteres').optional(),
            categoriaId: idPositivo('Elegí la categoría del lote nuevo'),
          })
          .optional(),
      }),
      { error: 'Las líneas tienen que ser una lista' },
    )
    .min(1, 'Escribí cuántos animales entran')
    .max(10, 'Demasiadas líneas: registralas en partes')
    .optional(),
});

// Filtros de la lista de movimientos (vienen en la URL, como texto).
const idEnUrl = z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.int().positive().optional());
const fechaEnUrl = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha tiene que tener el formato AAAA-MM-DD')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const filtrosMovimientosSchema = z.object({
  desde: fechaEnUrl,
  hasta: fechaEnUrl,
  potreroId: idEnUrl,
  loteId: idEnUrl,
  categoriaId: idEnUrl,
  tipoId: idEnUrl,
});
