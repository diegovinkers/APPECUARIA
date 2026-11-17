// Valida req.body con un schema de zod y lo reemplaza por los datos ya limpios
// (sin espacios de más, email en minúsculas, sin campos desconocidos).
export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    return res.status(400).json({ errors: result.error.issues.map((issue) => issue.message) });
  }
  req.body = result.data;
  next();
};
