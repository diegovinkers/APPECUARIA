// Deja un texto comparable: minúsculas, sin tildes y sin espacios de más.
// La planilla escribe lo mismo de muchas formas ("FESTUCA NUEVA", "Festuca nueva",
// "vacas CUT"); los alias de los catálogos se guardan así normalizados.
export function normalizarTexto(valor) {
  if (valor == null) return '';
  return String(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
