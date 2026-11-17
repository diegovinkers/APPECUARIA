import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getCampos,
  getCategorias,
  getCausas,
  getPotrero,
  getPotreros,
  getTiposMovimiento,
  registrarEntradaSalida,
  vistaPreviaEntradaSalida,
} from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList, buttonClass, inputClass } from '../components/ui';
import { formatNumero } from '../components/pecuaria';

const hoy = () => new Date().toLocaleDateString('sv-SE');
const aNumero = (texto) => (String(texto ?? '').trim() === '' ? null : Number(String(texto).replace(',', '.')));
const entero = (texto) => Number.parseInt(texto, 10) || 0;
const ordenNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const etiqueta = 'block text-sm text-zinc-400';
const seccion = 'mt-4 space-y-3 rounded-lg border border-zinc-800 p-4';

// Una línea de una entrada: cuántos, de qué categoría y a qué lote (uno nuevo
// o uno que ya está en el potrero).
const lineaVacia = (categoriaId = '') => ({ categoriaId: String(categoriaId), cabezas: '', peso: '', destino: 'nuevo', nombre: '' });

// Registrar una entrada (nacimiento, compra, traslado desde otro campo) o una
// salida (muerte, consumo, venta, traslado a otro campo, pérdida). Qué datos
// pide lo dice el tipo elegido (Configuración → Tipos de movimiento).
export default function RegistrarPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const efecto = params.get('efecto') === 'ENTRA' ? 'ENTRA' : 'SALE';
  const potreroId = Number(params.get('potrero')) || null;
  const loteParam = params.get('lote') ?? '';
  const sale = efecto === 'SALE';

  const [potrero, setPotrero] = useState(null);
  const [potreros, setPotreros] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [causas, setCausas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [campos, setCampos] = useState([]);
  const [errors, setErrors] = useState([]);

  const [tipoId, setTipoId] = useState('');
  const [loteId, setLoteId] = useState(loteParam);
  const [cabezas, setCabezas] = useState('');
  const [peso, setPeso] = useState('');
  const [lineas, setLineas] = useState([lineaVacia()]);
  const [madresId, setMadresId] = useState('');
  const [causaId, setCausaId] = useState('');
  const [guia, setGuia] = useState('');
  const [campoOtroId, setCampoOtroId] = useState('');
  const [fecha, setFecha] = useState(hoy());
  const [nota, setNota] = useState('');
  const [previa, setPrevia] = useState(null);
  const [problema, setProblema] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  // Catálogos (una vez).
  useEffect(() => {
    Promise.all([getTiposMovimiento(), getCausas(), getCategorias(), getCampos()])
      .then(([t, c, cat, cam]) => {
        setTipos(t.data.filter((x) => x.activo));
        setCausas(c.data.filter((x) => x.activo));
        setCategorias(cat.data.filter((x) => x.activo));
        setCampos(cam.data);
      })
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudieron cargar los catálogos')));
  }, []);

  // El potrero elegido y los demás de su campo.
  useEffect(() => {
    if (!potreroId) return;
    getPotrero(potreroId)
      .then(async ({ data }) => {
        setPotrero(data);
        if (!potreros.length || potreros[0].campoId !== data.campoId) {
          const { data: lista } = await getPotreros(data.campoId);
          setPotreros([...lista].sort((a, b) => ordenNatural.compare(a.nombre, b.nombre)));
        }
      })
      .catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar el potrero')));
    // Solo al cambiar de potrero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [potreroId]);

  const delEfecto = useMemo(() => tipos.filter((t) => t.efecto === efecto), [tipos, efecto]);
  const tipo = delEfecto.find((t) => String(t.id) === tipoId) ?? null;
  const esNacimiento = tipo?.clave === 'NACIMIENTO';
  const esTraslado = tipo?.clave?.startsWith('TRASLADO');
  const causasDelTipo = tipo ? causas.filter((c) => c.tipos.some((t) => t.id === tipo.id)) : [];
  const sexoDe = useMemo(() => new Map(categorias.map((c) => [c.id, c.sexo])), [categorias]);
  const lotes = potrero?.stock?.lineas ?? [];
  const lote = lotes.find((l) => String(l.loteId) === loteId);

  // Al cambiar de entrada a salida (o al revés) se empieza de nuevo.
  useEffect(() => {
    setTipoId('');
    setCausaId('');
  }, [efecto]);

  // Al elegir el tipo: las líneas que tienen sentido (un nacimiento: terneros y terneras).
  function elegirTipo(t) {
    setTipoId(String(t.id));
    setCausaId('');
    if (!sale) {
      if (t.clave === 'NACIMIENTO') {
        const machos = categorias.find((c) => c.nombre === 'Terneros') ?? categorias.find((c) => c.sexo === 'MACHO');
        const hembras = categorias.find((c) => c.nombre === 'Terneras') ?? categorias.find((c) => c.sexo === 'HEMBRA');
        setLineas([lineaVacia(machos?.id ?? ''), lineaVacia(hembras?.id ?? '')]);
      } else {
        setLineas([lineaVacia(categorias[0]?.id ?? '')]);
      }
    }
  }

  const cambiarLinea = (i, campo, valor) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  const cuerpo = useMemo(() => {
    if (!tipo || !potrero) return null;
    const comun = {
      tipoId: tipo.id,
      fecha,
      nota,
      ...(causaId && { causaId: Number(causaId) }),
      ...(guia.trim() && { guia: guia.trim() }),
      ...(campoOtroId && { campoOtroId: Number(campoOtroId) }),
    };
    if (sale) {
      if (!lote || entero(cabezas) < 1) return null;
      return { ...comun, loteId: lote.loteId, cabezas: entero(cabezas), pesoPromedioKg: aNumero(peso) };
    }
    // Las líneas en 0 no se mandan (por ejemplo, un parto sin terneras).
    const conAnimales = lineas.filter((l) => entero(l.cabezas) > 0 && l.categoriaId);
    if (!conAnimales.length) return null;
    return {
      ...comun,
      potreroId: potrero.id,
      ...(esNacimiento && madresId && { loteMadresId: Number(madresId) }),
      lineas: conAnimales.map((l) => ({
        cabezas: entero(l.cabezas),
        pesoPromedioKg: aNumero(l.peso),
        ...(l.destino === 'nuevo' ? { nuevoLote: { nombre: l.nombre, categoriaId: Number(l.categoriaId) } } : { loteId: Number(l.destino) }),
      })),
    };
  }, [tipo, potrero, fecha, nota, causaId, guia, campoOtroId, sale, lote, cabezas, peso, lineas, esNacimiento, madresId]);

  // Vista previa: se pide de nuevo cada vez que cambia el formulario.
  useEffect(() => {
    setPrevia(null);
    setProblema(null);
    if (!cuerpo) return;
    const t = setTimeout(() => {
      vistaPreviaEntradaSalida(cuerpo)
        .then(({ data }) => setPrevia(data))
        .catch((error) => setProblema(getErrorMessages(error, 'No se pudo calcular')[0]));
    }, 350);
    return () => clearTimeout(t);
  }, [cuerpo]);

  async function confirmar() {
    setOcupado(true);
    try {
      const { data } = await registrarEntradaSalida(cuerpo);
      const total = data.movimientos.reduce((s, m) => s + m.cabezas, 0);
      const aviso = `${tipo.nombre} registrada: ${sale ? 'salen' : 'entran'} ${formatNumero(total)} cabezas ${sale ? 'de' : 'a'} ${potrero.nombre}.`;
      navigate(`/pecuaria/potreros/${potrero.id}`, { state: { aviso } });
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo registrar'));
      setOcupado(false);
    }
  }

  const cambiarEfecto = (nuevo) => setParams({ efecto: nuevo, ...(potreroId && { potrero: String(potreroId) }) }, { replace: true });

  if (!potreroId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-zinc-400">
          Elegí un potrero desde la <Link to="/pecuaria?vista=movimientos" className="text-sky-400 hover:underline">pestaña Movimientos</Link>.
        </p>
      </main>
    );
  }
  if (!potrero) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <ErrorList errors={errors} />
        {!errors.length && <p className="text-zinc-400">Cargando…</p>}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <Link to={`/pecuaria/potreros/${potrero.id}`} className="text-sm text-sky-400 hover:underline">
        ← {potrero.nombre}
      </Link>
      <h1 className="mb-4 mt-2 text-3xl font-bold">{sale ? 'Salida de animales' : 'Entrada de animales'}</h1>
      <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="Entrada o salida">
        {[
          ['ENTRA', 'Entran animales'],
          ['SALE', 'Salen animales'],
        ].map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            aria-pressed={efecto === valor}
            onClick={() => cambiarEfecto(valor)}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${efecto === valor ? 'border-sky-500 bg-sky-900/30 text-white' : 'border-zinc-700 text-zinc-300'}`}
          >
            {texto}
          </button>
        ))}
      </div>
      <ErrorList errors={errors} />

      <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
        <h2 className="font-semibold">1. Qué pasó</h2>
        <div className="flex flex-wrap gap-2">
          {delEfecto.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tipo?.id === t.id}
              onClick={() => elegirTipo(t)}
              className={`rounded-full px-3 py-1.5 text-sm ${tipo?.id === t.id ? 'bg-sky-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
            >
              {t.nombre}
            </button>
          ))}
        </div>
      </section>

      {tipo && (
        <section className={seccion}>
          <h2 className="font-semibold">{sale ? '2. De qué lote salen' : '2. A dónde entran'}</h2>
          <label className={etiqueta}>
            Potrero
            <select
              value={potrero.id}
              onChange={(e) => {
                setLoteId('');
                setMadresId('');
                setLineas((ls) => ls.map((l) => ({ ...l, destino: 'nuevo' })));
                setParams({ efecto, potrero: e.target.value }, { replace: true });
              }}
              className={`${inputClass} mt-1`}
            >
              {potreros
                .filter((p) => !sale || (p.stock?.cabezas ?? 0) > 0 || p.id === potrero.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {formatNumero(p.stock?.cabezas ?? 0)} cab
                  </option>
                ))}
            </select>
          </label>

          {sale ? (
            <>
              <label className={etiqueta}>
                Lote
                <select value={loteId} onChange={(e) => setLoteId(e.target.value)} className={`${inputClass} mt-1`}>
                  <option value="">Elegí el lote…</option>
                  {lotes.map((l) => (
                    <option key={l.loteId} value={l.loteId}>
                      {l.lote} · {l.categoria} · {formatNumero(l.cabezas)} cab
                    </option>
                  ))}
                </select>
              </label>
              {lote && (
                <div className="grid grid-cols-2 gap-3">
                  <label className={etiqueta}>
                    Cabezas
                    <div className="mt-1 flex gap-2">
                      <input
                        inputMode="numeric"
                        value={cabezas}
                        onChange={(e) => setCabezas(e.target.value.replace(/\D/g, ''))}
                        className={inputClass}
                        aria-label="Cabezas que salen"
                      />
                      <button type="button" onClick={() => setCabezas(String(lote.cabezas))} className="rounded-md bg-zinc-700 px-3 text-sm text-white">
                        Todas
                      </button>
                    </div>
                  </label>
                  <label className={etiqueta}>
                    Peso promedio (opcional)
                    <input
                      inputMode="decimal"
                      value={peso}
                      onChange={(e) => setPeso(e.target.value)}
                      placeholder={lote.pesoPromedioKg ? `${formatNumero(lote.pesoPromedioKg)} (promedio del lote)` : 'kg'}
                      className={`${inputClass} mt-1`}
                      aria-label="Peso promedio de los que salen"
                    />
                  </label>
                </div>
              )}
              {lote && entero(cabezas) > lote.cabezas && <p className="text-sm text-red-300">El lote tiene {formatNumero(lote.cabezas)} cabezas.</p>}
            </>
          ) : (
            <>
              {esNacimiento && (
                <label className={etiqueta}>
                  Lote de las madres (opcional)
                  <select value={madresId} onChange={(e) => setMadresId(e.target.value)} className={`${inputClass} mt-1`}>
                    <option value="">Sin indicar</option>
                    {lotes
                      .filter((l) => sexoDe.get(l.categoriaId) !== 'MACHO')
                      .map((l) => (
                        <option key={l.loteId} value={l.loteId}>
                          {l.lote} · {l.categoria} · {formatNumero(l.cabezas)} cab
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {lineas.map((l, i) => (
                <LineaEntrada
                  key={i}
                  linea={l}
                  categorias={categorias}
                  lotes={lotes}
                  potrero={potrero}
                  onCambiar={(campo, valor) => cambiarLinea(i, campo, valor)}
                  onQuitar={lineas.length > 1 ? () => setLineas((ls) => ls.filter((_, j) => j !== i)) : null}
                />
              ))}
              {lineas.length < 10 && (
                <button type="button" onClick={() => setLineas((ls) => [...ls, lineaVacia(categorias[0]?.id ?? '')])} className="text-sm text-sky-400 hover:underline">
                  + Otra categoría
                </button>
              )}
            </>
          )}
        </section>
      )}

      {tipo && (
        <section className={`${seccion} sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0`}>
          <h2 className="font-semibold sm:col-span-2">3. Datos</h2>
          {tipo.pideCausa && (
            <label className={etiqueta}>
              Causa
              <select value={causaId} onChange={(e) => setCausaId(e.target.value)} className={`${inputClass} mt-1`}>
                <option value="">Elegí la causa…</option>
                {causasDelTipo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} · {c.nombre}
                  </option>
                ))}
              </select>
              {!causasDelTipo.length && <span className="mt-1 block text-xs text-amber-300">No hay causas para {tipo.nombre}: cargalas en Configuración.</span>}
            </label>
          )}
          {(tipo.pideGuia || guia) && (
            <label className={etiqueta}>
              Número de guía
              <input value={guia} onChange={(e) => setGuia(e.target.value)} maxLength={30} className={`${inputClass} mt-1`} aria-label="Número de guía" />
            </label>
          )}
          {esTraslado && (
            <label className={etiqueta}>
              {sale ? 'Campo de destino' : 'Campo de origen'} (opcional)
              <select value={campoOtroId} onChange={(e) => setCampoOtroId(e.target.value)} className={`${inputClass} mt-1`}>
                <option value="">Sin indicar (o no está en la app)</option>
                {campos
                  .filter((c) => c.id !== potrero.campoId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.sigla} · {c.nombre}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className={etiqueta}>
            Fecha
            <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <label className={`${etiqueta} sm:col-span-2`}>
            Comentario (opcional)
            <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={255} className={`${inputClass} mt-1`} aria-label="Comentario" />
          </label>
        </section>
      )}

      {problema && <p className="mt-4 rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-200">{problema}</p>}
      {previa && <ComoQueda previa={previa} />}

      {tipo && (
        <button type="button" disabled={!previa || ocupado} onClick={confirmar} className={`${buttonClass} mt-6`}>
          {ocupado ? 'Registrando…' : `Confirmar ${tipo.nombre.toLowerCase()}`}
        </button>
      )}
    </main>
  );
}

function LineaEntrada({ linea: l, categorias, lotes, potrero, onCambiar, onQuitar }) {
  // Se puede sumar a un lote del potrero que sea de esa categoría.
  const mismos = lotes.filter((x) => String(x.categoriaId) === l.categoriaId);
  const categoria = categorias.find((c) => String(c.id) === l.categoriaId);
  return (
    <div className="space-y-2 rounded-md bg-zinc-900 p-3">
      <div className="grid grid-cols-2 gap-2">
        <select
          value={l.categoriaId}
          onChange={(e) => {
            onCambiar('categoriaId', e.target.value);
            onCambiar('destino', 'nuevo');
          }}
          className={inputClass}
          aria-label="Categoría"
        >
          <option value="">Categoría…</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <input
          inputMode="numeric"
          value={l.cabezas}
          onChange={(e) => onCambiar('cabezas', e.target.value.replace(/\D/g, ''))}
          placeholder="Cabezas"
          className={inputClass}
          aria-label={`Cabezas de ${categoria?.nombre ?? 'la categoría'}`}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={l.destino} onChange={(e) => onCambiar('destino', e.target.value)} className={inputClass} aria-label="A qué lote">
          <option value="nuevo">Lote nuevo</option>
          {mismos.map((x) => (
            <option key={x.loteId} value={x.loteId}>
              Sumar a {x.lote}
            </option>
          ))}
        </select>
        <input
          inputMode="decimal"
          value={l.peso}
          onChange={(e) => onCambiar('peso', e.target.value)}
          placeholder="Peso promedio (opcional)"
          className={inputClass}
          aria-label="Peso promedio"
        />
      </div>
      {l.destino === 'nuevo' && (
        <input
          value={l.nombre}
          onChange={(e) => onCambiar('nombre', e.target.value)}
          placeholder={`Nombre del lote (si no, "${potrero.nombre} · ${categoria?.nombre ?? 'categoría'}")`}
          className={inputClass}
          aria-label="Nombre del lote nuevo"
        />
      )}
      {onQuitar && (
        <button type="button" onClick={onQuitar} className="text-xs text-red-300 hover:underline">
          Quitar
        </button>
      )}
    </div>
  );
}

// Cómo queda el potrero: antes → después.
function ComoQueda({ previa: p }) {
  const cambio = (a, d, decimales = 0) => (a === d ? formatNumero(d, decimales) : `${formatNumero(a, decimales)} → ${formatNumero(d, decimales)}`);
  return (
    <section className="mt-6 rounded-lg bg-zinc-800 p-4 text-sm">
      <h2 className="mb-2 font-semibold">Cómo queda {p.potrero}</h2>
      <p>
        Cabezas: <strong>{cambio(p.antes.cabezas, p.despues.cabezas)}</strong>
      </p>
      <p>
        Cab/ha: <strong>{p.despues.cabHa == null ? '—' : cambio(p.antes.cabHa, p.despues.cabHa, 2)}</strong>
      </p>
      <p>
        UG/ha: <strong>{p.despues.ugHa == null ? '—' : cambio(p.antes.ugHa, p.despues.ugHa, 2)}</strong>
      </p>
      <ul className="mt-2 text-zinc-400">
        {p.lineas.map((x) => (
          <li key={x.loteId ?? x.lote}>
            {x.lote}: {formatNumero(x.cabezas)} {x.categoria}
            {x.pesoPromedioKg ? ` · ${formatNumero(x.pesoPromedioKg, 1)} kg` : ''}
          </li>
        ))}
        {!p.lineas.length && <li>Queda vacío.</li>}
      </ul>
    </section>
  );
}
