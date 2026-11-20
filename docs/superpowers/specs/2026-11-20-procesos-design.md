# Procesos: el ciclo reproductivo como una cadena (diseño)

Fase 1 del encargo `docs/superpowers/prompts/2026-11-20-procesos.md`. **Esperando el OK de Diego** (20/11/2026). Todavía no hay código.

## 1. Por qué

- El nacimiento de un ternero es el final de una cadena que lleva **más de un año**: servicio → diagnóstico → parición → destete. Cada paso cambia el stock (se separan lotes, cambian categorías, entran terneros).
- Hoy la app tiene las piezas sueltas: Entore, Inseminación, Ecografía y Aborto como eventos; Nacimiento como entrada; Destete como mover. Nada las une.
- Diego quiere **registrar la cadena como un proceso**, ver en qué etapa está cada uno, sus eventos en orden y **cuántos animales quedan en cada paso** (50 → 40 preñadas → 38 paridas → 36 destetados).
- **Cada evento es único y pertenece a su proceso.**

**Objetivos**
- Ver todos los procesos en una pestaña **Procesos** del Registro, y cada uno en su ficha con una línea de tiempo.
- Registrar cada etapa desde el proceso, con el camino de pasos que ya conoce el capataz.
- Que el diagnóstico **separe los lotes en un solo camino** (preñadas a un lado, vacías al otro), todo o nada.
- Que los números del embudo **salgan de lo registrado**, nunca cargados a mano.

**Fuera de esta v1** (no-objetivos)
- Otros procesos (recría, ciclo de feedlot, plan sanitario): el modelo los permite, pero **solo se construye el reproductivo**.
- Datos por animal (qué vaca está preñada): llegan con el bastón (`docs/LOGISTICA_MOVIMIENTOS.md` §6).
- Avisos o notificaciones ("se atrasó la ecografía"): por ahora solo se marcan en ámbar en la lista y en la ficha.
- Destete temporario con tablilla, que no separa a los terneros (ver las preguntas).

**Lo que lo haría un fracaso aunque ande**
- Que registrar una etapa le pida al capataz más que hoy. Cada etapa tiene que ser el mismo camino de 4 pasos (5 en el diagnóstico), con todo sugerido.
- Que el stock y el proceso cuenten cosas distintas. El proceso **no lleva su propio stock**: lee los lotes, los eventos y los movimientos de siempre.
- Que un error de carga no se pueda deshacer. Todo se anula como hoy.

## 2. Lo que encontré en el código y cambia el diseño

1. **Un lote tiene una sola categoría.** Si 25 de 40 preñadas parieron y pasan a "paridas", eso es **un lote nuevo** (una parte de la familia), no medio lote con otra categoría. Por eso el diseño usa la familia de lotes (`raiz_id`) para todas las separaciones.
2. **Hoy no se puede crear una parte de la familia en el mismo potrero, ni con otra categoría.** El mover `NUEVO` + `mismoLote` exige otro potrero y conserva la categoría. Hace falta un ajuste chico en `movimientos.service.js`: desde un proceso, la parte puede quedarse en el mismo potrero y cambiar de categoría, sin salir de la familia.
3. **Las entradas y las salidas abren su propia transacción** (`entradas-salidas.service.js`). Para que el diagnóstico y la parición sean "todo o nada" (venta de vacías, nacimientos y cambio de categoría juntos), hay que separar un `aplicarEntrada(tx, …)` y un `aplicarSalida(tx, …)`, como ya existe `aplicar(tx, …)` para mover.
4. **La "Parición en un solo paso" no está hecha:** este encargo la absorbe (§10).
5. **Las categorías de cría que hay hoy:** Vaquillonas 1-2, Vaquillonas 1-2 preñadas, Vaquillonas +2, Vaquillonas +2 preñadas, Vaquillonas paridas, Vacas de cría, Vacas paridas, y las de invernada. **No hay "Vacas preñadas"**: una vaca de cría preñada sigue siendo "Vacas de cría". El diseño no supone categorías fijas: sugiere y deja elegir (§8).
6. **Es buen momento.** El servicio 2026-27 está empezando, y la parición del servicio 2025-26 está en curso. Para que la app sirva ya, hay que poder **arrancar un proceso a mitad de camino** (§14).

## 3. Enfoques que se pensaron

| | Cómo es | A favor | En contra |
|---|---|---|---|
| **A. El proceso como entidad, y sus etapas son los eventos de siempre** ✅ | Tabla `proceso` y `proceso_lote`. Cada etapa deja un **evento "ancla"** en `evento_registro` (con `proceso_id` y `etapa`); los movimientos que provoca cuelgan de ese ancla (`movimiento.proceso_id` y `registro_id`). | Usa lo que ya anda: la lista de eventos y movimientos, los historiales, anular y revertir, la auditoría. La unicidad es un índice en la base. | Dos columnas nuevas en dos tablas grandes; el ancla del destete es un registro de un tipo que mueve (detalle de construcción). |
| B. Tabla de pasos aparte (`proceso_paso`) con sus propios datos | El proceso guarda sus etapas en su tabla y apunta a los eventos y movimientos. | El proceso queda autocontenido. | Los datos quedan en dos lugares (la ecografía en el evento y en el paso); anular hay que hacerlo en los dos; las listas tienen que mezclar tres tablas. |
| C. Sin entidad: "proceso" = una etiqueta de campaña en los eventos | Se agrupan los eventos por campaña y lote. | Lo más barato. | No hay estado, ni unicidad, ni decisión después del diagnóstico. No cumple "cada evento pertenece a su proceso". |

**Elijo A.** Es el único que cumple la unicidad con una regla de la base y no duplica datos. B guarda lo mismo dos veces, y C no resuelve el pedido.

## 4. Qué es un proceso

- **Una entidad propia** (`Proceso`):
  - el tipo (en la v1 solo `REPRODUCTIVO`);
  - el nombre, automático y editable: "Servicio 2026-27 · Vaquillonas 1-2";
  - la estancia (una sola), la campaña ("2026-27", sale de la fecha de inicio: de julio a junio) y la fecha de inicio;
  - el estado: **abierto**, **cerrado** o **anulado**;
  - la nota y quién lo creó.
- **La etapa actual no se guarda: se calcula** de los eventos (así, si se anula algo, la etapa vuelve sola).
- **Los lotes del proceso** (`ProcesoLote`), cada uno con su **rol**: vientres (servidas sin diagnóstico), preñadas, vacías, paridas o crías. Las preñadas, paridas y crías llevan además el **mes** (de parición esperada o real). El rol cambia con las etapas.
- **Un lote está en un solo proceso abierto a la vez.**

**Cómo lo veo, como quien trabaja en cría:**
- **Un proceso = un grupo de servicio:** uno o más lotes de hembras de la misma estancia que se sirven juntos y se manejan igual. Por lo general es una categoría: las vaquillonas de primer entore por un lado y las vacas adultas por otro.
  - No conviene uno por campaña con todo adentro: vaquillonas y vacas tienen fechas, toros y porcentajes de preñez distintos, y mezclarlos esconde justo lo que se quiere ver.
  - Tampoco conviene uno por lote: un grupo de servicio suele estar en dos o tres potreros (partes de la misma familia).
  - **La campaña es un filtro** en la lista. Con ella se ven juntos todos los servicios 2026-27.
- **Las vacías que se vuelven a servir van a un proceso nuevo** (por ejemplo, un servicio de otoño), que guarda de cuál vienen (`proceso_anterior_id`). Así cada servicio tiene su propio porcentaje de preñez, y la regla "un evento, un proceso" se mantiene simple. En el primer proceso, ese grupo dice "→ reentore". Al empezar el servicio siguiente con ese lote, el vínculo se hace solo.

## 5. Las etapas del ciclo reproductivo

La **plantilla vive en el código** (`server/src/pecuaria/procesos.plantillas.js`), igual que el mapa clave → grupo de los eventos. Un tipo de proceso nuevo es otra entrada en ese archivo, sin tocar el modelo.

| # | Etapa | Cuántas veces | Datos | Qué usa de la app | ¿Cambia el stock? |
|---|---|---|---|---|---|
| 1 | **Inicio del servicio** | Una por lote | Fecha; cómo (toros, inseminación o IATF); cabezas servidas (por defecto, todas); cuántos toros (opcional) | Evento Entore o Inseminación (ancla) | No |
| 1b | Repaso (opcional) | Una por lote | Fecha y toros (por ejemplo, toros después de una IATF) | Evento Entore | No |
| 2 | **Fin del servicio** | Una por lote | Fecha (con IATF sola, es el mismo día del inicio) | **Tipo nuevo "Fin del servicio"** (REGISTRO, hembras) | No |
| 3 | **Diagnóstico** | Una por lote | Fecha; ecografía o tacto; preñadas **por mes de parición esperado** (si hay el dato) y vacías | Evento Ecografía (ancla), con `metodo` en sus datos | No por sí solo |
| 3b | **Decisión** | En el mismo camino o después | Qué se hace con cada grupo (§8) | Movimientos: parte de la familia, cambio de categoría, mover, venta | **Sí** |
| 3c | Revisión (opcional) | Una por lote | Un segundo diagnóstico, en general de las vacías antes de venderlas: "de 10 vacías, 2 estaban preñadas" | Ecografía (etapa REVISION) + mover a las preñadas | Si hay cambios, sí |
| 4 | **Parición** | **Varias cargas**, agrupadas por mes | Por lote de preñadas: madres que parieron, terneros machos y hembras vivos, nacidos muertos y madres muertas al parto | **Tipo nuevo "Parición"** (ancla) + Nacimiento (entrada) + parte de madres a "paridas" + Muerte (causa "parto") | **Sí** |
| 4b | Aborto | Varias cargas | Cabezas; opcional: pasarlas al grupo de vacías | Evento Aborto + mover (opcional) | Si se mueven, sí |
| 4c | Fin de la parición | Una por lote | Las que no parieron pasan a vacías ("falladas") | Ancla (tipo Parición, etapa FIN_PARICION) + la decisión del §8 | Si se mueven, sí |
| 5 | **Destete** | Una por lote de crías | Fecha; terneros que se destetan; peso (opcional); a qué potrero; categoría al llegar; categoría de las madres | Destete (el mover que ya existe) + cambio de categoría de las madres | **Sí** |

- **El aborto no es una etapa de la línea de tiempo:** puede pasar en cualquier momento entre el diagnóstico y la parición, y se muestra dentro de esa parte.
- **El diagnóstico es opcional:** hay campos que no diagnostican. Sin diagnóstico, el embudo muestra "—" en preñadas y la parición se registra igual.
- **El orden de las fechas se controla:** inicio ≤ fin ≤ diagnóstico ≤ parición ≤ destete. Una parición antes de inicio + 260 días da un **aviso** (no un error): "faltan 40 días para la fecha probable, ¿seguro?".
- **El proceso se cierra solo** cuando todos sus lotes de crías se destetaron y no quedan preñadas sin parir. También se puede cerrar a mano ("Cerrar proceso", con nota), por ejemplo si se vendió todo. Si después se anula el destete, el proceso vuelve a abrirse solo.

## 6. "Cada evento es único": las reglas

1. **Un evento o movimiento pertenece a un solo proceso:** columnas `proceso_id` y `etapa` en `evento_registro`, y `proceso_id` y `registro_id` (su ancla) en `movimiento`. Es una sola clave foránea, así que no puede estar en dos.
2. **Las etapas puntuales van una sola vez por proceso y lote** (inicio, repaso, fin del servicio, diagnóstico, revisión, fin de la parición y destete). Lo controla un **índice único parcial** en la base:
   ```sql
   CREATE UNIQUE INDEX evento_registro_proceso_etapa_unica
     ON evento_registro (proceso_id, etapa, lote_id)
     WHERE NOT anulado AND etapa IN ('INICIO','REPASO','FIN_SERVICIO','DIAGNOSTICO','REVISION','FIN_PARICION','DESTETE');
   ```
   Repetirla da un error claro: "El lote Vaquillonas EG ya tiene su diagnóstico (10/04/2027). Para corregirlo, anulalo y cargalo de nuevo." Además, cada carga **bloquea la fila del proceso** (`SELECT … FOR UPDATE`): dos celulares no pueden registrar la misma etapa a la vez.
3. **La parición y el aborto admiten varias cargas.** Cada carga es única por sí misma: la agrupación es por mes, según la fecha. Si se carga el mismo lote dos veces en la misma fecha, la vista previa avisa ("¿la cargaste dos veces?"), pero deja seguir.
4. **El segundo diagnóstico** (tacto y después ecografía) es la etapa **Revisión**: una por lote, y los números del embudo toman el último. Si lo que se quiere es corregir un error de carga, se anula.
5. **Corregir = anular, como hoy:**
   - Se anula **la carga entera**: los anclas, más la reversión de sus movimientos en orden inverso, todo junto.
   - Rige la misma regla de siempre: solo si después no hubo otros cambios en esos potreros. Si los hubo, el mensaje dice cuál.
   - Un movimiento que cuelga de un proceso **no se revierte suelto** desde Movimientos: dice "Es parte del proceso X: anulalo desde ahí", igual que un paso de un movimiento múltiple.
   - Al anular, la etapa queda libre para volver a cargarla.
6. **Un proceso se anula entero** solo si no tiene cargas vigentes que hayan cambiado el stock. Si las tiene, primero se anulan esas cargas.

## 7. Fecha de parto esperada

**Conviene, y es barato.** Con 283 días de gestación (un parámetro, `GESTACION_DIAS`, que se edita):
- **Desde el servicio:** inicio + 283 = primer parto probable; fin + 283 = último. Ejemplo ficticio: servicio del 01/01 al 15/03/2027 → parición del **11/10 al 23/12/2027 (oct–dic)**. Con IATF sola, la fecha es una: el mes queda exacto.
- **Desde la ecografía:** el ecografista ve la edad de la preñez ("cabeza, cuerpo, cola" o los días). En el paso de datos, la app abre **una columna por cada mes de la ventana** (oct · nov · dic) para repartir las preñadas. Si no hay dato (por ejemplo, con tacto), van todas a "sin mes".
- **Para qué sirve:**
  - Separar desde el diagnóstico **un lote por mes**, si se mandan a potreros distintos (§8).
  - Mostrar "parición esperada oct–dic" en la lista.
  - Marcar en ámbar si se pasó la ventana y quedan preñadas sin parir.
- **Otros dos parámetros**, en Configuración → Procesos:
  - `DIAGNOSTICO_DESDE_DIAS` = 45: la ecografía se espera desde el fin del servicio + 45 días.
  - `DESTETE_EDAD_DIAS` = 180: el destete se espera desde el primer parto + 180 días.

## 8. La decisión después del diagnóstico

Es un solo camino de **5 pasos**: Qué → A quién → Datos → **Destino** → Revisar. Al confirmar, se guarda la ecografía y se hacen los movimientos, todo junto o nada.

```
 Diagnóstico · Servicio 26-27 · Vaq. 1-2
 ①──②──③──[4 Destino]──⑤

 Lote Vaquillonas EG (P8) · 50 cab.
 ┌ Preñadas oct · 18 ────────────────────┐
 │ Van a [P12          ▾]                │
 │ Como  [Vaq. 1-2 preñadas ▾]           │
 ├ Preñadas nov y dic · 22 ──────────────┤
 │ Van a [Se quedan en P8 ▾]             │
 │ Como  [Vaq. 1-2 preñadas ▾]           │
 ├ Vacías · 10 ──────────────────────────┤
 │ (•) Decidir después                   │
 │ ( ) Se quedan  ( ) Otro potrero       │
 │ ( ) Venta      ( ) Invernada          │
 │ ( ) Reentore (próximo servicio)       │
 └───────────────────────────────────────┘
 [Atrás]                      [Revisar]
```

- **Los grupos** salen de los datos: preñadas por mes y vacías. Un toque en "Juntar con…" une meses (en el boceto, nov y dic).
- **La categoría se sugiere y se puede cambiar.** Una función pura, `sugerirCategoria(etapa, categoria, categorias)`, busca por nombre en el catálogo:
  - Vaquillonas 1-2 → Vaquillonas 1-2 preñadas;
  - preñadas → paridas;
  - paridas → Vacas de cría;
  - vacías → invernar.
  - Si no encuentra la categoría, sugiere la misma que tienen.
- **Qué pasa con las vacías:**
  - **Decidir después:** se quedan en el lote (su `ProcesoLote` queda con rol VACIAS y sin `destino`: eso es "pendiente"). La ficha muestra "Falta decidir: 10 vacías" con el botón **Decidir**, que abre solo este paso.
  - **Se quedan / Otro potrero:** las mueve, sin cambiar la categoría.
  - **Venta:** una salida de venta, con precio opcional (`PrecioVenta`).
  - **Invernada:** pasan a la categoría de invernar y **salen del proceso**.
  - **Reentore:** se quedan marcadas para el próximo servicio (§4).
- **Cómo se arma por dentro** (`planDecision`, puro y con tests):
  1. Se juntan los grupos que van al mismo potrero con la misma categoría: forman un solo lote.
  2. **El lote original se queda con un grupo:** el que no cambia ni de potrero ni de categoría; si no hay, el más grande de los que se quedan en el potrero (le cambia la categoría al final).
  3. Los demás son **partes de la familia** (`raiz_id`), con nombre "<raíz> · preñadas oct". Pueden quedarse en el mismo potrero y tener otra categoría: es el ajuste del §2.2.
  4. Las ventas son salidas del lote original.
  5. Todo va en una transacción. Si algo falla, el mensaje dice "Grupo Preñadas oct: …" y no se guarda nada.
- **Revisar** lo dice en oraciones:
  ```
  Vas a anotar la ecografía de 50 vaquillonas
  (40 preñadas, 10 vacías) y:
   1. 18 preñadas oct → P12, lote nuevo
      "Vaquillonas EG · preñadas oct"
   2. 22 preñadas nov–dic → quedan en P8,
      pasan a Vaq. 1-2 preñadas
   3. 10 vacías: las decidís después
  Todo junto: si algo falla, no se guarda nada.
  ```

## 9. Parición y terneros

Es la "Parición en un solo paso" que pidió Diego. Camino de 4 pasos; en el paso 2 vienen elegidos los lotes de preñadas del proceso, con las que les faltan parir.

```
 Parición · Servicio 26-27 · Vaq. 1-2
 ①──②──[3 Datos]──④        Fecha [12/10/2027]

 Vaq. EG · preñadas oct (P12)
 Quedan 18 sin parir
  Madres que parieron         [  6 ]
  Terneros machos vivos       [  3 ]
  Terneras hembras vivas      [  2 ]
  Nacidos muertos             [  1 ]
  Madres muertas al parto     [  0 ]
 Las madres pasan a [Vaquillonas paridas ▾]
 Quedan con ellas en P12, en los lotes
 "… · paridas oct", "… · terneros oct" y
 "… · terneras oct" (se crean o se suman)
 ▸ Hubo abortos
```

- **Control:** vivos + nacidos muertos ≥ madres que parieron (los mellizos son la excepción: aviso, no error), y madres que parieron + madres muertas ≤ las que quedan sin parir.
- **Lo que hace al confirmar** (todo junto):
  1. **El ancla "Parición"** en el lote de preñadas, con los números. Los nacidos muertos **solo quedan en el ancla**: nunca entraron al stock.
  2. **Las madres que parieron pasan a "paridas":** se suman a la parte **"· paridas <mes>"** (en el mismo potrero, de la misma familia), y se crea si no existe. Cuando el lote de preñadas se vacía, se cierra. Única excepción: si parieron todas en una sola carga y todavía no hay parte de ese mes, se le cambia la categoría al lote (así no se crea un lote de más).
  3. **Los terneros entran con Nacimiento** a "· terneros <mes>" (Terneros chicos) y "· terneras <mes>" (Terneras chicas), en el potrero de las madres, con `lote_madres_id` = el lote de paridas.
  4. **Las madres muertas al parto** salen como Muerte, con la causa **"Parto"** (nueva en el seed).
- **Un lote de paridas y crías por mes:** así los de octubre se pueden mover después con sus terneros a otro potrero, aparte de los de noviembre. Para eso no hace falta nada nuevo: se usa el movimiento múltiple, o un "Mover madres con cría" más adelante. **El modelo lo permite sin decidirlo hoy.**
- **Un ternero que muere después**, al pie de la madre, es una Muerte normal de su lote. Como el lote es del proceso, el embudo la cuenta.
- **Aborto:** se marca "Hubo abortos" en la misma carga, o se usa Eventos → Aborto. Si el lote está en un proceso, el aborto se cuelga solo. Opcional: "pasarlas a vacías".
- **Fin de la parición:** botón "Terminó la parición" en la ficha. Las que quedan sin parir pasan al grupo de vacías ("falladas"), con la misma decisión del §8.

## 10. Destete

- Por cada lote de crías se usa **el destete que ya existe**: los terneros se van a otro potrero, con el lote de las madres anotado. Opcionalmente cambian de categoría al llegar (Terneros chicos → Terneros) y se carga el peso.
- **En la misma carga, las madres cambian de categoría** (paridas → Vacas de cría) y pasan a rol "vientres libres": su parte del proceso terminó.
- **El ancla del destete** va en el lote de crías, con los destetados y los kilos. Es lo que cuenta el embudo.
- **Si las crías de un mes se destetan antes** (destete precoz de la cola, por ejemplo), es otra carga, para los lotes de ese mes.

## 11. Los números del proceso (el embudo)

Se calculan de los anclas y los movimientos que no estén anulados (función pura `embudo(proceso)`, con tests):

| Número | De dónde sale |
|---|---|
| **Servidas** | Suma de las cabezas de los inicios |
| Diagnosticadas | Preñadas + vacías de los diagnósticos (con la revisión aplicada) |
| **Preñadas** / vacías | Del diagnóstico, menos los abortos |
| **Paridas** | Suma de "madres que parieron" |
| Terneros vivos | Machos + hembras vivos (muertos al parto, aparte) |
| **Destetados** y kg | Del ancla del destete (cabezas × peso, si se pesaron) |

- **Los porcentajes, sobre las servidas**, que es como se miden en la cría (son comparables entre años y campos):
  - % de preñez = preñadas ÷ servidas;
  - % de parición = terneros vivos ÷ servidas;
  - % de destete = destetados ÷ servidas.
- **También se muestran las pérdidas** entre etapas: "de 40 preñadas a 36 destetados: 2 abortos, 1 muerto al parto, 1 muerto al pie".
- **Si una etapa está a medio cargar**, se ve como parcial: "Paridas 25 de 40 (15 sin parir)".
- **Embudo corto para la lista:** "50 → 40 → 38 → 36", con "—" en lo que todavía no pasó.

## 12. Lo que se ve

### Pestaña "Procesos" (`/pecuaria/registro?ver=procesos`)

```
 [Movimientos][Eventos][Procesos]      [⚲]
 Procesos abiertos        [+ Nuevo servicio]
 ┌───────────────────────────────────────┐
 │ EG Serv. 26-27 · Vaq. 1-2   50→40→—   │
 │ Diagnóstico ✔ · ⚠ decidir 10 vacías   │
 │ 2 lotes · desde 01/01/27 · par. oct–dic│
 ├───────────────────────────────────────┤
 │ EG Serv. 26-27 · Vacas de cría 120→—  │
 │ En servicio · diag. desde 29/04       │
 │ 3 lotes · desde 15/12/26              │
 ├───────────────────────────────────────┤
 │ ES Serv. 25-26 · Vacas      90→81→47→—│
 │ Parición 47 de 81 · hasta 23/12       │
 └───────────────────────────────────────┘
 Total · 6 abiertos · 640 servidas
 ‹ 1 2 › 
```

- **Igual que Movimientos y Eventos:** tabla tipo Excel con `PantallaTabla`, `Paginador` y filas del mismo alto; en el celular, 3 líneas por fila.
- **Columnas en la compu:** Proceso · Lotes · Etapa · Inicio · Próximo · Embudo.
- **Filtros en el panel:** estado (por defecto, abiertos), campaña, etapa, período de inicio y tipo (este último se ve recién cuando haya otro tipo).
- **Con "Todas las estancias"**, cada proceso lleva la sigla adelante.
- **La columna "Próximo"** dice lo que sigue: "diag. desde 29/04", "parición oct–dic", "destete desde abr". Se pone en ámbar si se atrasó.
- Al cambiar de pestaña se conservan el período y la estancia.

### Ficha del proceso (`/pecuaria/procesos/:id`)

```
 ‹ Procesos
 Servicio 2026-27 · Vaquillonas 1-2   [⋯]
 EG · 2 lotes · abierto
 ┌ Embudo ───────────────────────────────┐
 │ Servidas    50                        │
 │ Preñadas    40  80 %  ████████░░      │
 │ Paridas      —                        │
 │ Destetados   —                        │
 └───────────────────────────────────────┘
 ✔ Inicio del servicio       01/01/2027
     Entore · 50 cab. · 2 toros
 ✔ Fin del servicio          15/03/2027
 ✔ Diagnóstico (ecografía)   10/04/2027
     40 preñadas (oct 18 · nov 15 · dic 7)
     → 18 a P12 como Vaq. 1-2 preñadas
     → 22 quedan en P8
     ⚠ Falta decidir: 10 vacías [Decidir]
 ○ Parición           esperada oct–dic 2027
 ○ Destete            desde abr 2028
 Lotes: Vaq. EG (P8) 32 · … preñadas oct (P12) 18
 ─────────────────────────────────────────
 [        Registrar parición        ]
```

- **Cada etapa muestra su estado:**
  - ✔ hecha, con la fecha, los datos y sus movimientos (cada uno lleva a su lote);
  - ○ pendiente, con la fecha esperada;
  - ⚠ atrasada, en ámbar.
- **El botón de abajo es la etapa que sigue.** En el menú ⋯: otras etapas posibles (repaso, aborto, revisión, fin de la parición), renombrar, cerrar, anular y "Sumar eventos sueltos" (§13).
- **Cada carga tiene "Anular"** (con `pecuaria:ANULAR`).

### En las fichas del lote y del potrero

- Una línea: **"En proceso: Servicio 2026-27 · diagnóstico hecho ›"**.
- En el potrero, una por proceso, si tiene lotes de varios.

### Cómo se arranca un proceso

- **Desde Eventos → Entore o Inseminación:** si los lotes elegidos son hembras sin un proceso abierto, el paso de datos muestra una tarjeta prendida: **"Empieza un servicio · Servicio 2026-27 · Vaquillonas 1-2 (cambiar nombre)"**. Si se apaga, queda como un evento suelto, igual que hoy.
- **Desde la pestaña, con "+ Nuevo servicio":** el mismo camino, con el tipo de servicio elegido en el paso 1.
- **"¿De qué proceso?" (pedido de Diego, 20/11, durante la construcción):** en Eventos, al tocar un evento de reproducción (entore, fin del servicio, ecografía, aborto), si hay procesos abiertos donde tiene sentido, primero se pregunta de cuál es. Al elegir uno, se sigue en la pantalla de esa etapa del proceso (la misma que se abre desde la ficha). El entore y la inseminación ofrecen además "Empezar un servicio nuevo", y siempre está "Anotarla suelta". Sin procesos que correspondan, no se pregunta.
- **Si un lote ya está en un proceso abierto,** los eventos de reproducción se cuelgan solos. Un entore después del inicio es el repaso; una ecografía es el diagnóstico (y abre el paso Destino); un aborto es un aborto del proceso. Revisar lo dice: "Va al proceso Servicio 2026-27 (diagnóstico)".
- **Las etapas con movimientos** (diagnóstico, parición, fin de la parición, destete) se registran en una pantalla nueva, `ProcesoEtapaPage` (`/pecuaria/procesos/:id/etapa/:etapa`), que usa `Camino`. Las que son solo un evento (inicio, repaso, fin del servicio, aborto) usan `EventoPage` con `?proceso=`.

## 13. Lo que ya está cargado

- **Los eventos de reproducción sueltos siguen valiendo** tal como están. Como los eventos se publicaron el 20/11, en Render hay pocos o ninguno.
- **"Sumar eventos sueltos" a un proceso:** desde el menú ⋯ de la ficha. Lista los entores, inseminaciones, ecografías y abortos sueltos de los lotes del proceso, sin anular. Al elegir uno, toma la etapa que corresponde, si está libre.
  - Solo se pueden sumar **eventos**: los nacimientos y destetes sueltos (que son movimientos) no se reacomodan, porque cambiarían el stock hacia atrás.

## 14. Arrancar un proceso a mitad de camino

Hoy hay pariciones en curso de un servicio que la app no vio. Por eso, "Nuevo servicio" pregunta primero **"¿En qué etapa está?"**: por empezar, en servicio, diagnosticado o pariendo.

- **Las etapas anteriores se cargan solo con sus números**, como **datos iniciales** (anclas con `datos.inicial = true`, sin movimientos ni efecto en el stock). Por ejemplo: servidas 90, preñadas 81, del 15/12/2025 al 15/03/2026.
- **El embudo las usa igual,** y la ficha las marca "dato inicial".
- **Los lotes se eligen como están hoy** (por ejemplo, "Vacas preñadas" y "Vacas paridas"), cada uno con su rol.
- **Desde ahí, todo sigue normal.**

## 15. Modelo de datos y API

### Lo nuevo en `schema.prisma` (una migración, `procesos`)

- **`Proceso`:** `id`, `tipo` (enum `TipoProceso`: REPRODUCTIVO), `nombre` (único por estancia), `campoId`, `campania` (texto, "2026-27"), `fechaInicio`, `estado` (enum `EstadoProceso`: ABIERTO / CERRADO / ANULADO), `cerradoEn`, `procesoAnteriorId` (reentore), `datos` (Json: modalidad, toros…), `nota`, `usuarioId`, `creadoEn`, `actualizadoEn`. Índices por (`campoId`, `estado`) y por `campania`.
- **`ProcesoLote`:** `id`, `procesoId`, `loteId`, `rol` (enum `RolProceso`: VIENTRES / PRENADAS / VACIAS / PARIDAS / CRIAS), `mes` (texto "2027-10", opcional), `destino` (para las vacías: REENTORE / INVERNADA / VENTA, opcional), `desde`, `hasta` (si salió del proceso), `registroId` (el ancla que lo sumó). Único por (`procesoId`, `loteId`).
  - La regla "un solo proceso abierto por lote" se controla en el servicio.
  - **Cuando un lote del proceso se reparte con el "+" normal** (una parte de la familia), la parte hereda el rol y el mes.
  - **Si se suma a un lote de afuera,** el "+" avisa antes: "Este lote está en el proceso X".
- **`EventoRegistro`:** suma `procesoId` (opcional) y `etapa` (texto, opcional), y el índice único parcial del §6.
- **`Movimiento`:** suma `procesoId` y `registroId` (su ancla, opcional).
- **Tipos nuevos en el seed:**
  - FIN_SERVICIO "Fin del servicio" (REGISTRO, hembras, lote o parte de un lote);
  - PARICION "Parición" (REGISTRO, hembras, lote o parte de un lote).
  - Los dos se agregan por clave, como los otros que faltaban.
  - ECOGRAFIA suma `metodo` (ECOGRAFIA / TACTO) a sus datos. Su nombre en el catálogo podría pasar a "Ecografía o tacto" (se edita desde Configuración).
- **La causa "Parto"** (para Muerte) va en el seed.
- **Parámetros:** `GESTACION_DIAS` (283), `DIAGNOSTICO_DESDE_DIAS` (45) y `DESTETE_EDAD_DIAS` (180).
- **El ancla del destete** es un `EventoRegistro` con el tipo DESTETE, aunque ese tipo es de los que mueven. Lo crea solo el servicio de procesos; Eventos → anotar sigue rechazando los tipos que mueven.

### Archivos nuevos del servidor (`src/pecuaria/`)

- `procesos.plantillas.js`: las etapas de cada tipo (clave, nombre, tipos que usa, si es única, si mueve, el rol de los lotes que toma y el rol en que los deja).
- `procesos.calculos.js`, todo puro:
  - `etapaActual`;
  - `proximas` (fechas esperadas y atrasos);
  - `mesesEsperados`;
  - `embudo`;
  - `sugerirCategoria`;
  - `planDecision`.
- `procesos.service.js`: crear, registrar una etapa (vista previa y registro, con `aplicar`, `aplicarEntrada` y `aplicarSalida` en una sola transacción), decidir, asociar, cerrar, anular, lista y ficha.
- `procesos.datos.js`: zod de los datos de cada etapa, como `eventos.datos.js`.

### Rutas (bajo `/api/pecuaria`)

| Ruta | Permiso |
|---|---|
| `GET /procesos?grupo=&estado=&campania=&etapa=&desde=&hasta=` (todas las estancias del usuario) y `GET /campos/:campoId/procesos` | VER |
| `GET /procesos/:id` (ficha: lotes y roles, línea de tiempo, embudo, próximas fechas, pendientes) | VER |
| `POST /procesos(/vista-previa)` (nuevo, con su inicio o sus datos iniciales) | CREAR |
| `POST /procesos/:id/etapas/:etapa(/vista-previa)` | CREAR |
| `POST /procesos/:id/decision(/vista-previa)` (la decisión que quedó pendiente) | CREAR |
| `POST /procesos/:id/asociar`, `PATCH /procesos/:id` (nombre, nota), `POST /procesos/:id/cerrar` | CREAR |
| `POST /procesos/:id/anular` | ANULAR |
| `POST /eventos-registro/grupo/:grupoId/anular` (ya existe): si los anclas tienen movimientos, también los revierte | ANULAR |

- `GET /lotes/:id` y `GET /potreros/:id` suman `procesos: [{ id, nombre, etapa }]`.
- `POST /eventos-registro` acepta `procesoId` (o lo deduce del lote) y `empezarServicio: { nombre }`.

### Auditoría

- `PROCESO_CREADO`, `PROCESO_ETAPA`, `PROCESO_DECISION`, `PROCESO_EDITADO`, `PROCESO_CERRADO` y `PROCESO_ANULADO`.
- Al anular una carga se usa el `EVENTO_ANULADO` de siempre, con la lista de movimientos revertidos.

## 16. Alcance y permisos

- **Igual que el resto.** El proceso es de una estancia (`campoId`); `alcance.js` suma `proceso: (id) => campoId`. Lo de otra estancia contesta 404.
- Ver pide `pecuaria:VER`. Crear, registrar etapas, decidir, renombrar y cerrar piden `pecuaria:CREAR`. Anular pide `pecuaria:ANULAR`.
- **Las decisiones solo van a potreros de la misma estancia.** Si un lote del proceso se va a otra estancia con "Mover entre campos", sale del proceso con un aviso. En la v1 no se sigue el proceso entre estancias.

## 17. Preguntas

**Para Diego**
1. ¿Arrancamos con las pariciones que están en curso, cargadas a mitad de camino (§14)? Si es así, conviene probarlo primero con una estancia.
2. ¿Los porcentajes sobre las servidas (lo estándar), o preferís la preñez sobre las diagnosticadas?

**Para el encargado**
1. ¿Cuándo empieza y cuándo termina el servicio de las vaquillonas y el de las vacas? ¿Se hace IATF, con repaso de toros?
2. ¿Hacen tacto o ecografía? ¿Cuántos días después de sacar los toros? ¿El ecografista dice "cabeza, cuerpo, cola" (o los días de preñez)?
3. ¿Separan las preñadas por cuándo van a parir, en potreros distintos?
4. ¿Qué hacen con las vacías: venta, invernada o reentore de otoño?
5. **¿Cuándo anotan los nacimientos:** en la recorrida (diaria o semanal) o recién en la señalada? Si es en la señalada, la parición es una sola carga por lote.
6. ¿Cuándo pasa una vaca de "parida" a "de cría": al destete? ¿Las vaquillonas paridas pasan a "Vacas de cría" al destete o en el segundo servicio?
7. **Destete:** ¿precoz, temporario con tablilla o definitivo? ¿A qué edad o en qué fecha? ¿Se van los terneros o las madres? ¿Pesan los terneros?

## 18. Orden de construcción (cada paso con sus tests)

1. **Modelo y cuentas puras.** Migración `procesos`, tipos, causa y parámetros en el seed, `procesos.plantillas.js` y `procesos.calculos.js`.
   - Tests puros: meses esperados, etapa actual, embudo y porcentajes, sugerir categoría y `planDecision`.
2. **Crear y servicio (servidor).** Crear un proceso (con su inicio o con datos iniciales), repaso, fin, lista con filtros, ficha, alcance y auditoría.
   - Tests: crear, una etapa repetida da error (y el índice también), un lote en dos procesos abiertos da error, fechas fuera de orden, alcance 404, filtros de la lista.
3. **Pantallas del servicio.** Pestaña Procesos, ficha con la línea de tiempo, "+ Nuevo servicio", la tarjeta "Empieza un servicio" en Entore/Inseminación, y "En proceso" en las fichas de lote y potrero.
   - Tests del front: la pestaña, la ficha, el arranque desde Eventos y el botón de la etapa que sigue.
4. **Diagnóstico y decisión.**
   - Servidor: `aplicarEntrada` y `aplicarSalida` dentro de una transacción; la parte de la familia en el mismo potrero y con otra categoría; "decidir después"; revisión.
   - Front: `ProcesoEtapaPage` con el paso Destino.
   - Tests: todo o nada (un grupo inválido no deja nada), separación por mes, venta de vacías, reentore, invernada.
5. **Parición, abortos y fin de la parición.**
   - Tests: varias cargas por mes, lotes "paridas/terneros/terneras <mes>" que se crean y se suman, `lote_madres_id`, nacidos muertos fuera del stock, madre muerta con causa Parto, aviso de parición temprana.
6. **Destete, cierre y anular.** Destete con las madres que cambian de categoría, embudo con kg, cierre automático y manual, anular una carga con movimientos (y el rechazo si hubo cambios después), reabrir al anular el destete, anular el proceso, y el movimiento colgado que no se revierte suelto.
7. **Sumar eventos sueltos** y los avisos del "+" normal sobre lotes en proceso.

Al final de cada paso grande: las dos suites completas (de a una), `npx vite build`, y parar para el OK.

## 19. Decisiones que tomé yo (para que las mires)

1. **Enfoque A:** el ancla en `evento_registro` y los movimientos colgados de él (§3).
2. **Un proceso = un grupo de servicio,** no una campaña entera; la campaña es un filtro. **Reentore = proceso nuevo,** vinculado al anterior (§4).
3. **La etapa no se guarda, se calcula;** el estado (abierto, cerrado, anulado) sí se guarda.
4. **Un lote de paridas y crías por mes de parición,** en el mismo potrero de las madres (§9).
5. **Diagnóstico opcional,** y "decidir después" las vacías (§8).
6. **Porcentajes sobre las servidas** (§11).
7. **Dos tipos nuevos** (Fin del servicio, Parición), la causa "Parto" y tres parámetros (283 / 45 / 180 días).
8. **Arrancar a mitad de camino** con datos iniciales (§14).
9. **Una sola estancia por proceso** (§16).

## 20. Fuera de esto

- Otros tipos de proceso (la plantilla los admite).
- "Repartir" y "Mover madres con cría" como atajos del "+" (por ahora, el movimiento múltiple).
- Datos por animal y el bastón en el diagnóstico.
- Destete temporario con tablilla.
- Avisos automáticos.
