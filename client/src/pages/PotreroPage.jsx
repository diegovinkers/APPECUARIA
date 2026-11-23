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
  registrarMovimiento,
  renombrarLote,
} from '../api/pecuaria';
import { getErrorMessages } from '../api/axios';
import { ErrorList, Notice, buttonClass, inputClass } from '../components/ui';
import { Dato, EnProceso, Hectareas, UsoBadge, aprox, familiasJuntas, formatFecha, formatNumero, formatUsd } from '../components/pecuaria';
import usePuede from '../hooks/usePuede';
import { EventoItem } from '../components/movimientos';
import BotonEventos from '../components/BotonEventos';

const hoy = () => new Date().toLocaleDateString('sv-SE');
// Acepta "250" o "250,5" (como se escribe acá).
const aNumero = (texto) => (String(texto).trim() === '' ? null : Number(String(texto).replace(',', '.')));
const ORIGEN = { PLANILLA: 'Planilla', MANUAL: 'A mano', MOVIMIENTO: 'Movimiento', EVENTO: 'Evento' };
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

  // Unir las partes de un mismo lote que quedaron juntas: cada una se suma a
  // la que se queda (un "sumar a otro lote" en el mismo potrero).
  async function unir({ queda, suman }) {
    const nombres = suman.map((l) => l.lote).join(', ');
    if (!window.confirm(`¿Unir ${nombres} en ${queda.lote}? Queda registrado como movimiento.`)) return;
    await guardar(async () => {
      for (const l of suman) {
        await registrarMovimiento({ loteOrigenId: l.loteId, cabezas: l.cabezas, destinoPotreroId: potrero.id, modo: 'SUMAR', loteDestinoId: queda.loteId, fecha: hoy() });
      }
      return null;
    }, `Unidas: ${nombres} ahora es parte de ${queda.lote}.`);
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
  // Un corral (feedlot) no se mide por hectárea: tiene metros de comedero.
  const esCorral = potrero.tipo === 'CORRAL';
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
      <EnProceso procesos={potrero.procesos} />
      <BotonEventos contexto={{ potrero: potrero.id }} className="mt-3" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!esCorral && <UsoBadge uso={potrero.usoActual} />}
        {!esCorral && potrero.usoActual && <span className="text-xs text-suelo-500">desde {formatFecha(potrero.usoActual.desde)}</span>}
        {esCorral ? (
          <span className="text-sm text-suelo-600" data-testid="metros-comedero">
            {potrero.metrosComedero == null ? 'Sin metros de comedero' : `${formatNumero(potrero.metrosComedero, 2)} m de comedero`}
            {potrero.metrosComedero != null && stock?.cabezas > 0 && ` · ${formatNumero(potrero.metrosComedero / stock.cabezas, 2)} m por cabeza`}
          </span>
        ) : (
          <Hectareas hectareas={potrero.hectareas} aConfirmar={potrero.hectareasAConfirmar} />
        )}
        {potrero.areaUtilizable != null && (
          <span className="text-sm text-suelo-600" data-testid="area-utilizable">
            · {formatNumero(potrero.areaUtilizable, 2)} ha utilizables
          </span>
        )}
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
          <Dato valor={aprox(stock?.kilosEstimados, formatNumero(stock?.kgPvHa, 1))} etiqueta="kg PV/ha" />
          <Dato valor={aprox(stock?.kilosEstimados, formatNumero(stock?.ugHa, 2))} etiqueta={`UG/ha (1 UG = ${formatNumero(potrero.kgPorUg)} kg)`} />
        </div>
        {stock?.valorUsd > 0 && (
          <p className="mt-3 text-sm" data-testid="valor-potrero">
            Valor del ganado: <strong>{aprox(stock.kilosEstimados, formatUsd(stock.valorUsd))}</strong>
            {!stock.valorCompleto && <span className="text-amber-800"> (incompleto: hay categorías sin precio)</span>}
          </p>
        )}
        {stock?.kilosEstimados && (
          <p className="mt-3 text-sm text-suelo-600">≈ Algunos lotes no tienen peso: se usa el peso promedio de su categoría (Configuración).</p>
        )}
        {potrero.hectareasAConfirmar && !esCorral && (
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
                esCorral={esCorral}
                puedeRegistrar={puedo('pecuaria:CREAR')}
                onRenombrar={(nombre) => guardar(() => renombrarLote(l.loteId, nombre).then(() => null), 'Lote renombrado.')}
              />
            ))}
          </ul>
        )}
        {puedo('pecuaria:CREAR') &&
          familiasJuntas(stock?.lineas).map((g) => (
            <div key={g.queda.loteId} className="mt-3 rounded-md border border-campo-300 bg-campo-50 p-3 text-sm">
              <p>
                <strong>{[g.queda, ...g.suman].map((l) => l.lote).join(' y ')}</strong> son del mismo lote y están juntas acá.
              </p>
              <button type="button" onClick={() => unir(g)} className="mt-2 rounded-md bg-campo-600 px-3 py-1.5 font-medium text-white hover:bg-campo-700">
                Unirlas en {g.queda.lote}
              </button>
            </div>
          ))}
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
          {puedo('pecuaria:CREAR') && !esCorral && (
            <button type="button" onClick={() => setModo('uso')} className={botonSecundario}>
              Cambiar uso de suelo
            </button>
          )}
          {/* Los metros de comedero, como las hectáreas, son datos del potrero: Configuración. */}
          {puedo('pecuaria:EDITAR') && esCorral && (
            <button type="button" onClick={() => setModo('comedero')} className={botonSecundario}>
              {potrero.metrosComedero == null ? 'Cargar metros de comedero' : 'Corregir metros de comedero'}
            </button>
          )}
          {/* Las hectáreas son datos del potrero: Configuración. */}
          {puedo('pecuaria:EDITAR') && !esCorral && (
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
          onGuardar={({ hectareas, areaUtilizable }) =>
            guardar(
              () => editarPotrero(potrero.id, { hectareas, hectareasAConfirmar: false, areaUtilizable }).then(() => null),
              'Hectáreas guardadas.',
            )
          }
        />
      )}

      {modo === 'comedero' && (
        <CorregirComedero
          potrero={potrero}
          onCancelar={() => setModo(null)}
          onGuardar={(metrosComedero) =>
            guardar(() => editarPotrero(potrero.id, { metrosComedero }).then(() => null), 'Metros de comedero guardados.')
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

// Área utilizable que se manda: vacía o igual a las hectáreas = todas (null).
const areaParaGuardar = (texto, hectareas) => {
  const area = aNumero(texto);
  return area == null || area === hectareas ? null : area;
};

function CambiarUso({ potrero, onGuardar, onCancelar }) {
  const [usos, setUsos] = useState([]);
  const [usoSueloId, setUsoSueloId] = useState('');
  const [desde, setDesde] = useState(hoy());
  // Un uso nuevo arranca con todas las hectáreas (se puede bajar).
  const [area, setArea] = useState(potrero.hectareasAConfirmar || potrero.hectareas == null ? '' : String(potrero.hectareas));
  const [ocupado, enviar] = useEnvio(onGuardar);
  const areaNum = aNumero(area);
  const areaMal = areaNum != null && (!(areaNum > 0) || (!potrero.hectareasAConfirmar && potrero.hectareas != null && areaNum > potrero.hectareas));

  useEffect(() => {
    getUsosSuelo().then(({ data }) => setUsos(data.filter((u) => u.activo && u.id !== potrero.usoActual?.id)));
  }, [potrero.usoActual?.id]);

  return (
    <Formulario
      titulo="Cambiar uso de suelo"
      onCancelar={onCancelar}
      ocupado={ocupado}
      puedeGuardar={usoSueloId && desde && !areaMal}
      onEnviar={() => enviar({ usoSueloId: Number(usoSueloId), desde, areaUtilizable: areaParaGuardar(area, potrero.hectareas) })}
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
      <CampoArea valor={area} onChange={setArea} potrero={potrero} mal={areaMal} etiqueta="Área utilizable para este uso (ha)" />
    </Formulario>
  );
}

// El área utilizable: lo que ocupa de verdad el uso de suelo. La carga por
// hectárea se calcula sobre ella; vacía = todas las hectáreas.
function CampoArea({ valor, onChange, potrero, mal, etiqueta = 'Área utilizable (ha)' }) {
  return (
    <label className="block text-sm text-suelo-600">
      {etiqueta}
      <input
        inputMode="decimal"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Vacía = todas las hectáreas"
        aria-label="Área utilizable"
        className={`${inputClass} mt-1`}
      />
      <span className="mt-1 block text-xs text-suelo-500">
        {mal
          ? <span className="text-red-700">Tiene que ser mayor que cero y no más que las hectáreas ({formatNumero(potrero.hectareas, 2)}).</span>
          : 'La carga (cab/ha, UG/ha) se calcula sobre esta área.'}
      </span>
    </label>
  );
}

function CorregirHectareas({ potrero, onGuardar, onCancelar }) {
  const [valor, setValor] = useState(potrero.hectareasAConfirmar || potrero.hectareas == null ? '' : String(potrero.hectareas));
  const [area, setArea] = useState(potrero.areaUtilizable == null ? '' : String(potrero.areaUtilizable));
  const [ocupado, enviar] = useEnvio(onGuardar);
  const numero = aNumero(valor);
  const areaNum = aNumero(area);
  const areaMal = areaNum != null && (!(areaNum > 0) || (numero > 0 && areaNum > numero));
  return (
    <Formulario
      titulo={potrero.hectareasAConfirmar ? 'Cargar hectáreas' : 'Corregir hectáreas'}
      onCancelar={onCancelar}
      ocupado={ocupado}
      puedeGuardar={numero > 0 && !areaMal}
      onEnviar={() => enviar({ hectareas: numero, areaUtilizable: areaParaGuardar(area, numero) })}
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
      <CampoArea valor={area} onChange={setArea} potrero={{ ...potrero, hectareas: numero }} mal={areaMal} />
    </Formulario>
  );
}

// Los metros de comedero de un corral (feedlot). Vacío = sin dato.
function CorregirComedero({ potrero, onGuardar, onCancelar }) {
  const [valor, setValor] = useState(potrero.metrosComedero == null ? '' : String(potrero.metrosComedero));
  const [ocupado, enviar] = useEnvio(onGuardar);
  const numero = aNumero(valor);
  return (
    <Formulario
      titulo="Metros de comedero"
      onCancelar={onCancelar}
      ocupado={ocupado}
      puedeGuardar={numero == null || numero > 0}
      onEnviar={() => enviar(numero)}
    >
      <input
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="Metros (por ejemplo 40)"
        aria-label="Metros de comedero"
        className={inputClass}
      />
      <p className="text-sm text-suelo-600">Con los metros se calcula cuánto comedero tiene cada cabeza (en el Resumen del feedlot).</p>
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
            {v.evento && <p className="mt-1 text-sky-800">{v.evento}</p>}
            {v.nota && <p className="text-suelo-600">Nota: {v.nota}</p>}
          </li>
        ))}
      </ul>
      {historial.eventos?.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-sm font-semibold text-suelo-700">Eventos (pesadas, vacunas…)</h3>
          <ul className="space-y-2" data-testid="eventos-potrero">
            {historial.eventos.map((e) => (
              <EventoItem key={e.id} e={e} conPotrero />
            ))}
          </ul>
        </>
      )}
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
function LoteFila({ linea: l, esCorral, puedeRegistrar, onRenombrar }) {
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
            {l.pesoPromedioKg ? (
              `${formatNumero(l.pesoPromedioKg)} kg`
            ) : l.pesoEstimadoKg ? (
              <span title="Peso promedio de la categoría">≈{formatNumero(l.pesoEstimadoKg)} kg</span>
            ) : (
              <span className="text-amber-800">sin peso</span>
            )}
          </p>
          {esCorral && (
            <p className="text-xs text-suelo-600" data-testid="entrada-corral">
              {l.fechaEntrada ? `Entró el ${formatFecha(l.fechaEntrada)}` : 'Sin fecha de entrada'}
              {l.pesoEntradaKg != null && ` con ${formatNumero(l.pesoEntradaKg)} kg`}
            </p>
          )}
          <Link to={`/pecuaria/lotes/${l.loteId}`} className="text-xs text-campo-600 hover:underline">
            {esCorral ? 'Ver el lote (y su entrada al corral)' : 'Ver historial del lote'}
          </Link>
        </div>
      </div>
    </li>
  );
}
