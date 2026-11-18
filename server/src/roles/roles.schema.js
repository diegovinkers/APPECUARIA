import { z } from 'zod';

const nombre = z
  .string({ error: 'Escribí el nombre del rol' })
  .trim()
  .min(2, 'El nombre del rol es muy corto')
  .max(60, 'El nombre del rol puede tener hasta 60 letras');

const descripcion = z
  .string()
  .trim()
  .max(255, 'La descripción puede tener hasta 255 letras')
  .transform((d) => d || null)
  .nullable();

export const crearRolSchema = z.object({ nombre, descripcion: descripcion.optional() });

export const editarRolSchema = z
  .object({ nombre: nombre.optional(), descripcion: descripcion.optional() })
  .refine((d) => Object.keys(d).length > 0, 'No hay nada para cambiar');

// ['pecuaria:VER', 'usuarios:CREAR', ...], sin repetidos.
export const permisosSchema = z.object({
  permisos: z
    .array(z.string().regex(/^[a-z][a-z-]*:[A-Z]+$/, 'Permiso con formato inválido (módulo:ACCIÓN)'), {
      error: 'Los permisos tienen que ser una lista',
    })
    .max(200, 'Demasiados permisos')
    .transform((p) => [...new Set(p)].sort()),
});
