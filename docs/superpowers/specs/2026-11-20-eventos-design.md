# Eventos: el botón "Eventos" y el camino de 4 pasos (diseño)

Aprobado por Diego el 20/11/2026 ("dale, hacelo así"), después de ver el orden y los bocetos en la conversación.

## Por qué

- Hoy el "+" registra lo que **cambia el stock**: mover, entre campos, múltiple, entradas, salidas y cambio de categoría.
- De los 27 tipos del catálogo (`server/src/seed/pecuaria.catalog.js`), faltan los **12 eventos que no cambian cuántos animales hay**, más el **destete**:

| Grupo | Eventos |
|---|---|
| Peso | Pesada |
| Control | Recuento, Alimentación |
| Sanidad | Vacuna aftosa, Vacuna carbunclo, Otros tratamientos |
| Reproducción (hembras) | Ecografía, Inseminación, Entore, Aborto |
| Manejo | Castración, Caravaneo o señalada |

- **La pesada** además completa el feedlot: reemplaza el peso estimado por el real y da la ganancia diaria real (ver "Lo que falta del feedlot" en la conversación del 20/11).
- **Objetivo:** que la app sea muy intuitiva para un capataz con el celular en la mano.

## Las tres reglas

1. **Un botón según qué querés hacer:**
   - **"+" = mover:** cambia dónde están o cuántos son.
   - **"Eventos" = anotar:** les hiciste algo y siguen donde estaban.
2. **Lo más usado, arriba y grande;** lo raro, abajo y más chico.
3. **El mismo camino de 4 pasos para todo:** qué → a quién → datos → revisar y confirmar.

## Barra de abajo (celular)

```
 Resumen   Potreros    [ + ]    Movim.   Eventos
```

- **"Eventos" reemplaza a "Menú".** El menú sigue en el ☰ de arriba, que ya hace lo mismo.
- **En la compu,** "Eventos" va al lado del "+" en la barra de arriba.
- **Permiso:** registrar eventos pide `pecuaria:CREAR`, igual que el "+".

## El "+" (mover), ordenado

```
MOVER
[⇄ Mover de potrero]     ← grande
[🏷 Cambio de categoría]
[🍼 Destete]             ← nuevo
[⇆ Mover entre campos]
[☰ Movimiento múltiple]

ENTRA                SALE
Nacimiento           Venta
Compra               Muerte
Traslado             Traslado
                     Consumo
                     Pérdida
```

## La hoja "Eventos"

```
[⚖ Pesada]   [# Recuento]     ← grandes

SANIDAD
Vacuna aftosa · Carbunclo · Otro tratamiento

REPRODUCCIÓN (hembras)
Ecografía · Inseminación · Entore · Aborto

MANEJO
Castración · Caravaneo · Alimentación
```

- **Los tipos y sus nombres salen del catálogo** (`TipoMovimiento` con efecto REGISTRO). Si un tipo se desactiva en Configuración, no aparece.
- **El grupo de cada tipo se define en el código**, con un mapa clave → grupo. Un tipo nuevo creado en Configuración va a "Otros".

## El camino de 4 pasos

### 1. Qué
- El tipo elegido en la hoja.

### 2. A quién
- **Arranca donde estás:** si se abre desde la ficha de un potrero o de un lote, ya viene elegido.
- **Buscador** por potrero, lote o categoría ("8.1", "terneros"). Arriba, los usados hace poco (en el celular, con `localStorage` y protegido con try/catch).
- **Respeta los niveles del tipo** (`TipoMovimiento.niveles`): campo, potrero, categoría, lote o parte de un lote.
  - **Varios a la vez:** varios lotes, un potrero entero (todos sus lotes) o, si el tipo lo permite, la estancia entera (por ejemplo, la vacuna).
  - **Parte de un lote:** pide las cabezas.
- **Respeta el sexo del tipo:** un tipo de hembras no ofrece lotes de machos. Se usa el sexo de la categoría, que ya existe.

### 3. Datos
Mínimos, y con valores sugeridos:

| Evento | Datos |
|---|---|
| Todos | Fecha (hoy, no futura; la regla de fecha del stock aplica a lo que lo cambia) y nota opcional |
| **Pesada** | Peso promedio por lote (sugiere el actual o el estimado) y cuántas se pesaron (por defecto todas) |
| **Recuento** | Cabezas contadas por lote (sugiere las que tiene la app). Si hay diferencia, motivo obligatorio |
| Ecografía | Preñadas y vacías (la suma, como máximo las cabezas del lote) |
| Vacunas y tratamientos | Producto o detalle, opcional |
| Inseminación, entore, aborto, castración, caravaneo | Cabezas (por defecto, las del lote) |
| Alimentación | Ración o detalle y kg por cabeza por día, opcionales |

### 4. Revisar y confirmar
- Vista previa en una oración: "Vas a anotar Vacuna aftosa en 3 lotes, 412 cabezas, el 20/11/2026".
- Si cambia números (pesada y recuento): el antes y el después del lote.
- Después de guardar: **"Hacer otro igual"** (mismo tipo y fecha, sin elegir a quién) o "Listo".

## Qué cambia en los datos

- **Un evento no es un movimiento.** Va en una tabla nueva, `evento_registro`, con:
  - el tipo, la fecha, la estancia, el potrero, el lote y la categoría (los tres últimos opcionales, según el nivel);
  - las cabezas;
  - los datos propios del tipo (JSON validado con zod según la clave);
  - la nota, el usuario y la fecha de carga;
  - un `grupoId` para lo que se cargó junto (campaña);
  - si está anulado.
- **Pesada:**
  - Además del registro, crea una **versión de stock** del potrero con el peso nuevo del lote. Las cabezas no cambian.
  - Si es un corral de feedlot, el análisis usa la última pesada en vez del peso estimado: desde la pesada, peso + días × GMD, y la ganancia diaria real entre la entrada (o la pesada anterior) y esta.
- **Recuento:**
  - Sin diferencia: solo el registro.
  - Con diferencia: crea una versión de stock con las cabezas contadas, como la corrección de stock que ya existe, con el motivo. El historial dice "Recuento: había 120, se contaron 116 (motivo)".
- **Anular:**
  - Un evento sin efecto en el stock se anula (queda tachado en el historial).
  - Una pesada o un recuento con diferencia se anula solo si después no hubo otro cambio en ese potrero, igual que revertir un movimiento.
  - Todo queda en la auditoría.
- **Destete** (en el "+"): mueve el lote de terneros, o una parte, del potrero de las madres a otro potrero, y deja anotado el lote de las madres (`lote_madres_id`, que ya existe). Puede cambiar la categoría al llegar ("Terneros chicos" → "Terneros"). Usa el mover que ya existe; solo cambia el tipo y lo que se pide.
- **Dónde se ven:**
  - en el historial de cada lote y de cada potrero;
  - en la pestaña Movimientos, con un filtro **"Todo / Movimientos / Eventos"** (por defecto, Movimientos, para no cambiar lo de hoy).

## Para que sea intuitivo

- Botones de 44 px como mínimo, textos cortos y voseo.
- Nunca más de una pantalla por paso en el celular.
- Siempre se puede volver al paso anterior sin perder lo cargado.

## Orden de construcción (cada paso con tests)

1. La barra nueva con el botón "Eventos", la hoja "Eventos" y el camino de 4 pasos. El "+" reordenado.
2. **Pesada y Recuento**, con el efecto en el stock y en el feedlot.
3. **Sanidad**, con varios lotes, un potrero o una estancia a la vez.
4. **Reproducción y manejo.**
5. **Destete** en el "+".

## Fuera de esto

- El bastón dentro del evento (`docs/LOGISTICA_MOVIMIENTOS.md` §5).
- Trabajar sin señal.
- Avisos por evento (por ejemplo, "vacuna vencida").
