import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getCategorias, getPotrero, getPotreros, registrarMovimiento, vistaPreviaMovimiento } from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList, buttonClass, inputClass } from '../components/ui';
import { UsoBadge, cabezasPorCategoria, formatNumero } from '../components/pecuaria';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const aNumero = (texto) => (String(texto).trim() === '' ? null : Number(String(texto).replace(',', '.')));
const ordenNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const etiqueta = 'block text-sm text-suelo-600';

// Mover animales de un lote: a otro lote (toman su categoría), a un lote
// nuevo, o el lote entero a otro potrero. Antes de confirmar se ve cómo
// quedan los dos potreros.
export default function MoverPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const potreroId = Number(params.get('potrero'));
  const loteId = Number(params.get('lote'));
  // Desde el "+" → Cambio de categoría: el lote entero, en el mismo potrero.
  const cambioCategoria = params.get('cambio') === 'categoria';

  const [origen, setOrigen] = useState(null);
  const [potreros, setPotreros] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [destino, setDestino] = useState(null);
  const [errors, setErrors] = useState([]);

  const [cabezas, setCabezas] = useState('');
  const [peso, setPeso] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [modo, setModo] = useState('');
  const [loteDestinoId, setLoteDestinoId] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevaCategoriaId, setNuevaCategoriaId] = useState('');
  const [categoriaEntero, setCategoriaEntero] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [nota, setNota] = useState('');
  const [previa, setPrevia] = useState(null);
  const [problema, setProblema] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: cats }] = await Promise.all([getPotrero(potreroId), getCategorias()]);
      setOrigen(p);
      setCategorias(cats.filter((c) => c.activo));
      const elegido = p.stock?.lineas.find((l) => l.loteId === loteId);
      if (cambioCategoria && elegido) {
        setCabezas(String(elegido.cabezas));
        setDestinoId(String(p.id));
      }
      const { data: lista } = await getPotreros(p.campoId);
      setPotreros([...lista].sort((a, b) => ordenNatural.compare(a.nombre, b.nombre)));
    })().catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar el lote')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [potreroId]);

  const lote = origen?.stock?.lineas.find((l) => l.loteId === loteId);
  const n = Number.parseInt(cabezas, 10) || 0;
  const todos = lote && n === lote.cabezas;

  // Al elegir el destino, se cargan sus lotes y se propone el modo más común.
  useEffect(() => {
    if (!destinoId) return setDestino(null);
    getPotrero(destinoId)
      .then(({ data }) => setDestino(data))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar el potrero de destino')));
  }, [destinoId]);

  const lotesDestino = useMemo(() => (destino?.stock?.lineas ?? []).filter((l) => l.loteId !== loteId), [destino, loteId]);
  const mismoPotrero = destino && origen && destino.id === origen.id;

  // Qué se propone primero (docs/LOGISTICA_MOVIMIENTOS.md §2): si en el
  // destino hay una parte del mismo lote, sumarse a ella; si no hay lotes y es
  // una parte, que siga siendo el mismo lote ("MISMO": NUEVO con mismoLote).
  useEffect(() => {
    if (!destino || !lote) return;
    const deLaFamilia = lotesDestino.find((l) => l.familiaId === lote.familiaId && l.categoriaId === lote.categoriaId);
    if (cambioCategoria && mismoPotrero && todos) {
      setModo('CATEGORIA');
      setCategoriaEntero('');
    } else if (deLaFamilia || lotesDestino.length) {
      setModo('SUMAR');
      setLoteDestinoId(String((deLaFamilia ?? lotesDestino[0]).loteId));
    } else if (mismoPotrero) {
      setModo('NUEVO');
    } else {
      setModo(todos ? 'ENTERO' : 'MISMO');
    }
    setNuevaCategoriaId(String(lote.categoriaId));
    // Solo al cambiar de destino.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destino]);

  // "Sigue siendo el mismo lote" es para una parte: si van todas, el lote entero.
  useEffect(() => {
    if (modo === 'MISMO' && todos) setModo('ENTERO');
  }, [modo, todos]);

  const cuerpo = useMemo(() => {
    if (!lote || !destinoId || !modo || n < 1) return null;
    const base = {
      fecha,
      loteOrigenId: loteId,
      cabezas: n,
      pesoPromedioKg: aNumero(peso),
      destinoPotreroId: Number(destinoId),
      modo,
      nota,
    };
    if (modo === 'MISMO') return { ...base, modo: 'NUEVO', mismoLote: true };
    if (modo === 'SUMAR') return loteDestinoId ? { ...base, loteDestinoId: Number(loteDestinoId) } : null;
    if (modo === 'NUEVO') return nuevaCategoriaId ? { ...base, nuevoLote: { nombre: nuevoNombre, categoriaId: Number(nuevaCategoriaId) } } : null;
    if (modo === 'CATEGORIA') return categoriaEntero ? { ...base, categoriaId: Number(categoriaEntero) } : null;
    return { ...base, ...(categoriaEntero && { categoriaId: Number(categoriaEntero) }) };
  }, [lote, destinoId, modo, n, fecha, loteId, peso, nota, loteDestinoId, nuevoNombre, nuevaCategoriaId, categoriaEntero]);

  // Vista previa: se pide de nuevo cada vez que cambia el formulario.
  useEffect(() => {
    setPrevia(null);
    setProblema(null);
    if (!cuerpo) return;
    const t = setTimeout(() => {
      vistaPreviaMovimiento(cuerpo)
        .then(({ data }) => setPrevia(data))
        .catch((error) => setProblema(getErrorMessages(error, 'No se pudo calcular el movimiento')[0]));
    }, 350);
    return () => clearTimeout(t);
  }, [cuerpo]);

  async function confirmar() {
    setOcupado(true);
    try {
      const { data } = await registrarMovimiento(cuerpo);
      const m = data.movimiento;
      const aviso =
        m.modo === 'CATEGORIA'
          ? `Categoría cambiada: el lote ${m.loteOrigen} pasa de ${m.categoriaOrigen} a ${m.categoriaDestino}.`
          : `Movimiento registrado: ${m.cabezas} ${m.categoriaOrigen} al lote ${m.loteDestino} (${m.potreroDestino}).`;
      navigate(`/pecuaria/potreros/${potreroId}`, { state: { aviso } });
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo registrar el movimiento'));
      setOcupado(false);
    }
  }

  if (!origen || !lote) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <ErrorList errors={errors} />
        {!errors.length && <p className="text-suelo-600">{origen ? 'Ese lote ya no está en este potrero.' : 'Cargando…'}</p>}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <Link to={`/pecuaria/potreros/${potreroId}`} className="text-sm text-campo-600 hover:underline">
        ← {origen.nombre}
      </Link>
      <h1 className="mb-1 mt-2 text-3xl font-bold">{cambioCategoria ? 'Cambiar categoría' : 'Mover animales'}</h1>
      <p className="mb-6 text-suelo-600">
        Lote <strong className="text-suelo-800">{lote.lote}</strong> · {lote.categoria} · {formatNumero(lote.cabezas)} cab
        {lote.pesoPromedioKg ? ` · ${formatNumero(lote.pesoPromedioKg)} kg` : ''} · potrero {origen.nombre}
      </p>
      <ErrorList errors={errors} />

      <section className="space-y-4 rounded-lg border border-suelo-200 p-4">
        <h2 className="font-semibold">1. Cuántos salen</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className={etiqueta}>
            Cabezas
            <div className="mt-1 flex gap-2">
              <input
                inputMode="numeric"
                value={cabezas}
                onChange={(e) => setCabezas(e.target.value.replace(/\D/g, ''))}
                className={inputClass}
                aria-label="Cabezas a mover"
              />
              <button type="button" onClick={() => setCabezas(String(lote.cabezas))} className="rounded-md bg-suelo-200 px-3 text-sm text-suelo-900">
                Todas
              </button>
            </div>
          </label>
          <label className={etiqueta}>
            Peso de los que salen (opcional)
            <input
              inputMode="decimal"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
              placeholder={lote.pesoPromedioKg ? `${formatNumero(lote.pesoPromedioKg)} (promedio)` : 'kg'}
              className={`${inputClass} mt-1`}
              aria-label="Peso promedio de los que salen"
            />
          </label>
        </div>
        {n > lote.cabezas && <p className="text-sm text-red-700">El lote tiene {formatNumero(lote.cabezas)} cabezas.</p>}
      </section>

      <section className="mt-4 space-y-4 rounded-lg border border-suelo-200 p-4">
        <h2 className="font-semibold">2. A dónde van</h2>
        <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} className={inputClass} aria-label="Potrero de destino">
          <option value="">Elegí el potrero de destino…</option>
          {potreros.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
              {p.id === origen.id ? ' (este mismo)' : ''} · {cabezasPorCategoria(p.stock?.lotes)} · {p.usoActual?.nombre ?? 'sin uso'}
            </option>
          ))}
        </select>

        {destino && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-suelo-600">
              <UsoBadge uso={destino.usoActual} />
              {destino.stock?.cabHa != null && <span>{formatNumero(destino.stock.cabHa, 2)} cab/ha hoy</span>}
            </div>

            {lotesDestino.map((l) => (
              <Opcion
                key={l.loteId}
                activa={modo === 'SUMAR' && loteDestinoId === String(l.loteId)}
                onElegir={() => {
                  setModo('SUMAR');
                  setLoteDestinoId(String(l.loteId));
                }}
              >
                Sumar al lote <strong>{l.lote}</strong>
                <span className="block text-xs text-suelo-600">
                  {l.familiaId === lote.familiaId && <span className="text-campo-700">parte del mismo lote · </span>}
                  {l.categoria} · {formatNumero(l.cabezas)} cab
                  {l.categoriaId !== lote.categoriaId && (
                    <span className="text-amber-800"> — ojo: los {lote.categoria} que llegan pasan a ser {l.categoria}</span>
                  )}
                </span>
              </Opcion>
            ))}

            {!todos && !mismoPotrero && (
              <Opcion activa={modo === 'MISMO'} onElegir={() => setModo('MISMO')}>
                Sigue siendo el mismo lote
                <span className="block text-xs text-suelo-600">
                  {lote.categoria} · queda como <strong>{modo === 'MISMO' && previa ? previa.loteDestino : `${lote.lote} · ${destino.nombre}`}</strong>, parte de{' '}
                  {lote.lote}
                </span>
              </Opcion>
            )}

            <Opcion activa={modo === 'NUEVO'} onElegir={() => setModo('NUEVO')}>
              Formar un lote nuevo
              <span className="block text-xs text-suelo-600">Con nombre y categoría propios</span>
            </Opcion>
            {modo === 'NUEVO' && (
              <div className="grid gap-2 pl-2 sm:grid-cols-2">
                <input
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder={`Nombre (si no, "${destino.nombre} · categoría")`}
                  className={inputClass}
                  aria-label="Nombre del lote nuevo"
                />
                <select value={nuevaCategoriaId} onChange={(e) => setNuevaCategoriaId(e.target.value)} className={inputClass} aria-label="Categoría del lote nuevo">
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {todos && mismoPotrero && (
              <>
                <Opcion
                  activa={modo === 'CATEGORIA'}
                  onElegir={() => {
                    setModo('CATEGORIA');
                    setCategoriaEntero('');
                  }}
                >
                  Cambiar la categoría del lote
                  <span className="block text-xs text-suelo-600">Se queda en {destino.nombre}; queda registrado como movimiento</span>
                </Opcion>
                {modo === 'CATEGORIA' && (
                  <label className={`${etiqueta} pl-2`}>
                    Categoría nueva
                    <select value={categoriaEntero} onChange={(e) => setCategoriaEntero(e.target.value)} className={`${inputClass} mt-1`}>
                      <option value="">Elegí la categoría…</option>
                      {categorias
                        .filter((c) => c.id !== lote.categoriaId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </>
            )}

            {todos && !mismoPotrero && (
              <>
                <Opcion activa={modo === 'ENTERO'} onElegir={() => setModo('ENTERO')}>
                  Mover el lote entero
                  <span className="block text-xs text-suelo-600">Sigue siendo el lote {lote.lote}, ahora en {destino.nombre}</span>
                </Opcion>
                {modo === 'ENTERO' && (
                  <label className={`${etiqueta} pl-2`}>
                    Categoría al llegar
                    <select value={categoriaEntero} onChange={(e) => setCategoriaEntero(e.target.value)} className={`${inputClass} mt-1`}>
                      <option value="">Sin cambio ({lote.categoria})</option>
                      {categorias
                        .filter((c) => c.id !== lote.categoriaId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <section className="mt-4 grid gap-3 rounded-lg border border-suelo-200 p-4 sm:grid-cols-2">
        <label className={etiqueta}>
          Fecha
          <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className={etiqueta}>
          Motivo (opcional)
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={255} placeholder="Por ejemplo: los más pesados" className={`${inputClass} mt-1`} />
        </label>
      </section>

      {problema && <p className="mt-4 rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-900">{problema}</p>}
      {previa && <Impacto previa={previa} />}

      <button type="button" disabled={!previa || ocupado} onClick={confirmar} className={`${buttonClass} mt-6`}>
        {ocupado ? 'Registrando…' : 'Confirmar movimiento'}
      </button>
    </main>
  );
}

function Opcion({ activa, onElegir, children }) {
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={activa}
      className={`w-full rounded-md border px-3 py-2 text-left text-sm ${activa ? 'border-campo-500 bg-campo-50' : 'border-suelo-300 hover:border-suelo-400'}`}
    >
      {children}
    </button>
  );
}

// Cómo quedan los potreros: antes → después.
function Impacto({ previa }) {
  const lados = [
    ['Origen', previa.origen],
    ...(previa.destino ? [['Destino', previa.destino]] : []),
  ];
  const cambio = (a, d, decimales = 0) =>
    a === d ? formatNumero(d, decimales) : `${formatNumero(a, decimales)} → ${formatNumero(d, decimales)}`;
  return (
    <section className="mt-6">
      <h2 className="mb-2 font-semibold">Cómo quedan</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {lados.map(([titulo, l]) => (
          <div key={titulo} className="rounded-lg border border-suelo-200 bg-white p-4 text-sm">
            <p className="text-xs uppercase text-suelo-600">{titulo}</p>
            <p className="mb-2 text-lg font-semibold">{l.potrero}</p>
            <p>Cabezas: <strong>{cambio(l.antes.cabezas, l.despues.cabezas)}</strong></p>
            <p>Cab/ha: <strong>{l.despues.cabHa == null ? '—' : cambio(l.antes.cabHa, l.despues.cabHa, 2)}</strong></p>
            <p>UG/ha: <strong>{l.despues.ugHa == null ? '—' : cambio(l.antes.ugHa, l.despues.ugHa, 2)}</strong></p>
            <ul className="mt-2 text-suelo-600">
              {l.lineas.map((x) => (
                <li key={x.loteId ?? 'nuevo'}>
                  {x.lote}: {formatNumero(x.cabezas)} {x.categoria}
                  {x.pesoPromedioKg ? ` · ${formatNumero(x.pesoPromedioKg, 1)} kg` : ''}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
