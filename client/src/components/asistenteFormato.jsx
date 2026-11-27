// Las respuestas del asistente vienen en un Markdown chico: párrafos, listas,
// **negrita**, tablas y enlaces a las fichas de la app. Se dibuja acá, sin
// sumar una librería. Los enlaces solo se hacen si van adentro de la app
// ("/pecuaria/…"); uno de afuera queda como texto.
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

const esTabla = (l) => l.trim().startsWith('|');
const esSeparadorTabla = (l) => /^\s*\|?\s*:?-{2,}/.test(l);
const ITEM = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/;
const celdas = (l) =>
  l
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

// El texto en bloques: { tipo: 'parrafo', texto } · { tipo: 'lista', ordenada, items }
// · { tipo: 'tabla', encabezado, filas }.
export function bloquesDeTexto(texto) {
  const bloques = [];
  const lineas = String(texto ?? '').replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    if (!l.trim()) {
      i += 1;
      continue;
    }
    if (esTabla(l)) {
      const filas = [];
      while (i < lineas.length && esTabla(lineas[i])) {
        if (!esSeparadorTabla(lineas[i])) filas.push(celdas(lineas[i]));
        i += 1;
      }
      bloques.push({ tipo: 'tabla', encabezado: filas[0] ?? [], filas: filas.slice(1) });
      continue;
    }
    const item = l.match(ITEM);
    if (item) {
      const ordenada = Boolean(item[2]);
      const items = [];
      while (i < lineas.length) {
        const m = lineas[i].match(ITEM);
        if (!m || Boolean(m[2]) !== ordenada) break;
        items.push(m[3]);
        i += 1;
      }
      bloques.push({ tipo: 'lista', ordenada, items });
      continue;
    }
    const parrafo = [];
    while (i < lineas.length && lineas[i].trim() && !esTabla(lineas[i]) && !ITEM.test(lineas[i])) {
      parrafo.push(lineas[i].trim().replace(/^#+\s*/, ''));
      i += 1;
    }
    bloques.push({ tipo: 'parrafo', texto: parrafo.join('\n') });
  }
  return bloques;
}

const esInterno = (href) => href.startsWith('/') && !href.startsWith('//');
// "\*" en Markdown es un asterisco suelto (no negrita): se muestra sin la barra.
const sinEscapes = (t) => t.replace(/\\([\\*_#|[\]()`~>-])/g, '$1');

// Un renglón en trozos: texto, negrita y enlaces.
export function trozos(texto) {
  const salida = [];
  const patron = /(?<!\\)\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let desde = 0;
  for (const m of String(texto).matchAll(patron)) {
    if (m.index > desde) salida.push({ tipo: 'texto', texto: sinEscapes(texto.slice(desde, m.index)) });
    if (m[1] !== undefined) salida.push({ tipo: 'negrita', texto: sinEscapes(m[1]) });
    else if (esInterno(m[3])) salida.push({ tipo: 'enlace', texto: sinEscapes(m[2]), href: m[3] });
    else salida.push({ tipo: 'texto', texto: sinEscapes(m[2]) });
    desde = m.index + m[0].length;
  }
  if (desde < texto.length) salida.push({ tipo: 'texto', texto: sinEscapes(texto.slice(desde)) });
  return salida;
}

function Linea({ texto }) {
  return trozos(texto).map((t, i) => {
    if (t.tipo === 'negrita') return <strong key={i}>{t.texto}</strong>;
    if (t.tipo === 'enlace') {
      return (
        <Link key={i} to={t.href} className="font-medium text-campo-700 underline decoration-campo-300 underline-offset-2 hover:decoration-campo-600">
          {t.texto}
        </Link>
      );
    }
    return <Fragment key={i}>{t.texto}</Fragment>;
  });
}

export function TextoAsistente({ texto }) {
  return (
    <div className="space-y-2 leading-relaxed">
      {bloquesDeTexto(texto).map((b, i) => {
        if (b.tipo === 'lista') {
          const Lista = b.ordenada ? 'ol' : 'ul';
          return (
            <Lista key={i} className={`space-y-1 pl-5 ${b.ordenada ? 'list-decimal' : 'list-disc'}`}>
              {b.items.map((item, j) => (
                <li key={j}>
                  <Linea texto={item} />
                </li>
              ))}
            </Lista>
          );
        }
        if (b.tipo === 'tabla') {
          return (
            <div key={i} className="overflow-x-auto rounded-md border border-suelo-200">
              <table className="w-full text-sm">
                <thead className="bg-suelo-100 text-left text-suelo-700">
                  <tr>
                    {b.encabezado.map((c, j) => (
                      <th key={j} className="px-2 py-1.5 font-medium">
                        <Linea texto={c} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.filas.map((fila, j) => (
                    <tr key={j} className="border-t border-suelo-200">
                      {fila.map((c, k) => (
                        <td key={k} className="px-2 py-1.5 align-top">
                          <Linea texto={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            <Linea texto={b.texto} />
          </p>
        );
      })}
    </div>
  );
}
