// Lo que el asistente le manda a Claude sale de las mismas rutas de la app,
// pero antes pasa por acá (docs/superpowers/specs/2026-11-27-asistente-design.md):
// - Sin datos de personas: se sacan los campos con el nombre o el id de quien
//   registró, anuló o aprobó algo, emails, IPs y navegadores. La regla de
//   confidencialidad (17/11) deja mandar los datos del campo y del ganado,
//   nunca los de las personas.
// - Sin ruido: se sacan los vacíos y los códigos de CIGAM, y los números se
//   redondean a 2 decimales (menos texto = menos costo).
// - Con un tope de tamaño: si es muy largo, se recortan las listas más largas.

const DE_PERSONAS =
  /^(usuarios?|usuarioId|email|ip|userAgent|(creado|anulad[oa]|aprobad[oa]|corregid[oa]|disparad[oa]|registrad[oa])Por(Id)?)$/i;
const DE_CIGAM = /Cigam$/;

export function esCampoDePersona(clave) {
  return DE_PERSONAS.test(clave);
}

export function limpiar(valor) {
  if (Array.isArray(valor)) return valor.map(limpiar).filter((v) => v !== undefined);
  if (valor && typeof valor === 'object') {
    const salida = {};
    for (const [clave, v] of Object.entries(valor)) {
      if (esCampoDePersona(clave) || DE_CIGAM.test(clave)) continue;
      const limpio = limpiar(v);
      if (limpio === undefined) continue;
      if (Array.isArray(limpio) && limpio.length === 0) continue;
      salida[clave] = limpio;
    }
    return Object.keys(salida).length ? salida : undefined;
  }
  if (valor === null || valor === undefined || valor === '') return undefined;
  if (typeof valor === 'number' && !Number.isInteger(valor)) return Math.round(valor * 100) / 100;
  return valor;
}

// La lista más larga dentro del objeto (para recortarla).
function listaMasLarga(valor, mejor = null) {
  if (Array.isArray(valor)) {
    if (!mejor || valor.length > mejor.length) mejor = valor;
    for (const v of valor) mejor = listaMasLarga(v, mejor);
  } else if (valor && typeof valor === 'object') {
    for (const v of Object.values(valor)) mejor = listaMasLarga(v, mejor);
  }
  return mejor;
}

export const TOPE_CARACTERES = 14_000;

// El resultado de una herramienta como texto para Claude. Si pasa el tope,
// corta a la mitad la lista más larga hasta que entre, y lo avisa.
export function aTexto(valor, tope = TOPE_CARACTERES) {
  const datos = structuredClone(limpiar(valor) ?? {});
  let texto = JSON.stringify(datos);
  let recortes = 0;
  while (texto.length > tope && recortes < 12) {
    const lista = listaMasLarga(datos);
    if (!lista || lista.length <= 1) break;
    lista.splice(Math.ceil(lista.length / 2));
    recortes += 1;
    texto = JSON.stringify(datos);
  }
  if (texto.length > tope) texto = `${texto.slice(0, tope)}…`;
  return recortes || texto.endsWith('…')
    ? `${texto}\n(Resultado recortado porque era muy largo: si hace falta, pedí de nuevo con filtros más finos.)`
    : texto;
}
