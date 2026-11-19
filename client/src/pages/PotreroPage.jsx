import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  cambiarUso,
  editarPotrero,
  getCategorias,
  getHistorial,
  getPotrero,
  getUsosSuelo,
  guardarStock,
  renombrarLote,
} from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList, Notice, buttonClass, inputClass } from '../components/ui';
import { Dato, Hectareas, UsoBadge, formatFecha, formatNumero } from '../components/pecuaria';
import usePuede from '../hooks/usePuede';

const hoy = () => new Date().toLocaleDateString('sv-SE');
// Acepta "250" o "250,5" (como se escribe acá).
const aNumero = (texto) => (String(texto).trim() === '' ? null : Number(String(texto).replace(',', '.')));
const ORIGEN = { PLANILLA: 'Planilla', MANUAL: 'A mano', MOVIMIENTO: 'Movimiento' };
const botonSecundario =
  'rounded-md border border-suelo-300 px-3 py-2 text-sm font-medium text-suelo-800 hover:border-campo-500 hover:text-suelo-900';

// Detalle de un potrero: stock por categoría con los cálculos, y los cambios
// (stock, uso de suelo, hectáreas). Cada cambio queda en el historial.
export default function PotreroPage() {
  const puedo = usePuede();
  const { id } = useParams();
  const location = useLocation();
  const [potrero, setPotrero] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [modo, setModo] = useState(null); // 'stock' | 'uso' | 'hectareas'
  const [errors, setErrors] = useState([]);
  const [aviso, setAviso] = useState(location.state?.aviso ? { texto: location.state.aviso, tono: 'ok' } : null);

  const cargar = useCallback(async () => {
    const [p, h] = await Promise.all([getPotrero(id), getHistorial(id)]);
    setPotrero(p.data);
    setHistorial(h.data);
  }, [id]);

  useEffect(() => {
    cargar().catch((error) => setErrors(getErrorMessages(error, 'No se pudo cargar el potrero')));
  }, [cargar]);

  // Guarda, recarga y muestra el aviso. Devuelve true si salió bien.
  async function guardar(accion, okMensaje) {
    try {
      const mensaje = await accion();
      setErrors([]);
      setAviso({ texto: mensaje || okMensaje, tono: mensaje ? 'info' : 'ok' });
      setModo(null);
      await cargar();
    } catch (error) {
      setErrors(getErrorMessages(error, 'No se pudo guardar'));
    }
  }

  if (!potrero) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <ErrorList errors={errors} />
        {!errors.length && <p className="text-suelo-600">Cargando…</p>}
      </main>
    );
  }

  const { stock } = potrero;
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <Link to="/pecuaria/potreros" className="text-sm text-campo-600 hover:underline">
        ← Potreros
      </Link>
      <h1 className="mt-2 text-3xl font-bold">
        {potrero.nombre}
        {potrero.tipo === 'CORRAL' && <span className="ml-2 align-middle text-sm font-medium text-amber-800">corral</span>}
      </h1>
      <p className="text-sm text-suelo-600">{potrero.campo.nombre}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <UsoBadge uso={potrero.usoActual} />
        {potrero.usoActual && <span className="text-xs text-suelo-500">desde {formatFecha(potrero.usoActual.desde)}</span>}
        <Hectareas hectareas={potrero.hectareas} aConfirmar={potrero.hectareasAConfirmar} />
        {potrero.subdivisiones.length > 0 && (
          <span className="text-xs text-suelo-500">{potrero.subdivisiones.map((s) => s.codigo).join(' · ')}</span>
        )}
      </div>

      <div className="mt-4">
        <ErrorList errors={errors} />
        <Notice tone={aviso?.tono}>{aviso?.texto}</Notice>
      </div>

      <section className="mt-2 rounded-lg border border-suelo-200 p-4">
        <p className="mb-3 text-sm text-suelo-600">
          {stock
            ? `Stock al ${formatFecha(stock.fecha)} · ${ORIGEN[stock.origen]}${stock.usuario ? ` (${stock.usuario})` : ''}`
            : 'Sin datos de stock todavía'}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato valor={formatNumero(stock?.cabezas ?? 0)} etiqueta="cabezas" />
          <Dato valor={formatNumero(stock?.cabHa, 2)} etiqueta="cab./ha" />
          <Dato valor={formatNumero(stock?.kgPvHa, 1)} etiqueta="kg PV/ha" />
          <Dato valor={formatNumero(stock?.ugHa, 2)} etiqueta={`UG/ha (1 UG = ${formatNumero(potrero.kgPorUg)} kg)`} />
        </div>
        {potrero.hectareasAConfirmar && (
          <p className="mt-3 text-sm text-amber-800">Sin hectáreas confirmadas: no se calculan los valores por hectárea.</p>
        )}
        {stock && !stock.kilosCompletos && (
          <p className="mt-3 text-sm text-amber-800">Hay categorías sin peso promedio: los kilos y las UG están incompletos.</p>
        )}
        {stock?.lineas.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {stock.lineas.map((l) => (
              <LoteFila
                key={l.loteId}
                linea={l}
                potreroId={potrero.id}
                puedeRegistrar={puedo('pecuaria:CREAR')}
                onRenombrar={(nombre) => guardar(() => renombrarLote(l.loteId, nombre).then(() => null), 'Lote renombrado.')}
              />
            ))}
          </ul>
        )}
        {stock?.nota && <p className="mt-3 text-sm text-suelo-600">Nota: {stock.nota}</p>}
        {/* Mover, entradas y salidas se registran desde el botón "+" (DECISIONES §11). */}
      </section>

      {!modo && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {puedo('pecuaria:CREAR') && (
            <button type="button" onClick={() => setModo('stock')} className={buttonClass}>
              Editar stock
            </button>
          )}
          {puedo('pecuaria:CREAR') && (
            <button type="button" onClick={() => setModo('uso')} className={botonSecundario}>
              Cambiar uso de suelo
            </button>
          )}
          {/* Las hectáreas son datos del potrero: Configuración. */}
          {puedo('pecuaria:EDITAR') && (
            <button type="button" onClick={() => setModo('hectareas')} className={botonSecundario}>
              {potrero.hectareasAConfirmar ? 'Cargar hectáreas' : 'Corregir hectáreas'}
            </button>
          )}
        </div>
      )}

      {modo === 'stock' && (
        <EditarStock
          potrero={potrero}
          onCancelar={() => setModo(null)}
          onGuardar={(datos) =>
            guardar(async () => (await guardarStock(potrero.id, datos)).data.aviso, 'Stock guardado. La versión anterior queda en el historial.')
          }
        />
      )}
      {modo === 'uso' && (
        <CambiarUso
          potrero={potrero}
          onCancelar={() => setModo(null)}
          onGuardar={(datos) => guardar(() => cambiarUso(potrero.id, datos).then(() => null), 'Uso de suelo cambiado.')}
        />
      )}
      {modo === 'hectareas' && (
        <CorregirHectareas
          potrero={potrero}
          onCancelar={() => setModo(null)}
          onGuardar={(hectareas) =>
            guardar(
              () => editarPotrero(potrero.id, { hectareas, hectareasAConfirmar: false }).then(() => null),
              'Hectáreas guardadas.',
            )
          }
        />
      )}

      {historial && <Historial historial={historial} />}
    </main>
  );
}

function Formulario({ titulo, children, onCancelar, onEnviar, ocupado, puedeGuardar = true }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onEnviar();
      }}
      className="mt-4 space-y-4 rounded-lg border border-campo-200 bg-suelo-50 p-4"
    >
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {children}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onCancelar} className={botonSecundario}>
          Cancelar
        </button>
        <button type="submit" disabled={ocupado || !puedeGuardar} className={buttonClass}>
          {ocupado ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

function useEnvio(onGuardar) {
  const [ocupado, setOcupado] = useState(false);
  return [
    ocupado,
    async (datos) => {
      setOcupado(true);
      try {
        await onGuardar(datos);
      } finally {
        setOcupado(false);
      }
    },
  ];
}

function EditarStock({ potrero, onGuardar, onCancelar }) {
  const [categorias, setCategorias] = useState([]);
  const [filas, setFilas] = useState(() =>
    (potrero.stock?.lineas ?? []).map((l) => ({
      loteId: l.loteId,
      lote: l.lote,
      categoriaId: String(l.categoriaId),
      cabezas: String(l.cabezas),
      peso: l.pesoPromedioKg == null ? '' : String(l.pesoPromedioKg),
    })),
  );
  const [fecha, setFecha] = useState(hoy());
  const [nota, setNota] = useState('');
  const [ocupado, enviar] = useEnvio(onGuardar);

  useEffect(() => {
    getCategorias().then(({ data }) => setCategorias(data.filter((c) => c.activo)));
  }, []);

  const cambiar = (i, campo, valor) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  const total = filas.reduce((s, f) => s + (Number.parseInt(f.cabezas, 10) || 0), 0);
  const completas = filas.every((f) => f.categoriaId && f.cabezas !== '');

  return (
    <Formulario
      titulo="Editar stock"
      onCancelar={onCancelar}
      ocupado={ocupado}
      puedeGuardar={completas && fecha}
      onEnviar={() =>
        enviar({
          fecha,
          nota,
          lineas: filas.map((f) => ({
            ...(f.loteId ? { loteId: f.loteId } : { nombreLote: f.lote }),
            categoriaId: Number(f.categoriaId),
            cabezas: Number.parseInt(f.cabezas, 10),
            pesoPromedioKg: aNumero(f.peso),
          })),
        })
      }
    >
      <p className="text-sm text-suelo-600">
        Se guarda como una versión nueva; la anterior queda en el historial. Para pasar animales a otro lote o a otro
        potrero, usá el botón + → Mover entre potreros.
      </p>
      <div className="space-y-3">
        {filas.map((f, i) => (
          <div key={f.loteId ?? `nuevo-${i}`} className="space-y-2 rounded-md bg-white p-3">
            {f.loteId ? (
              <p className="text-sm font-semibold">{f.lote}</p>
            ) : (
              <input
                value={f.lote}
                onChange={(e) => cambiar(i, 'lote', e.target.value)}
                placeholder="Nombre del lote nuevo (opcional)"
                aria-label="Nombre del lote nuevo"
                className={inputClass}
              />
            )}
            <select
              value={f.categoriaId}
              onChange={(e) => cambiar(i, 'categoriaId', e.target.value)}
              className={inputClass}
              aria-label="Categoría"
            >
              <option value="">Elegí la categoría…</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <label className="text-xs text-suelo-600">
                Cabezas
                <input
                  inputMode="numeric"
                  value={f.cabezas}
                  onChange={(e) => cambiar(i, 'cabezas', e.target.value.replace(/\D/g, ''))}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="text-xs text-suelo-600">
                Peso prom. (kg)
                <input inputMode="decimal" value={f.peso} onChange={(e) => cambiar(i, 'peso', e.target.value)} className={`${inputClass} mt-1`} />
              </label>
              <button
                type="button"
                onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}
                className="rounded-md px-3 py-2 text-suelo-600 hover:text-red-700"
                aria-label="Quitar lote"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setFilas((fs) => [...fs, { loteId: null, lote: '', categoriaId: '', cabezas: '', peso: '' }])}
        className="text-sm text-campo-600 hover:underline"
      >
        + Agregar lote
      </button>
      <p className="text-sm">
        Total: <strong>{formatNumero(total)}</strong> cabezas
        {potrero.stock && total !== potrero.stock.cabezas && (
          <span className="text-suelo-600"> (antes {formatNumero(potrero.stock.cabezas)})</span>
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-suelo-600">
          Fecha del dato
          <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-sm text-suelo-600">
          Nota (opcional)
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={255} className={`${inputClass} mt-1`} />
        </label>
      </div>
    </Formulario>
  );
}

function CambiarUso({ potrero, onGuardar, onCancelar }) {
  const [usos, setUsos] = useState([]);
  const [usoSueloId, setUsoSueloId] = useState('');
  const [desde, setDesde] = useState(hoy());
  const [ocupado, enviar] = useEnvio(onGuardar);

  useEffect(() => {
    getUsosSuelo().then(({ data }) => setUsos(data.filter((u) => u.activo && u.id !== potrero.usoActual?.id)));
  }, [potrero.usoActual?.id]);

  return (
    <Formulario
      titulo="Cambiar uso de suelo"
      onCancelar={onCancelar}
      ocupado={ocupado}
      puedeGuardar={usoSueloId && desde}
      onEnviar={() => enviar({ usoSueloId: Number(usoSueloId), desde })}
    >
      <p className="text-sm text-suelo-600">
        El uso actual ({potrero.usoActual?.nombre ?? 'ninguno'}) se cierra en la fecha que elijas y queda en el historial.
      </p>
      <select value={usoSueloId} onChange={(e) => setUsoSueloId(e.target.value)} className={inputClass} aria-label="Uso de suelo">
        <option value="">Elegí el uso nuevo…</option>
        {usos.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre}
          </option>
        ))}
      </select>
      <label className="block text-sm text-suelo-600">
        Desde
        <input
          type="date"
          value={desde}
          min={potrero.usoActual?.desde}
          max={hoy()}
          onChange={(e) => setDesde(e.target.value)}
          className={`${inputClass} mt-1`}
        />
      </label>
    </Formulario>
  );
}

function CorregirHectareas({ potrero, onGuardar, onCancelar }) {
  const [valor, setValor] = useState(potrero.hectareasAConfirmar || potrero.hectareas == null ? '' : String(potrero.hectareas));
  const [ocupado, enviar] = useEnvio(onGuardar);
  const numero = aNumero(valor);
  return (
    <Formulario
      titulo={potrero.hectareasAConfirmar ? 'Cargar hectáreas' : 'Corregir hectáreas'}
      onCancelar={onCancelar}
      ocupado={ocupado}
      puedeGuardar={numero > 0}
      onEnviar={() => enviar(numero)}
    >
      <input
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="Hectáreas (por ejemplo 85,5)"
        aria-label="Hectáreas"
        className={inputClass}
      />
      {potrero.hectareasAConfirmar && (
        <p className="text-sm text-suelo-600">Al guardar, el potrero deja de estar "a confirmar" y se calculan los valores por hectárea.</p>
      )}
    </Formulario>
  );
}

function Historial({ historial }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">Historial</h2>
      <ul className="space-y-2">
        {historial.versiones.map((v) => (
          <li key={v.id} className="rounded-md bg-suelo-50 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <strong>{formatFecha(v.fecha)}</strong> · {ORIGEN[v.origen]}
                {v.usuario && <span className="text-suelo-600"> · {v.usuario}</span>}
              </span>
              <span className="font-semibold">{formatNumero(v.cabezas)} cab</span>
            </div>
            <p className="mt-1 text-suelo-600">
              {v.lineas.length ? v.lineas.map((l) => `${l.lote}: ${formatNumero(l.cabezas)}`).join(' · ') : 'Vacío'}
              {v.importacion && ` · ${v.importacion.archivo} (${v.importacion.hoja})`}
            </p>
            {v.movimiento && <p className="mt-1 text-campo-700">{v.movimiento}</p>}
            {v.nota && <p className="text-suelo-600">Nota: {v.nota}</p>}
          </li>
        ))}
      </ul>
      {historial.usos.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-sm font-semibold text-suelo-700">Usos de suelo</h3>
          <ul className="space-y-1 text-sm">
            {historial.usos.map((u, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <UsoBadge uso={u.uso} />
                <span className="text-suelo-600">
                  desde {formatFecha(u.desde)}
                  {u.hasta ? ` hasta ${formatFecha(u.hasta)}` : ' (vigente)'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// Un lote del potrero: nombre (se cambia tocándolo), categoría, cabezas, peso,
// y el botón para moverlo (todo o una parte) a otro lote o potrero.
function LoteFila({ linea: l, potreroId, puedeRegistrar, onRenombrar }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(l.lote);
  return (
    <li className="rounded-md bg-suelo-50 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {editando ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onRenombrar(nombre.trim());
                setEditando(false);
              }}
            >
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del lote" className={`${inputClass} py-1`} />
              <button type="submit" disabled={!nombre.trim()} className="text-sm text-campo-600">
                Guardar
              </button>
            </form>
          ) : puedeRegistrar ? (
            <button type="button" onClick={() => setEditando(true)} className="text-left font-semibold hover:underline" title="Cambiar el nombre">
              {l.lote}
            </button>
          ) : (
            <p className="font-semibold">{l.lote}</p>
          )}
          <p className="text-suelo-600">
            {l.categoria} · {formatNumero(l.cabezas)} cab ·{' '}
            {l.pesoPromedioKg ? `${formatNumero(l.pesoPromedioKg)} kg` : <span className="text-amber-800">sin peso</span>}
          </p>
          <Link to={`/pecuaria/lotes/${l.loteId}`} className="text-xs text-campo-600 hover:underline">
            Ver historial del lote
          </Link>
        </div>
      </div>
    </li>
  );
}
