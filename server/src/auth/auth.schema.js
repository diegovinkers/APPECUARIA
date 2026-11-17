import { z } from 'zod';

// Texto opcional: "", "   ", null o ausente se guardan como null.
const optional = (schema) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? null : value), schema.nullish())
    .transform((value) => value ?? null);

export const usuarioField = z
  .string({ error: 'El nombre de usuario es obligatorio' })
  .trim()
  .toLowerCase()
  .min(3, 'El nombre de usuario debe tener al menos 3 caracteres')
  .max(50, 'El nombre de usuario no puede superar los 50 caracteres')
  .regex(/^[a-z0-9._-]+$/, 'El nombre de usuario solo puede tener letras sin tilde, números, punto, guion y guion bajo');

export const nombreField = z
  .string({ error: 'El nombre es obligatorio' })
  .trim()
  .min(1, 'El nombre es obligatorio')
  .max(100, 'El nombre no puede superar los 100 caracteres');

export const emailField = optional(
  z.string().trim().toLowerCase().max(254, 'El email es demasiado largo').email('El email no es válido'),
);

export const codigoCigamField = optional(
  z.string().trim().max(30, 'El código CIGAM no puede superar los 30 caracteres'),
);

// bcrypt solo usa los primeros 72 bytes: lo que sobre se ignoraría sin aviso.
// Se cuenta en bytes porque las letras con tilde y la ñ ocupan 2.
export const PASSWORD_MAX_BYTES = 72;

// Solo largo, sin reglas de composición (mayúsculas, símbolos...): una frase
// larga es más segura y más fácil de recordar.
// Ojo: solo se exige al crear o cambiar una contraseña; las que ya existen
// siguen sirviendo para entrar.
export const newPasswordField = z
  .string({ error: 'La contraseña es obligatoria' })
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES,
    'La contraseña es demasiado larga: hasta 72 caracteres (las letras con tilde y la ñ cuentan doble)',
  );

// Para validar una contraseña que ya existe no se exige formato: solo que no
// esté vacía ni sea absurdamente larga.
const currentPasswordField = (mensaje) =>
  z.string({ error: mensaje }).min(1, mensaje).max(200, 'La contraseña es demasiado larga');

export const loginSchema = z.object({
  usuario: z
    .string({ error: 'El nombre de usuario es obligatorio' })
    .trim()
    .toLowerCase()
    .min(1, 'El nombre de usuario es obligatorio')
    .max(100, 'El nombre de usuario es demasiado largo'),
  password: currentPasswordField('La contraseña es obligatoria'),
});

export const changePasswordSchema = z
  .object({
    passwordActual: currentPasswordField('Ingresá tu contraseña actual'),
    passwordNueva: newPasswordField,
  })
  .refine((data) => data.passwordActual !== data.passwordNueva, {
    message: 'La contraseña nueva tiene que ser distinta de la actual',
    path: ['passwordNueva'],
  });
