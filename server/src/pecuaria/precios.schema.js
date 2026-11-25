// Entrada de las rutas de precios de mercado (docs/PRECIOS_INAC.md).
import { z } from 'zod';
import { CLAVES } from './precios.indicadores.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const valor = z
  .number({ error: 'El precio tiene que ser un número de USD por kilo' })
  .positive('El precio tiene que ser mayor que cero')
  .max(1000, 'El precio no puede superar los 1.000 USD por kilo');

const indicador = z.enum(CLAVES, { error: 'Ese indicador no existe' });
const semana = z.string({ error: 'Falta la semana' }).regex(ISO, 'La semana va como AAAA-MM-DD');

export const corregirPrecioSchema = z.object({
  valor,
  nota: z
    .string({ error: 'Escribí por qué lo corregís' })
    .trim()
    .min(3, 'Escribí por qué lo corregís')
    .max(255, 'La nota no puede superar los 255 caracteres'),
});

export const cargarPrecioSchema = z.object({
  indicador,
  semanaDesde: semana,
  valor,
  cabezas: z.int({ error: 'Las cabezas tienen que ser un número entero' }).positive('Las cabezas tienen que ser más que cero').optional(),
  nota: z.string().trim().max(255, 'La nota no puede superar los 255 caracteres').optional()
    .transform((v) => v || undefined),
});

// Los filtros del historial (en la query).
export const historialQuerySchema = z.object({
  indicador: indicador.optional(),
  desde: semana.optional(),
  hasta: semana.optional(),
  fuente: z.enum(['INAC', 'MANUAL'], { error: 'La fuente es INAC o MANUAL' }).optional(),
});
