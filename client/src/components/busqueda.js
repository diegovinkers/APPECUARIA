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

// --- Que toda búsqueda encuentre algo (27/11, pedido de Diego) ---
// Se busca en todo lo de un potrero a la vez (estancia, nombre, uso, lotes y
// categorías) y en tres pasadas; se muestra la mejor que encontró algo:
//   3. como arriba, todo junto: "8" trae los 8.x; "p1", P 1.
//   2. cada palabra en un dato distinto: "8 vacas", "eg 8.1", "gateada frente".
//   1. flojo: sin puntos ni espacios y en cualquier parte de la palabra:
//      "81" encuentra el 8.1, "acas" las Vacas, "ternero" los Terneros/as.
// Así lo preciso sigue preciso ("8" no trae 81 si hay 8.x), y si no hay nada
// preciso, igual aparece lo que se parece.

const suelto = (s) => sinTildes(s).replace(/[^a-z0-9ñ]/g, '');

// Lo que escribió la persona, para buscar en varios datos (null = sin búsqueda).
export function armarBusqueda(texto) {
  const junto = prepararBusqueda(texto);
  if (!junto) return null;
  const palabras = canon(texto).split(' ').map(prepararBusqueda).filter(Boolean);
  return { junto, palabras, suelto: suelto(texto), sueltas: palabras.map(suelto).filter(Boolean) };
}

// 3, 2 o 1 según la pasada que lo encuentra; 0 si no. Sin búsqueda, 3.
export function nivelBusqueda(textos, b) {
  if (!b) return 3;
  const ts = textos.filter((t) => t != null && t !== '').map(String);
  if (ts.some((t) => coincide(t, b.junto))) return 3;
  if (b.palabras.length > 1 && b.palabras.every((p) => ts.some((t) => coincide(t, p)))) return 2;
  const sueltos = ts.map(suelto);
  if (b.suelto && sueltos.some((t) => t.includes(b.suelto))) return 1;
  if (b.sueltas.length > 1 && b.sueltas.every((p) => sueltos.some((t) => t.includes(p)))) return 1;
  return 0;
}

// Deja los que encontró la mejor pasada (en el mismo orden). `textosDe(item)`
// da los datos de cada uno. Sin búsqueda, todos.
export function filtrarBusqueda(items, texto, textosDe) {
  const b = armarBusqueda(texto);
  if (!b) return items;
  const niveles = items.map((it) => nivelBusqueda(textosDe(it), b));
  const mejor = Math.max(0, ...niveles);
  return mejor === 0 ? [] : items.filter((_, i) => niveles[i] === mejor);
}

// Los datos de un potrero en los que se busca.
export function textosPotrero(p) {
  const lotes = p.stock?.lotes ?? p.stock?.lineas ?? [];
  return [
    p.nombre,
    p.campo?.sigla && `${p.campo.sigla} ${p.nombre}`,
    p.campo?.nombre,
    p.usoActual?.nombre,
    ...lotes.map((l) => l.lote),
    ...lotes.map((l) => l.categoria),
  ];
}
