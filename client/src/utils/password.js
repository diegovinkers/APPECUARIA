// Mismas reglas que la API (el front valida para avisar antes; la que manda
// es la API): mínimo 10 caracteres y máximo 72 bytes, porque bcrypt ignora el
// resto. Las letras con tilde y la ñ ocupan 2 bytes. Sin reglas de composición.
export function passwordProblem(value) {
  if (!value || value.length < 10) return 'La contraseña debe tener al menos 10 caracteres';
  if (new TextEncoder().encode(value).length > 72) {
    return 'La contraseña es demasiado larga: hasta 72 caracteres (las letras con tilde y la ñ cuentan doble)';
  }
  return null;
}

// Reglas para react-hook-form.
export const newPasswordRules = {
  required: 'La contraseña es obligatoria',
  validate: (value) => passwordProblem(value) ?? true,
};
