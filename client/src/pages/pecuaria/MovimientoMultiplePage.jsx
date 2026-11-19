import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCategorias, registrarMultiple, vistaPreviaMultiple } from '../../api/pecuaria';
import { getErrorMessages } from '../../api/axios';
import { useEstancia } from '../../context/EstanciaContext';
import usePotreros, { ordenNatural } from '../../hooks/usePotreros';
import { ErrorList, buttonClass, inputClass } from '../../components/ui';
import { formatNumero } from '../../components/pecuaria';
import { ElegirEstancia, SinEstancia } from './comun';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const etiqueta = 'block text-xs text-suelo-500';

const pasoVacio = (id, desde = {}) => ({
  id,
  potreroOrigenId: '',
  loteOrigenId: '',
  cabezas: '',
  peso: '',
  destinoPotreroId: '',
  modo: '',
  loteDestinoId: '',
  categoriaId: '',
  nombre: '',
  ...desde,
});

// Lo que propone la app al elegir el destino: sumar a un lote de la misma
// categoría; si no hay, el lote entero (si van todas); si no, un lote nuevo.
function modoSugerido(paso, lote, lotesDestino) {
  const igual = lotesDestino.find((l) => l.categoriaId === lote.categoriaId && l.loteId !== lote.loteId);
  if (igual) return { modo: 'SUMAR', loteDestinoId: String(igual.loteId) };
  const todas = Number(paso.cabezas) === lote.cabezas;
  if (todas && paso.destinoPotreroId !== paso.potreroOrigenId) return { modo: 'ENTERO', loteDestinoId: '' };
  return { modo: 'NUEVO', loteDestinoId: '', categoriaId: String(lote.categoriaId) };
}

// Movimiento múltiple (paso 5 del rediseño, DECISIONES §11): una cadena de
// movimientos dentro de la estancia (A → B, B → C...) que se guardan todos
// juntos o ninguno. Cada paso mueve lo que había antes de empezar. Si en un
// destino hay otra categoría, avisa (sin bloquear) y ofrece liberarlo.
export default function MovimientoMultiplePage() {
  const navigate = useNavigate();
  const { campoId, campo, todas } = useEstancia();
  const { potreros, errors: erroresCarga } = usePotreros(campoId);
  const [categorias, setCategorias] = useState([]);
  const siguiente = useRef(2);
  const [pasos, setPasos] = useState([pasoVacio(1)]);
  const [fecha, setFecha] = useState(hoy());
  const [nota, setNota] = useState('');
  const [previa, setPrevia] = useState(null);
  const [errors, setErrors] = useState([]);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    getCategorias()
      .then(({ data }) => setCategorias(data.filter((c) => c.activo)))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar las categorías')));
  }, []);

  const ordenados = useMemo(() => [...(potreros ?? [])].sort((a, b) => ordenNatural.compare(a.nombre, b.nombre)), [potreros]);
  const lotesDe = (potreroId) => ordenados.find((p) => String(p.id) === String(potreroId))?.stock?.lotes ?? [];
  const nombreDe = (potreroId) => ordenados.find((p) => String(p.id) === String(potreroId))?.nombre ?? '';

  const cambiar = (id, cambios) => setPasos((ps) => ps.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
  const agregar = (desde) => setPasos((ps) => [...ps, pasoVacio(siguiente.current++, desde)]);
  const quitar = (id) => setPasos((ps) => ps.filter((p) => p.id !== id));

  // Para cada paso: su lote de origen, los lotes que puede usar como origen (los
  // de antes de empezar, menos los que recibieron en un paso anterior) y el
  // aviso de mezcla en el destino.
  const analisis = useMemo(() => {
    const recibieron = new Set();
    // Los lotes que se van enteros de su potrero en algún paso: ya no "están" en el destino.
    const seVan = new Set(
      pasos
        .map((p) => {
          const l = lotesDe(p.potreroOrigenId).find((x) => String(x.loteId) === p.loteOrigenId);
          return l && Number(p.cabezas) === l.cabezas ? l.loteId : null;
        })
        .filter(Boolean),
    );
    return pasos.map((p) => {
      const opciones = lotesDe(p.potreroOrigenId).filter((l) => !recibieron.has(l.loteId));
      const lote = opciones.find((l) => String(l.loteId) === p.loteOrigenId) ?? null;
      const lotesDestino = lotesDe(p.destinoPotreroId);
      let aviso = null;
      if (lote && p.destinoPotreroId && p.destinoPotreroId !== p.potreroOrigenId) {
        const llega =
          p.modo === 'SUMAR'
            ? lotesDestino.find((l) => String(l.loteId) === p.loteDestinoId)?.categoria
            : p.modo === 'NUEVO'
              ? (categorias.find((c) => String(c.id) === p.categoriaId)?.nombre ?? lote.categoria)
              : lote.categoria;
        const otras = lotesDestino.filter((l) => !seVan.has(l.loteId) && l.categoria !== llega && String(l.loteId) !== p.loteDestinoId);
        if (otras.length) aviso = { llega, otras };
      }
      if (p.modo === 'SUMAR' && p.loteDestinoId) recibieron.add(Number(p.loteDestinoId));
      return { opciones, lote, lotesDestino, aviso };
    });
    // lotesDe depende de `ordenados`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasos, ordenados, categorias]);

  const cuerpo = useMemo(() => {
    const lista = [];
    for (const [i, p] of pasos.entries()) {
      const { lote } = analisis[i];
      const n = Number.parseInt(p.cabezas, 10) || 0;
      if (!lote || n < 1 || n > lote.cabezas || !p.destinoPotreroId || !p.modo) return null;
      const paso = {
        loteOrigenId: lote.loteId,
        cabezas: n,
        destinoPotreroId: Number(p.destinoPotreroId),
        modo: p.modo,
        ...(p.peso.trim() && { pesoPromedioKg: Number(p.peso.replace(',', '.')) }),
      };
      if (p.modo === 'SUMAR') {
        if (!p.loteDestinoId) return null;
        paso.loteDestinoId = Number(p.loteDestinoId);
      }
      if (p.modo === 'NUEVO') {
        if (!p.categoriaId) return null;
        paso.nuevoLote = { categoriaId: Number(p.categoriaId), ...(p.nombre.trim() && { nombre: p.nombre.trim() }) };
      }
      lista.push(paso);
    }
    return { fecha, ...(nota.trim() && { nota: nota.trim() }), pasos: lista };
  }, [pasos, analisis, fecha, nota]);

  useEffect(() => setPrevia(null), [cuerpo]);

  async function verPrevia() {
    setErrors([]);
    try {
      setPrevia((await vistaPreviaMultiple(cuerpo)).data);
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo armar la vista previa'));
    }
  }

  async function confirmar() {
    setOcupado(true);
    try {
      const { data } = await registrarMultiple(cuerpo);
      const total = data.pasos.reduce((s, p) => s + p.cabezas, 0);
      navigate('/pecuaria/movimientos', {
        state: { aviso: `Listo: movimiento múltiple de ${data.pasos.length} ${data.pasos.length === 1 ? 'paso' : 'pasos'} (${formatNumero(total)} cabezas).` },
      });
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo registrar'));
      setOcupado(false);
    }
  }

  const encabezado = (
    <div>
      <Link to="/pecuaria/movimientos" className="text-sm text-campo-600 hover:underline">
        ← Movimientos
      </Link>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Movimiento múltiple</h1>
      <p className="text-sm text-suelo-600">
        {campo ? `${campo.nombre}. ` : ''}Varios movimientos que se guardan juntos: por ejemplo, terneros del A al B y, para hacerles lugar, lo
        que había en B al C.
      </p>
    </div>
  );

  if (todas || !campoId) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 sm:py-8">
        {encabezado}
        {todas ? <ElegirEstancia texto="¿En qué estancia es el movimiento múltiple?" /> : <SinEstancia />}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 sm:py-8">
      {encabezado}
      <ErrorList errors={[...erroresCarga, ...errors]} />
      {!potreros && !erroresCarga.length && <p className="text-suelo-600">Cargando…</p>}

      {potreros && (
        <>
          <ol className="space-y-3">
            {pasos.map((p, i) => (
              <Paso
                key={p.id}
                n={i + 1}
                paso={p}
                info={analisis[i]}
                potreros={ordenados}
                categorias={categorias}
                nombreDe={nombreDe}
                puedeQuitar={pasos.length > 1}
                onCambiar={(cambios) => cambiar(p.id, cambios)}
                onQuitar={() => quitar(p.id)}
                onLiberar={(l) => agregar({ potreroOrigenId: p.destinoPotreroId, loteOrigenId: String(l.loteId), cabezas: String(l.cabezas) })}
              />
            ))}
          </ol>

          <button type="button" onClick={() => agregar()} className="w-full rounded-md border-2 border-dashed border-campo-300 px-4 py-3 text-sm font-medium text-campo-700 hover:bg-campo-50">
            + Agregar otro movimiento
          </button>

          <section className="grid gap-3 rounded-lg border border-suelo-200 bg-white p-4 sm:grid-cols-2">
            <label className={etiqueta}>
              Fecha
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${inputClass} mt-1`} aria-label="Fecha" />
            </label>
            <label className={etiqueta}>
              Motivo (opcional)
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Por ejemplo: liberar el 12 para los terneros" className={`${inputClass} mt-1`} aria-label="Motivo" />
            </label>
          </section>

          {!previa ? (
            <button type="button" disabled={!cuerpo} onClick={verPrevia} className={buttonClass}>
              Ver cómo queda
            </button>
          ) : (
            <Previa previa={previa} ocupado={ocupado} onConfirmar={confirmar} onVolver={() => setPrevia(null)} />
          )}
        </>
      )}
    </main>
  );
}

function Paso({ n, paso: p, info, potreros, categorias, nombreDe, puedeQuitar, onCambiar, onQuitar, onLiberar }) {
  const { opciones, lote, lotesDestino, aviso } = info;
  const conAnimales = potreros.filter((x) => (x.stock?.lotes ?? []).length > 0);
  const todas = lote && Number(p.cabezas) === lote.cabezas;

  function elegirDestino(destinoPotreroId) {
    const cambios = { destinoPotreroId };
    if (lote && destinoPotreroId) {
      const destino = potreros.find((x) => String(x.id) === destinoPotreroId)?.stock?.lotes ?? [];
      Object.assign(cambios, modoSugerido({ ...p, destinoPotreroId }, lote, destino));
    }
    onCambiar(cambios);
  }

  return (
    <li className="space-y-3 rounded-lg border border-suelo-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Movimiento {n}</h2>
        {puedeQuitar && (
          <button type="button" onClick={onQuitar} className="text-sm text-red-700 hover:underline">
            Quitar
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={etiqueta}>
          Desde el potrero
          <select
            value={p.potreroOrigenId}
            onChange={(e) => onCambiar({ potreroOrigenId: e.target.value, loteOrigenId: '', modo: '', loteDestinoId: '' })}
            className={`${inputClass} mt-1`}
            aria-label={`Potrero de origen del movimiento ${n}`}
          >
            <option value="">Elegí…</option>
            {conAnimales.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className={etiqueta}>
          Lote
          <select
            value={p.loteOrigenId}
            onChange={(e) => {
              const l = opciones.find((x) => String(x.loteId) === e.target.value);
              onCambiar({ loteOrigenId: e.target.value, cabezas: l ? String(l.cabezas) : '', modo: '', loteDestinoId: '', destinoPotreroId: '' });
            }}
            disabled={!p.potreroOrigenId}
            className={`${inputClass} mt-1`}
            aria-label={`Lote del movimiento ${n}`}
          >
            <option value="">Elegí…</option>
            {opciones.map((l) => (
              <option key={l.loteId} value={l.loteId}>
                {l.lote} · {l.categoria} · {formatNumero(l.cabezas)}
              </option>
            ))}
          </select>
        </label>
        <label className={etiqueta}>
          Cabezas
          <input
            inputMode="numeric"
            value={p.cabezas}
            onChange={(e) => onCambiar({ cabezas: e.target.value.replace(/\D/g, '') })}
            className={`${inputClass} mt-1`}
            aria-label={`Cabezas del movimiento ${n}`}
          />
        </label>
        <label className={etiqueta}>
          Peso (opcional)
          <input inputMode="decimal" value={p.peso} onChange={(e) => onCambiar({ peso: e.target.value })} placeholder="kg" className={`${inputClass} mt-1`} aria-label={`Peso del movimiento ${n}`} />
        </label>
        <label className={`${etiqueta} col-span-2`}>
          Al potrero
          <select
            value={p.destinoPotreroId}
            onChange={(e) => elegirDestino(e.target.value)}
            disabled={!lote}
            className={`${inputClass} mt-1`}
            aria-label={`Potrero de destino del movimiento ${n}`}
          >
            <option value="">Elegí…</option>
            {potreros
              .filter((x) => String(x.id) !== p.potreroOrigenId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                  {(x.stock?.lotes ?? []).length ? ` · ${x.stock.lotes.map((l) => l.categoria).join(', ')}` : ' · vacío'}
                </option>
              ))}
          </select>
        </label>
      </div>
      {lote && Number(p.cabezas) > lote.cabezas && <p className="text-sm text-red-700">El lote tiene {formatNumero(lote.cabezas)} cabezas.</p>}

      {lote && p.destinoPotreroId && (
        <fieldset className="space-y-1.5 text-sm">
          <legend className="text-xs text-suelo-500">En el destino</legend>
          {lotesDestino
            .filter((l) => l.loteId !== lote.loteId)
            .map((l) => (
              <label key={l.loteId} className="flex items-center gap-2">
                <input type="radio" checked={p.modo === 'SUMAR' && p.loteDestinoId === String(l.loteId)} onChange={() => onCambiar({ modo: 'SUMAR', loteDestinoId: String(l.loteId) })} />
                Sumar al lote {l.lote} ({l.categoria})
              </label>
            ))}
          <label className="flex items-center gap-2">
            <input type="radio" checked={p.modo === 'NUEVO'} onChange={() => onCambiar({ modo: 'NUEVO', loteDestinoId: '', categoriaId: p.categoriaId || String(lote.categoriaId) })} />
            Formar un lote nuevo
          </label>
          {p.modo === 'NUEVO' && (
            <div className="grid gap-2 pl-6 sm:grid-cols-2">
              <input value={p.nombre} onChange={(e) => onCambiar({ nombre: e.target.value })} placeholder="Nombre (opcional)" aria-label={`Nombre del lote nuevo del movimiento ${n}`} className={inputClass} />
              <select value={p.categoriaId} onChange={(e) => onCambiar({ categoriaId: e.target.value })} aria-label={`Categoría del lote nuevo del movimiento ${n}`} className={inputClass}>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className={`flex items-center gap-2 ${todas ? '' : 'text-suelo-400'}`}>
            <input type="radio" disabled={!todas} checked={p.modo === 'ENTERO'} onChange={() => onCambiar({ modo: 'ENTERO', loteDestinoId: '' })} />
            Va el lote entero {todas ? '' : '(solo si van todas sus cabezas)'}
          </label>
        </fieldset>
      )}

      {aviso && (
        <div role="status" className="space-y-2 rounded-md bg-amber-500/15 p-3 text-sm text-amber-900">
          <p>
            En {nombreDe(p.destinoPotreroId)} hay {[...new Set(aviso.otras.map((l) => l.categoria))].join(', ')}: los {aviso.llega} se mezclarían.
          </p>
          {aviso.otras.map((l) => (
            <button key={l.loteId} type="button" onClick={() => onLiberar(l)} className="block font-medium text-campo-700 hover:underline">
              + Agregar movimiento para sacar {l.lote} ({formatNumero(l.cabezas)} {l.categoria}) de {nombreDe(p.destinoPotreroId)}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function Previa({ previa, ocupado, onConfirmar, onVolver }) {
  return (
    <section className="space-y-3 rounded-lg border-2 border-campo-300 bg-campo-50 p-4 text-sm">
      <h2 className="font-semibold">Así queda</h2>
      <ol className="list-decimal space-y-1 pl-5">
        {previa.pasos.map((p) => (
          <li key={p.paso}>
            {formatNumero(p.cabezas)} {p.categoriaOrigen}: {p.potreroOrigen} → {p.potreroDestino} (lote {p.loteDestino})
            {p.categoriaDestino !== p.categoriaOrigen && <span className="text-amber-800"> · pasan a {p.categoriaDestino}</span>}
          </li>
        ))}
      </ol>
      <div className="overflow-x-auto">
        <table className="w-full text-left tabular-nums">
          <thead className="text-xs text-suelo-500">
            <tr>
              <th className="py-1 pr-3">Potrero</th>
              <th className="py-1 pr-3 text-right">Antes</th>
              <th className="py-1 pr-3 text-right">Después</th>
              <th className="py-1">Queda</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-campo-200">
            {previa.potreros.map((p) => (
              <tr key={p.potreroId}>
                <td className="py-1.5 pr-3 font-medium">{p.potrero}</td>
                <td className="py-1.5 pr-3 text-right">{formatNumero(p.antes.cabezas)}</td>
                <td className="py-1.5 pr-3 text-right font-semibold">{formatNumero(p.despues.cabezas)}</td>
                <td className="py-1.5 text-xs">
                  {p.lineas.map((l) => `${l.lote} (${formatNumero(l.cabezas)})`).join(', ') || 'vacío'}
                  {p.aviso && <span className="block text-amber-800">{p.aviso}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={ocupado} onClick={onConfirmar} className={`${buttonClass} sm:w-auto`}>
          {ocupado ? 'Guardando…' : 'Confirmar todo'}
        </button>
        <button type="button" onClick={onVolver} className="px-4 text-sm text-suelo-600">
          Cambiar algo
        </button>
      </div>
    </section>
  );
}
