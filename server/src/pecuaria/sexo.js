// El sexo de una categoría, deducido de su nombre. CIGAM no lo tiene cargado
// (TEA4CATANIMAIS.ID_SEXO vacío), pero el nombre lo dice: "Terneras",
// "NOVILLO 1-2", "VACA CRIA WAGYU". Se mira la primera palabra, en singular.
// La migración `tipos_de_movimiento` aplica la misma regla en SQL.
import { normalizarTexto } from './normalizar.js';

const MACHOS = new Set([
  'ternero', 'terneiro', 'novillo', 'toro', 'torito', 'borrego', 'carnero', 'cordero',
  'capon', 'padrillo', 'potrillo', 'potro', 'caballo',
]);
const HEMBRAS = new Set([
  'ternera', 'terneira', 'vaca', 'vaquillona', 'vaquilla', 'novilla', 'borrega', 'oveja',
  'cordera', 'yegua', 'potranca',
]);

// 'MACHO', 'HEMBRA' o null (no se sabe, o es mixta).
export function deducirSexo(nombre) {
  const palabra = normalizarTexto(nombre).split(' ')[0];
  if (!palabra) return null;
  const formas = [palabra, palabra.replace(/s$/, ''), palabra.replace(/es$/, '')];
  if (formas.some((f) => MACHOS.has(f))) return 'MACHO';
  if (formas.some((f) => HEMBRAS.has(f))) return 'HEMBRA';
  return null;
}
