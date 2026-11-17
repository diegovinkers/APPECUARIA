import { z } from 'zod';
import { codigoCigamField, emailField, newPasswordField, nombreField, usuarioField } from '../auth/auth.schema.js';

// Lista de ids de roles, sin repetidos. Vacía = sin roles.
const rolIdsField = z
  .array(z.int({ error: 'Cada rol tiene que ser un id numérico' }).positive('Cada rol tiene que ser un id numérico'), {
    error: 'Los roles tienen que ser una lista de ids',
  })
  .max(50, 'Demasiados roles')
  .transform((ids) => [...new Set(ids)]);

// z.object descarta campos extra: un "esSuperadmin" enviado acá se ignora.
export const createUserSchema = z.object({
  usuario: usuarioField,
  nombre: nombreField,
  email: emailField,
  codigoCigam: codigoCigamField,
  password: newPasswordField,
  rolIds: rolIdsField.default([]),
});

export const setRolesSchema = z.object({ rolIds: rolIdsField });

export const estadoSchema = z.object({
  activo: z.boolean({ error: 'El estado tiene que ser activo: true o false' }),
});

// Contraseña temporal que elige el administrador.
export const resetPasswordSchema = z.object({ password: newPasswordField });
