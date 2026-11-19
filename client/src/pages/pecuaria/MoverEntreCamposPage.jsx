import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCategorias, getDestinosEntreCampos, registrarEntreCampos, vistaPreviaEntreCampos } from '../../api/pecuaria';
import { getErrorMessages } from '../../api/axios';
import { useEstancia } from '../../context/EstanciaContext';
import usePotreros, { ordenNatural } from '../../hooks/usePotreros';
import { ErrorList, buttonClass, inputClass } from '../../components/ui';
import { cabezasPorCategoria, formatNumero } from '../../components/pecuaria';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const etiqueta = 'block text-sm text-suelo-600';
const seccion = 'space-y-3 rounded-lg border border-suelo-200 bg-white p-4';

// Mover entre campos (paso 5 del rediseño, DECISIONES §11): animales de un
// lote a un potrero de otra estancia. El campo de origen se elige acá (solo
// los del usuario); el destino, cualquier otra estancia. Allá forman un lote
// nuevo o va el lote entero. Se guarda como un evento que se ve en las dos
// estancias y se revierte entero.
export default function MoverEntreCamposPage() {
  const navigate = useNavigate();
  const { campos, campoId: campoDeArriba } = useEstancia();
  const [origenId, setOrigenId] = useState(null);
  const { potreros } = usePotreros(origenId);
  const [destinos, setDestinos] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [errors, setErrors] = useState([]);

  const [potreroId, setPotreroId] = useState('');
  const [loteId, setLoteId] = useState('');
  const [cabezas, setCabezas] = useState('');
  const [peso, setPeso] = useState('');
  const [campoDestinoId, setCampoDestinoId] = useState('');
  const [potreroDestinoId, setPotreroDestinoId] = useState('');
  const [modo, setModo] = useState('NUEVO');
  const [nombre, setNombre] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [guia, setGuia] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [nota, setNota] = useState('');
  const [previa, setPrevia] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  // El campo de origen arranca en el elegido arriba (o el primero, si arriba está "Todas").
  useEffect(() => {
    if (!origenId && campos?.length) setOrigenId(campoDeArriba ?? campos[0].id);
  }, [campos, campoDeArriba, origenId]);

  useEffect(() => {
    getCategorias()
      .then(({ data }) => setCategorias(data.filter((c) => c.activo)))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar las categorías')));
  }, []);

  useEffect(() => {
    if (!origenId) return;
    setDestinos(null);
    getDestinosEntreCampos(origenId)
      .then(({ data }) => setDestinos(data))
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar los campos de destino')));
  }, [origenId]);

  const conAnimales = useMemo(
    () => (potreros ?? []).filter((p) => (p.stock?.lotes ?? []).length > 0).sort((a, b) => ordenNatural.compare(a.nombre, b.nombre)),
    [potreros],
  );
  const potrero = conAnimales.find((p) => String(p.id) === potreroId);
  const lote = potrero?.stock.lotes.find((l) => String(l.loteId) === loteId);
  const campoDestino = destinos?.find((c) => String(c.id) === campoDestinoId);
  const n = Number.parseInt(cabezas, 10) || 0;
  const todos = lote && n === lote.cabezas;
  const modoReal = modo === 'ENTERO' && !todos ? 'NUEVO' : modo;

  // Al elegir el lote: todas sus cabezas y su categoría para el lote nuevo.
  function elegirLote(id) {
    setLoteId(id);
    const l = potrero?.stock.lotes.find((x) => String(x.loteId) === id);
    if (l) {
      setCabezas(String(l.cabezas));
      setCategoriaId(String(l.categoriaId));
    }
  }

  function cambiarOrigen(id) {
    setOrigenId(Number(id));
    setPotreroId('');
    setLoteId('');
    setCampoDestinoId('');
    setPotreroDestinoId('');
  }

  const cuerpo = useMemo(() => {
    if (!lote || n < 1 || n > lote.cabezas || !potreroDestinoId) return null;
    const base = {
      loteOrigenId: lote.loteId,
      cabezas: n,
      destinoPotreroId: Number(potreroDestinoId),
      modo: modoReal,
      fecha,
      ...(peso.trim() && { pesoPromedioKg: Number(peso.replace(',', '.')) }),
      ...(guia.trim() && { guia: guia.trim() }),
      ...(nota.trim() && { nota: nota.trim() }),
    };
    if (modoReal === 'NUEVO') {
      if (!categoriaId) return null;
      return { ...base, nuevoLote: { categoriaId: Number(categoriaId), ...(nombre.trim() && { nombre: nombre.trim() }) } };
    }
    return base;
  }, [lote, n, potreroDestinoId, modoReal, fecha, peso, guia, nota, categoriaId, nombre]);

  // Cualquier cambio invalida la vista previa.
  useEffect(() => setPrevia(null), [cuerpo]);

  async function verPrevia() {
    setErrors([]);
    try {
      setPrevia((await vistaPreviaEntreCampos(cuerpo)).data);
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo armar la vista previa'));
    }
  }

  async function confirmar() {
    setOcupado(true);
    try {
      const { data } = await registrarEntreCampos(cuerpo);
      const m = data.movimiento;
      navigate('/pecuaria/movimientos', {
        state: { aviso: `Listo: ${formatNumero(m.cabezas)} cabezas de ${m.potreroOrigen} a ${m.campoDestino} · ${m.potreroDestino} (lote ${m.loteDestino}).` },
      });
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo registrar'));
      setOcupado(false);
    }
  }

  if (!campos) return <main className="mx-auto max-w-3xl px-4 py-6 text-suelo-600">Cargando…</main>;

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 sm:py-8">
      <div>
        <Link to="/pecuaria/movimientos" className="text-sm text-campo-600 hover:underline">
          ← Movimientos
        </Link>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Mover entre campos</h1>
        <p className="text-sm text-suelo-600">Animales de una estancia a un potrero de otra. Queda en los movimientos de las dos.</p>
      </div>
      <ErrorList errors={errors} />

      <section className={seccion}>
        <h2 className="font-semibold">1. De dónde salen</h2>
        <label className={etiqueta}>
          Campo de origen
          <select value={origenId ?? ''} onChange={(e) => cambiarOrigen(e.target.value)} className={`${inputClass} mt-1`} aria-label="Campo de origen">
            {campos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className={etiqueta}>
          Potrero
          <select
            value={potreroId}
            onChange={(e) => {
              setPotreroId(e.target.value);
              setLoteId('');
            }}
            className={`${inputClass} mt-1`}
            aria-label="Potrero de origen"
          >
            <option value="">{potreros ? 'Elegí el potrero…' : 'Cargando…'}</option>
            {conAnimales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} · {cabezasPorCategoria(p.stock.lotes)}
              </option>
            ))}
          </select>
        </label>
        {potrero && (
          <label className={etiqueta}>
            Lote
            <select value={loteId} onChange={(e) => elegirLote(e.target.value)} className={`${inputClass} mt-1`} aria-label="Lote de origen">
              <option value="">Elegí el lote…</option>
              {potrero.stock.lotes.map((l) => (
                <option key={l.loteId} value={l.loteId}>
                  {l.lote} · {l.categoria} · {formatNumero(l.cabezas)} cab
                </option>
              ))}
            </select>
          </label>
        )}
        {lote && (
          <div className="grid grid-cols-2 gap-3">
            <label className={etiqueta}>
              Cabezas
              <input inputMode="numeric" value={cabezas} onChange={(e) => setCabezas(e.target.value.replace(/\D/g, ''))} className={`${inputClass} mt-1`} aria-label="Cabezas" />
            </label>
            <label className={etiqueta}>
              Peso de los que van (opcional)
              <input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="kg" className={`${inputClass} mt-1`} aria-label="Peso promedio" />
            </label>
            {n > lote.cabezas && <p className="col-span-2 text-sm text-red-700">El lote tiene {formatNumero(lote.cabezas)} cabezas.</p>}
          </div>
        )}
      </section>

      <section className={seccion}>
        <h2 className="font-semibold">2. A dónde van</h2>
        <label className={etiqueta}>
          Campo de destino
          <select
            value={campoDestinoId}
            onChange={(e) => {
              setCampoDestinoId(e.target.value);
              setPotreroDestinoId('');
            }}
            className={`${inputClass} mt-1`}
            aria-label="Campo de destino"
          >
            <option value="">{destinos ? 'Elegí el campo…' : 'Cargando…'}</option>
            {(destinos ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        {campoDestino && (
          <label className={etiqueta}>
            Potrero de destino
            <select value={potreroDestinoId} onChange={(e) => setPotreroDestinoId(e.target.value)} className={`${inputClass} mt-1`} aria-label="Potrero de destino">
              <option value="">Elegí el potrero…</option>
              {campoDestino.potreros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className={seccion}>
        <h2 className="font-semibold">3. Cómo llegan</h2>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="modo" checked={modoReal === 'NUEVO'} onChange={() => setModo('NUEVO')} className="mt-1" />
          <span>
            Forman un lote nuevo
            <span className="block text-xs text-suelo-500">Allá se pueden juntar después con otro lote.</span>
          </span>
        </label>
        {modoReal === 'NUEVO' && (
          <div className="grid gap-2 pl-6 sm:grid-cols-2">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (si no, potrero · categoría)" aria-label="Nombre del lote nuevo" className={inputClass} />
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} aria-label="Categoría del lote nuevo" className={inputClass}>
              <option value="">Categoría…</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className={`flex items-start gap-2 text-sm ${todos ? '' : 'text-suelo-400'}`}>
          <input type="radio" name="modo" disabled={!todos} checked={modoReal === 'ENTERO'} onChange={() => setModo('ENTERO')} className="mt-1" />
          <span>
            Va el lote entero
            <span className="block text-xs text-suelo-500">{todos ? 'Mantiene su nombre y pasa a la otra estancia.' : 'Solo si van todas sus cabezas.'}</span>
          </span>
        </label>
      </section>

      <section className={seccion}>
        <h2 className="font-semibold">4. Datos del traslado</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={etiqueta}>
            Guía (opcional)
            <input value={guia} onChange={(e) => setGuia(e.target.value)} placeholder="Número de guía" className={`${inputClass} mt-1`} aria-label="Guía" />
          </label>
          <label className={etiqueta}>
            Fecha
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${inputClass} mt-1`} aria-label="Fecha" />
          </label>
        </div>
        <label className={etiqueta}>
          Nota (opcional)
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Por ejemplo: para engorde en La Seda" className={`${inputClass} mt-1`} aria-label="Nota" />
        </label>
      </section>

      {!previa ? (
        <button type="button" disabled={!cuerpo} onClick={verPrevia} className={buttonClass}>
          Ver cómo queda
        </button>
      ) : (
        <section className="space-y-3 rounded-lg border-2 border-campo-300 bg-campo-50 p-4 text-sm">
          <h2 className="font-semibold">Así queda</h2>
          <p>
            <strong>{previa.origen.campo.nombre} · {previa.origen.potrero}</strong>: {formatNumero(previa.origen.antes.cabezas)} →{' '}
            <strong>{formatNumero(previa.origen.despues.cabezas)}</strong> cabezas
          </p>
          <p>
            Llegan <strong>{formatNumero(previa.destino.cabezas)} {previa.destino.categoria}</strong> a{' '}
            <strong>{previa.destino.campo.nombre} · {previa.destino.potrero}</strong>,{' '}
            {previa.destino.loteEntero ? `con su lote (${previa.destino.lote})` : `lote nuevo "${previa.destino.lote}"`}.
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={ocupado} onClick={confirmar} className={`${buttonClass} sm:w-auto`}>
              {ocupado ? 'Guardando…' : 'Confirmar'}
            </button>
            <button type="button" onClick={() => setPrevia(null)} className="px-4 text-sm text-suelo-600">
              Cambiar algo
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
