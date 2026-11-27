// El buscador de potreros, lotes y categorías (27/11, pedido de Diego). Lo
// usan Potreros, Corrales, el "+" y Anotar evento.
// - Sin importar mayúsculas, tildes ni espacios: "p1" encuentra "P 1".
// - Por el comienzo de cada palabra: "vacas" encuentra "10.3 · Vacas de cría";
//   "8" encuentra "EG 8.1" (con la sigla adelante).
// - Un número no se corta: "8" trae 8.1, 8.2/3/4/5 y 8.8/9, pero no 81.1 ni
//   72.8; "p1" trae P 1 y no P 10.
// - Puntos, barras, guiones y espacios son lo mismo, y los del final no
//   cuentan: "8", "8 ", "8." y "8/" dan lo mismo; "8/2" y "8 2" = "8.2".
// - Las subdivisiones cuentan: "8.3" encuentra 8.2/3/4/5.

const sinTildes = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Separadores unificados en "." y espacios simples.
const canon = (s) =>
  sinTildes(s)
    .replace(/[/\\\-_,·]+/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

// Lo que escribió la persona, listo para comparar ('' = sin búsqueda).
export function prepararBusqueda(texto) {
  return canon(texto)
    .replace(/(\d) +(?=\d)/g, '$1.') // "8 2" → "8.2"
    .replace(/([a-zñ])\.(?=\d)/g, '$1') // "p.1", "p-1" → "p1"
    .replace(/ /g, '')
    .replace(/^\.+|\.+$/g, ''); // "8." → "8"
}

// "8.2/3/4/5" → también 8.2, 8.3, 8.4 y 8.5 (con lo que tenga adelante o atrás).
function variantes(texto) {
  const t = sinTildes(texto);
  const m = t.match(/^(.*?)(\d+)\.([0-9a-z]+(?:\/[0-9a-z]+)+)(.*)$/);
  if (!m) return [t];
  const [, antes, base, partes, despues] = m;
  return [t, ...partes.split('/').map((p) => `${antes}${base}.${p}${despues}`)];
}

// Desde el principio y desde cada palabra, sin espacios.
function comienzos(c) {
  const lista = [c.replace(/ /g, '')];
  for (let i = 1; i < c.length; i++) if (c[i - 1] === ' ' && c[i] !== ' ') lista.push(c.slice(i).replace(/ /g, ''));
  return lista;
}

// ¿El texto (nombre de potrero, lote o categoría) coincide con la búsqueda
// ya preparada? Sin búsqueda, siempre.
export function coincide(texto, q) {
  if (!q) return true;
  const terminaEnNumero = /\d$/.test(q);
  return variantes(texto).some((v) =>
    comienzos(canon(v)).some((s) => s.startsWith(q) && !(terminaEnNumero && /\d/.test(s[q.length] ?? ''))),
  );
}
