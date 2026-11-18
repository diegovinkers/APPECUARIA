import { z } from 'zod';
import { codigoCigamField, emailField, newPasswordField, nombreField, usuarioField } from '../auth/auth.schema.js';

// Lista de ids de roles, sin repetidos. Vacía = sin roles.
const rolIdsField = z
  .array(z.int({ error: 'Cada rol tiene que ser un id numérico' }).positive('Cada rol tiene que ser un id numérico'), {
    error: 'Los roles tienen que ser una lista de ids',
  })
  .max(50, 'Demasiados roles')
  .transform((ids) => [...new Set(ids)]);

// Ids de estancias, sin repetidos.
const campoIdsField = z
  .array(z.int({ error: 'Cada estancia tiene que ser un id numérico' }).positive('Cada estancia tiene que ser un id numérico'), {
    error: 'Las estancias tienen que ser una lista de ids',
  })
  .max(200, 'Demasiadas estancias')
  .transform((ids) => [...new Set(ids)]);

const todasField = z.boolean({ error: '"Todas las estancias" tiene que ser true o false' });

// z.object descarta campos extra: un "esSuperadmin" enviado acá se ignora.
export const createUserSchema = z.object({
  usuario: usuarioField,
  nombre: nombreField,
  email: emailField,
  codigoCigam: codigoCigamField,
  password: newPasswordField,
  rolIds: rolIdsField.default([]),
  todasLasEstancias: todasField.default(false),
  campoIds: campoIdsField.default([]),
});

export const setEstanciasSchema = z.object({ todasLasEstancias: todasField, campoIds: campoIdsField.default([]) });

export const setRolesSchema = z.object({ rolIds: rolIdsField });

export const estadoSchema = z.object({
  activo: z.boolean({ error: 'El estado tiene que ser activo: true o false' }),
});

// Contraseña temporal que elige el administrador.
export const resetPasswordSchema = z.object({ password: newPasswordField });
