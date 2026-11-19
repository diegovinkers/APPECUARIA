# Logística de movimientos y uso del bastón

Análisis pedido por Diego el 19/11/2026 (encargo en `docs/superpowers/prompts/2026-11-19-logistica-baston.md`).
Mirada doble: logística de ganadería vacuna extensiva en Uruguay + diseño de apps para usar en el campo (celular, sol, guantes, sin señal, apuro).

Base: `docs/DECISIONES.md` §10 y §11, `docs/PECUARIA.md` §6, §7c y §7d, `docs/PROPUESTA_MOVIMIENTOS.md`, el schema (`Lote`, `VersionStock`, `Movimiento`, `EventoMovimiento`, `TipoMovimiento`, `SesionBaston`, `LecturaBaston`), los 27 tipos de `pecuaria.catalog.js`, `movimientos.service.js` y `MoverPage.jsx`.

> **Sobre las normas.** Lo que se dice acá del SNIG, el DICOSE y las guías es lo que se sabe en general del sistema uruguayo. Donde dice **"a confirmar"**, hay que preguntarlo al encargado, al escribano o al veterinario antes de construir algo que dependa de eso. Lo único verificado en una fuente oficial está al final, en "Fuentes".

---

## 1. Resumen en 10 renglones

1. **Lote repartido:** que las partes sigan siendo **lotes normales** (una categoría, un potrero), pero **de la misma familia**: nombre automático ("Terneras 2026 · P12"), sin preguntas de más, y la ficha muestra el lote total repartido. No hace falta tocar el Resumen ni los cálculos de carga.
2. Cuando dos partes de la familia quedan en el mismo potrero, la app propone **juntarlas** con un toque.
3. **El bastón es obligatorio solo en 6 de los 27 tipos:** compra, venta, traslado desde y hacia campos de afuera, caravaneo y mover entre estancias **cuando cambia el registro DICOSE** (a confirmar cuáles lo comparten).
4. **Recomendado en 7:** muerte, consumo, destete, ecografía, inseminación, vacuna de aftosa y recuento. La regla de fondo: **si el ganado ya pasa por la manga por otro motivo, leer cuesta casi nada**.
5. **En los movimientos internos alcanza con contar** (sumar, repartir, mover el lote entero, cambiar de categoría). Lo compensan un recuento periódico por potrero, el cierre contra la planilla, el DICOSE al 30/06 y avisos de diferencias.
6. **El archivo se sube dentro del mismo registro**, en un paso "Lecturas" antes de confirmar. Y también **aparte**, en una bandeja de sesiones, para vincularlo después (el `.txt` suele estar en la compu, no en el celular).
7. La app valida el formato, las caravanas repetidas, el archivo ya usado, la fecha y la cantidad. **Si no coincide, nunca corrige sola:** ofrece "usar lo del archivo", "mantener lo contado, con motivo" o "volver".
8. **El registro por animal se arma de a poco:** cada lectura actualiza "dónde se vio por última vez cada caravana". Con eso llegan avisos como "esta caravana figura en otro potrero" o "faltan 8 del lote". **El conteo por lote sigue siendo la verdad del stock**; las caravanas lo controlan.
9. **Orden propuesto:** primero el lote repartido (barato, resuelve la falla), después el bastón suelto como recuento, después el bastón dentro de entradas y salidas, y por último el registro por animal.
10. **Las 3 preguntas que más cambian lo que se construye:** qué estancias comparten DICOSE, cómo llega hoy el archivo del bastón a la compu o al celular, y si hay señal en la manga.

---

## 2. Lote repartido entre potreros

### Qué pasa hoy

- Si movés **parte** de un lote a un potrero **vacío**, la pantalla propone "Formar un lote nuevo": el destino no tiene lotes a los que sumarse, y "lote entero" pide todas las cabezas. El nombre ya es automático ("P12 · Terneras", y si está ocupado, "(2)"), pero **el lote nuevo no tiene ningún vínculo con el de origen**. Después de repartir dos o tres veces, nadie sabe que "P12 · Terneras (2)" y "42.1 · Terneras" son el mismo grupo que se apartó.
- Lo que Diego quiere es **seguir viéndolo como un solo lote** repartido en varios potreros.
- El riesgo de fondo no cambia con ninguna opción: **la app cuenta cabezas, no sabe qué animales quedaron en cada potrero.** Eso solo lo resuelve el bastón (sección 6). Las opciones de abajo resuelven el **orden** y el **nombre**, no la identidad de cada animal.

### Las opciones

**(a) Un lote en varios potreros, con cabezas por potrero.**
- A favor: es exactamente lo que dice Diego; un solo nombre.
- En contra:
  - Rompe la regla "un lote, un potrero" en la que se apoya todo: dónde está el lote, a qué estancia pertenece (y por lo tanto quién lo ve), "mover el lote entero" (¿cuál de las partes?), revertir, la ficha del lote.
  - **Se cae sola en cuanto una parte cambia de categoría.** El lote tiene una sola categoría: si las terneras de P12 pasan a vaquillonas y las de 42.1 no, ya son dos lotes. O sea, (a) termina siendo (b) en el primer cambio de categoría.
  - El peso promedio igual hay que llevarlo por parte (los que se apartan a un potrero suelen ser los más chicos o los más pesados).
  - Es el cambio más grande en el servidor.
- Curiosidad técnica: las fotos de stock ya guardan "lote X tiene N cabezas en el potrero P", así que la base aguantaría. El problema está en la lógica y en lo que entiende el usuario, no en las tablas.

**(b) Las partes son "sub-lotes" de un lote madre.**
- A favor: cada parte sigue siendo un lote normal (una categoría, un potrero), así que **todo lo que ya funciona sigue igual**: Resumen, carga por potrero, movimientos, revertir, permisos por estancia. La madre solo agrupa.
- En contra: si la madre es un registro aparte, hay que decidir qué es cuando no le quedan animales propios, y si una parte se reparte de nuevo aparecen "nietos".

**(c) Lote nuevo con nombre automático y sin pasos de más.**
- A favor: es casi lo que ya hay; lo más barato.
- En contra: no resuelve el pedido. Se pierde que las partes son del mismo grupo, y los nombres se llenan de "(2)", "(3)".

**(d) Otras que se pesaron.**
- **Etiqueta libre ("tropa", "destete 2026")** que el encargado le pone a cualquier lote. Es más flexible que la familia automática, pero depende de que alguien se acuerde de ponerla. Sirve más adelante, como complemento.
- **No permitir repartir** (obligar a sumar o mover entero): va contra cómo se trabaja; descartada.
- **Solo categorías por potrero, sin lotes:** es volver atrás; descartada.

### Recomendación: (b) hecho tan simple como (c), es decir "familia de lotes"

- Cada lote tiene un dato opcional: **de qué lote salió originalmente** (la raíz). No hay registro "madre" aparte: la raíz es el lote del que salió la primera parte.
- **Al mover parte de un lote a un potrero vacío** (o a uno con lotes, si el usuario no quiere sumar), la opción que se propone primero es **"Sigue siendo el mismo lote"**:
  - Se crea la parte con la **misma categoría** y el nombre `<nombre del lote> · <potrero destino>` ("Terneras 2026 · P12").
  - **No pide nada más.** Si el usuario quiere otro nombre u otra categoría, elige "Formar un lote nuevo", que queda como está hoy.
- **Si una parte se reparte de nuevo**, la parte nueva apunta a la **misma raíz**: la familia es plana, nunca hay nietos.
- **Ficha del lote:** "Repartido en 3 potreros: P12 30 · 42.1 70 · Frente A 20 → 120 cabezas", con un toque a cada parte.
- **Lista de lotes y "+":** se agrupan por familia, plegados.
- **Por qué esta y no (a):** da el 90 % de lo que pide Diego (ver el lote como uno y no perder el rastro) con el 10 % del riesgo. No toca los cálculos ni los permisos, y no se cae cuando una parte cambia de categoría.

### Qué pasa después, caso por caso

| Situación | Qué hace la app |
|---|---|
| **Se vuelve a juntar** | Si dos partes de la familia quedan en el mismo potrero, la app avisa "Están juntas: ¿las unís?". Es un "sumar a otro lote" ya armado: un toque y Confirmar. Queda el nombre de la parte más vieja (o el de la raíz si es una de ellas). El peso se promedia ponderado, como hoy. |
| **Una parte cambia de categoría** | Se permite. La parte sigue en la familia (la familia es "de dónde salieron", no "qué son"). La ficha muestra "2 categorías". Si después se quiere juntar dos partes con distinta categoría, la app avisa y pide elegir con cuál quedan. |
| **Peso promedio** | Cada parte tiene el suyo. Al repartir sin pesar, la parte hereda el promedio del lote (como hoy), y la app sugiere cargar el peso de los que salen **si el aparte fue por tamaño**: es el caso típico ("los chicos al verdeo") y ahí heredar el promedio miente. La familia muestra el promedio ponderado. |
| **Resumen y carga por potrero** | **No cambian.** Cada parte es un lote en un potrero, así que cab/ha, kg/ha y UG/ha siguen saliendo de las fotos por potrero. |
| **Una parte sale de la estancia** (venta, muerte, traslado afuera) | Es una salida normal de esa parte. Si sale entera, la parte se cierra y la familia muestra lo que queda. |
| **Una parte va a otra estancia del grupo** | Se lleva como hoy (lote nuevo o lote entero en la otra estancia) y mantiene la raíz. Quien no ve la otra estancia ve "1 parte en otra estancia", sin el detalle. |
| **Revertir** | Igual que hoy: revertir el movimiento que creó la parte la devuelve al lote de origen y la cierra. |

### Repartir en varios potreros de una vez

El caso real casi nunca es "saco 30": es **"este lote de 120 lo abro en tres potreros"**. Con el movimiento múltiple de hoy se puede, pero pide armar paso por paso.

**Propuesta:** una opción "Repartir" en el "+":
1. Elegís el lote.
2. Agregás potreros de destino, cada uno con sus cabezas.
3. La app muestra lo que queda en el de origen.
4. Confirmar.

Por dentro es un movimiento múltiple con todas las partes en la misma familia, y se revierte entero.

---

## 3. Tabla del bastón

**Cómo leer la tabla:**
- **Interno:** dentro de la misma estancia.
- **Entre estancias:** entre dos estancias del grupo.
- **Grupo ↔ afuera:** entra o sale ganado de SAPSA, o va a un campo de afuera.

**Los cuatro niveles:**
- **Obligatorio:** sin el archivo no se confirma (ver la salida de emergencia, abajo).
- **Recomendado:** la app lo pide, deja seguir sin él y lo marca como pendiente.
- **Opcional:** el paso "Lecturas" está, pero plegado.
- **No aplica:** el paso no aparece.

**Criterios:**
- **Lo que exige la trazabilidad:** cambio de propiedad o de registro, guía, SNIG.
- **Lo que cuesta equivocarse:** plata, un problema legal, o un error que después no se puede rastrear.
- **Lo que cuesta leer:** si el ganado ya pasa por la manga, leer es casi gratis. Si hay que juntarlo solo para leer, es caro: en las sesiones reales, 948 terneras llevaron de 10:24 a 18:43 y 125 vaquillonas, hora y media (`docs/PECUARIA.md` §6).

| # | Tipo | Alcance | Bastón | Porqué |
|---|---|---|---|---|
| 1 | Sumar a otro lote | Interno | Opcional | Mismo dueño y mismo registro; un error se ve en el próximo recuento y se corrige. Leé solo si el aparte se hace en la manga. |
| 2 | Formar un lote nuevo (y "sigue siendo el mismo lote") | Interno | Opcional | Igual que sumar. Si el aparte es en la manga (por peso o por estado), leer cuesta poco y deja dicho qué animales quedaron en cada potrero. |
| 3 | Mover el lote entero | Interno | No aplica | Se arrea de portera a portera sin manga; contar en la portera alcanza y el lote no cambia. |
| 4 | Cambio de categoría | Interno | Opcional | Muchas veces es por fecha (el 1/7) o por edad: no hay animales que leer. Si es por peso o por ecografía, ya están en la manga. |
| 5 | Reversión | Interno | No aplica | Corrige un error de carga; no hay ganado que mover. Si el movimiento original tenía lecturas, la reversión las desvincula. |
| 6 | Movimiento entre campos | Entre estancias | **Obligatorio si cambia el registro DICOSE**; si no, Recomendado | Entre establecimientos con distinto número DICOSE hace falta guía y declarar el movimiento al SNIG con las caravanas (a confirmar el trámite exacto). Si comparten registro, es casi un movimiento interno, pero se cruza la ruta y conviene la lista. |
| 7 | Nacimiento / parto | Interno (entra) | No aplica | Los terneros nacen sin caravana. Se identifican después (ver "Caravaneo"). |
| 8 | Compra | Grupo ↔ afuera | **Obligatorio** | Cambio de propiedad con guía: hay que comprobar que llegó lo que dice la guía (cantidad y caravanas) y que queden registrados a nombre de SAPSA en el SNIG. Un faltante descubierto tarde se paga. Se lee en la recepción. |
| 9 | Traslado desde otro campo (de afuera) | Grupo ↔ afuera | **Obligatorio** | Entra ganado al registro con guía. Si viene de otra estancia del grupo, se usa "Movimiento entre campos" y no este tipo. |
| 10 | Muerte | Grupo ↔ afuera (baja) | Recomendado | La muerte de un animal identificado se informa al SNIG (a confirmar el plazo y quién la informa). Es **un solo animal**: se lee en el campo o se anota la caravana a mano. No se obliga: el animal puede aparecer días después, sin la caravana. |
| 11 | Consumo | Grupo ↔ afuera (baja) | Recomendado | Igual que muerte: un animal, y su baja en el SNIG. |
| 12 | Venta o faena | Grupo ↔ afuera | **Obligatorio** | Cambio de propiedad con guía; el frigorífico o el comprador reciben animales identificados. Equivocarse cuesta plata (se cobra por cabeza o por kilo) y deja caravanas "vivas" en SAPSA que ya no están. Se lee en el embarque. |
| 13 | Traslado a otro campo (de afuera) | Grupo ↔ afuera | **Obligatorio** | Sale ganado del registro con guía (por ejemplo, un pastoreo o una capitalización en otro campo). La lista de caravanas es la prueba de qué salió. |
| 14 | Pérdida o abigeato | Grupo ↔ afuera (baja) | No aplica | No hay animal que leer. La lista de caravanas que faltan sale del último recuento con bastón (sección 6); sirve para la denuncia. |
| 15 | Pesada | Interno | Opcional | Los archivos de hoy no traen peso. Si un día se usa una balanza que guarda caravana y peso, pasa a Recomendado (da peso por animal). |
| 16 | Ecografía | Interno | Recomendado | Las vacas ya están en la manga, así que leer cuesta casi nada. Dice qué vaca está preñada y cuál vacía: base para descartar o vender vacías. |
| 17 | Inseminación | Interno | Recomendado | En la manga, y el dato vale por animal (qué vaca, qué día). |
| 18 | Entore o servicio | Interno | No aplica | Se echan los toros al potrero, sin manga. |
| 19 | Aborto | Interno | Opcional | Se detecta en un animal (muchas veces en la ecografía); útil si se lee, pero no siempre está en la manga. |
| 20 | Destete | Interno | Recomendado | Los terneros se apartan en la manga: es **el momento natural de caravanear** a los que no tienen caravana, y de empezar su registro por animal. |
| 21 | Castración | Interno | Opcional | En la manga, pero el dato por animal vale poco. |
| 22 | Caravaneo o señalada | Interno | **Obligatorio** | El archivo **es** el registro: qué caravanas se pusieron, a qué lote. Sin él el caravaneo no deja nada útil en la app. |
| 23 | Vacuna carbunclo | Interno | Opcional | Pasan por la manga; leer da un recuento casi gratis, pero no hace falta en cada vacuna. |
| 24 | Vacuna aftosa | Interno | Recomendado | Si la campaña pasa a **todo el rodeo** por la manga (a confirmar cómo y cuándo vacunan), es el mejor momento del año para un **recuento completo con bastón**: ancla el registro por animal y el cierre contra el DICOSE. |
| 25 | Otros tratamientos sanitarios | Interno | Opcional | Por lote alcanza; leer solo si el tratamiento es individual (curaciones). |
| 26 | Alimentación | Interno | No aplica | Es del lote o del corral. |
| 27 | Recuento | Interno | Recomendado | El bastón es el recuento más preciso y además dice **quiénes** faltan, no solo cuántos. Se acepta el recuento a ojo en la portera, marcado como tal. |

**Total:** 6 obligatorios (contando el 6 cuando cambia de registro), 7 recomendados, 8 opcionales y 6 que no aplican.

### La salida de emergencia de "Obligatorio"

El bastón se queda sin batería, el camión ya está cargado, el archivo quedó en la compu del escritorio. **Que el sistema bloquee no puede trabar un embarque.** La propuesta:

- **"Registrar sin archivo"** existe, pero pide un **motivo** y deja el movimiento **"con lecturas pendientes"**: aparece en una lista de pendientes y en la ficha, con un cartel.
- El stock se mueve igual: el camión salió.
- **Subir el archivo después** lo cierra.
- Quién puede usar "sin archivo" se decide con los permisos que ya existen (¿solo el encargado y el jefe?). Es pregunta para el encargado (sección 9).
- **El nivel de cada tipo se configura** desde Configuración (como hoy la causa y la guía), así se puede ajustar sin programar.

---

## 4. Cuándo alcanza con contar

### Qué se puede registrar solo con cabezas

- **Movimientos internos** dentro del mismo registro DICOSE: sumar, repartir, formar un lote nuevo, mover el lote entero, mover entre estancias que comparten registro.
- **Cambios de categoría** por fecha o por edad.
- **Nacimientos** (al parto se cuentan; se identifican al caravanear).
- **Eventos por lote:** vacunas, tratamientos, alimentación, entore.

**Por qué alcanza:**
1. Todo queda dentro del mismo dueño y del mismo registro.
2. Un error no se paga en plata ni en un trámite.
3. El error se puede encontrar después. Para eso están los controles de abajo, que son baratos.

### Los controles que lo compensan

| Control | Cómo | Cada cuánto | Qué cuesta | Qué agarra |
|---|---|---|---|---|
| **Recuento por potrero** | El capataz cuenta en la recorrida o en la portera y lo carga como "Recuento" (tipo 27): pone el número; la app muestra la diferencia con lo que tiene y pide motivo si no coincide. | Sugerido: una vez por mes por potrero con animales, y siempre después de repartir un lote. La app recuerda los potreros sin recuento hace más de 30 días (plazo a definir con el encargado). | Bajo: se cuenta al recorrer. | Errores de carga, animales que pasaron un alambrado, muertes sin registrar. |
| **Recuento con bastón** | Se pasa el lote por la manga, aprovechando la aftosa, el destete o la ecografía. | Una o dos veces por año por lote. | Alto si se junta solo para eso; casi nulo si se aprovecha otra manga. | Además de cuántos, **quiénes**: los que faltan, los que sobran, los que están en el lote equivocado. |
| **Cierre contra la planilla del encargado** | Mientras la planilla siga viva, el importador que ya existe la compara con el stock de la app y muestra las diferencias por potrero y categoría. | Cada vez que el encargado manda la planilla. | Nulo: ya se hace. | Movimientos que se anotaron en un lado y no en el otro. **Cuando la app sea la única fuente, este control desaparece.** |
| **DICOSE al 30/06** | La app arma un "borrador DICOSE": stock al 30/06 por estancia y por categoría DICOSE (con la equivalencia de categorías de `PECUARIA.md` §5 y §7c). El encargado lo compara con lo que declara. | Una vez por año. | Bajo, una vez armado. | La foto oficial contra la de la app; la diferencia tiene que explicarse con altas y bajas. |
| **Avisos automáticos** | Ver la lista de abajo. | Siempre. | Nulo. | Lo raro, en el momento. |

### Avisos que la app puede dar sin el bastón

- "Este potrero no tiene recuento hace N días."
- "Este lote está repartido y sus partes suman distinto que cuando se repartió." Pasa si alguien editó a mano; el sistema lo ve.
- "La carga de este potrero subió más del X % de un día para el otro."
- "Hay movimientos con lecturas pendientes" (los obligatorios registrados sin archivo).
- "El recuento dio N menos que el stock": propone registrar la diferencia como muerte, pérdida o error de carga, siempre con motivo.

---

## 5. Subir el archivo del bastón al registrar

### Dos caminos de entrada, el mismo archivo

1. **Dentro del registro:** paso "Lecturas" en el formulario del "+".
2. **Aparte, en la bandeja "Sesiones del bastón"** (en Pecuaria): se sube el `.txt` cuando se puede (por ejemplo, desde la compu, a la noche) y queda "sin usar". Después, en el movimiento, se elige "Usar una sesión ya subida".

**El camino 2 es igual de importante que el 1:** el bastón suele bajar a la compu con Data Link, no al celular. Quien está en la manga registra el movimiento; quien está en la oficina sube el archivo; los dos se encuentran en la app.

### En qué paso del formulario va

Va después de elegir **qué** se mueve y **a dónde**, y antes de la vista previa. Así la app ya sabe contra qué comparar (lote, cabezas, fecha).

Orden: tipo → lote(s) → cabezas → destino o causa o guía → **lecturas** → vista previa → confirmar.

Si el archivo se sube antes de cargar las cabezas, la app **las propone** con el número de lecturas.

### Qué valida la app

| Validación | Qué hace si falla |
|---|---|
| **Formato:** cada renglón con la forma `\|EID\|DDMMAAAA\|HHMMSS\|...` (`PECUARIA.md` §6). | Si ningún renglón sirve: "Este archivo no parece del bastón". Si fallan algunos: los muestra ("3 renglones no se pudieron leer") y sigue con el resto. |
| **Caravana válida:** empieza con `A` y tiene el código de país (858 = Uruguay). | Las de otro país (ganado importado) se aceptan con aviso. Las ilegibles se descartan y se cuentan. |
| **Caravanas repetidas en el archivo** | Se cuentan una vez y se avisa ("4 leídas dos veces"). Es normal: el animal volvió a pasar. |
| **El mismo archivo ya se subió** (huella del archivo; la tabla `Importacion` ya la guarda) | "Este archivo ya se usó en la venta del 12/11 (#345)." Para un obligatorio no deja reusarlo; si fue un error, se desvincula del otro primero. |
| **Mismas caravanas que otra sesión del mismo día**, con otro nombre de archivo | "120 de estas 125 caravanas ya están en la sesión de las 15:09." Avisa sin bloquear: puede ser una relectura. |
| **Fecha:** la del archivo contra la del movimiento. | Si son el mismo día o el anterior (sesión que pasó la medianoche, o carga al día siguiente), sigue. Si no, avisa y deja elegir cuál vale. Si la fecha es absurda (año 2000: el bastón perdió la hora), avisa "el reloj del bastón parece desconfigurado" y usa la del movimiento. |
| **Cantidad:** lecturas contra cabezas cargadas. | Ver "Si hay diferencias". |
| **Animales conocidos** (cuando exista el registro por animal) | "12 de estas caravanas figuran en otro potrero", "3 figuran como vendidas", "8 del lote no se leyeron". Las vendidas o muertas **bloquean** una venta (un animal no se vende dos veces). Lo demás avisa. |

### Si hay diferencias

Ejemplo: cargaste 120 cabezas y el archivo trae 116. La app **no corrige sola**: muestra las tres opciones con el número a la vista.

```
┌──────────────────────────────────┐
│ ← Venta · Lecturas               │
│                                  │
│  VENTA.NOV.txt                   │
│  19/11/2026 · 07:12 a 09:40      │
│                                  │
│   Cargaste     120 cabezas       │
│   Leídas       116 caravanas     │
│   Diferencia     4               │
│                                  │
│  ⚠ 2 repetidas (contadas 1 vez)  │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ Usar 116 (lo del archivo)    │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ Mantener 120: 4 sin leer     │ │
│ │ (caravana perdida, falla…)   │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ Volver y revisar             │ │
│ └──────────────────────────────┘ │
│                                  │
│ [      Ver vista previa       ]  │
└──────────────────────────────────┘
```

- **"Mantener lo contado"** pide el motivo en un toque: caravana perdida · no se leyó · ternero sin caravanear · otro (texto).
- Queda guardado **"4 sin leer"**. En una venta, la app recuerda que esos 4 igual tienen que ir en la guía (a confirmar con el escribano qué pasa con un animal sin caravana en una venta).
- **Si sobran lecturas** (más caravanas que cabezas): puede ser un animal del brete de al lado. La app muestra las de más y deja quitarlas de a una.

### Qué se guarda

- **El archivo tal cual** (texto, unos 45 KB para 950 lecturas: entra en la base sin problema), su nombre, su huella, quién lo subió y cuándo.
- **La sesión:** fecha, hora de inicio y fin, estancia, potrero y lote, cantidad de lecturas válidas, repetidas e ilegibles.
- **Cada caravana leída** con su hora (ya existe `LecturaBaston`).
- **El vínculo** sesión ↔ movimiento (o ↔ evento, en un múltiple o entre campos: una sola sesión puede servir para todo el evento).
- **El resultado de la comparación:** cabezas cargadas, lecturas, diferencia, opción elegida y motivo.
- **En el movimiento:** el estado de sus lecturas (no pide · pendiente · completas · sin archivo, con motivo).

### Cómo llega el archivo al celular o a la compu

**No lo sabemos todavía: es pregunta para el encargado (sección 9).** Las posibilidades:

1. **Bastón → compu con Data Link → `.txt`** (es lo que se vio). La compu sube el archivo a la bandeja o directo al movimiento desde la vista de compu. **Camino seguro.**
2. **Bastón → app del fabricante en el celular** (por Bluetooth, si el modelo lo permite) → "Compartir" o "Guardar en Archivos" → en la app, "Subir archivo" lo toma de Archivos.
   - Funciona en iPhone y en Android.
   - El botón "Compartir con SAPSA" directo desde la otra app **solo andaría en Android**: Safari en iPhone no deja que una PWA reciba archivos compartidos.
   - A confirmar: el modelo exacto del bastón y si su app exporta el mismo formato.
3. **Por WhatsApp o mail** el archivo llega al celular de quien registra → se guarda en Archivos → "Subir archivo". Funciona, pero es un paso de más.

### Toques del flujo más común, por rol

**Capataz: "aparté 30 terneras de este lote al potrero vacío de al lado"** (sin bastón).

| Toque | Qué | Qué deduce o sugiere la app |
|---|---|---|
| 1 | "+" | — |
| 2 | Mover entre potreros | — |
| 3 | Potrero de origen | Si hay uno solo con animales de su estancia o venía de una ficha, ya viene elegido. |
| 4 | Lote | Si el potrero tiene un solo lote, ya viene elegido. |
| — | Escribe "30" | Teclado numérico grande. |
| 5 | Potrero de destino | Primero los más usados desde ese origen, después los vacíos. |
| — | (nada) | Destino vacío y parte del lote → **"Sigue siendo el mismo lote"**, ya marcado, con nombre y categoría heredados. |
| 6 | Confirmar | La vista previa se ve arriba del botón, sin otra pantalla. |

**6 toques y un número.** Hoy son casi los mismos. Lo que cambia es que no aparece "lote nuevo" con su categoría para revisar y que la parte queda en la familia.

**Encargado: "venta de 120 novillos, con bastón"** (archivo ya subido desde la compu a la bandeja).

| Toque | Qué | Qué deduce o sugiere la app |
|---|---|---|
| 1-2 | "+" → Salida | — |
| 3 | Venta o faena | — |
| 4 | "Usar una sesión ya subida" → elige la de hoy | Se muestran primero las sesiones sin usar de su estancia y de los últimos 3 días. |
| — | (nada) | **Lote o lotes:** si hay registro por animal, el lote donde están la mayoría de esas caravanas; si no, pregunta. **Cabezas** = lecturas. **Fecha** = la del archivo. |
| 5 | Confirma el lote | — |
| — | Escribe el número de guía | Obligatorio para venta (ya existe `pideGuia`). |
| 6 | Ver vista previa | Diferencias, si las hay (pantalla de arriba). |
| 7 | Confirmar | — |

**7 toques, un número de guía, y el archivo.** El peso promedio queda opcional, como hoy.

**Jefe pecuario: los pendientes** (en la compu).
- Una lista: movimientos sin lecturas, recuentos atrasados, diferencias sin motivo.
- Cada fila se resuelve con un toque: subir archivo, aceptar el motivo o abrir el movimiento.

### Lo que la app puede deducir o sugerir sola (sin decidir)

- La fecha, la hora y la cantidad, del archivo.
- **Del nombre del archivo**, una pista: "TERA.EG" → terneras de EG; se muestra como sugerencia, nunca se aplica sola (`PECUARIA.md` §6, supuesto).
- El lote más probable, por las caravanas conocidas.
- Que dos partes de una familia quedaron juntas.
- El destino más usado desde un potrero.
- **Una sesión que mezcla dos lotes:** propone cortarla donde hay un hueco de tiempo largo. Las lecturas tienen hora: "de 10:24 a 11:50, 120 lecturas; pausa de 40 min; de 12:30 a 13:10, 52".

---

## 6. Registro por animal, de a poco

La idea es no caravanear ni leer todo de golpe. **Cada vez que se usa el bastón por otro motivo** (venta, destete, aftosa), la app aprende un poco más de "qué caravana está dónde". Nada de esto cambia el stock por sí solo: **las cabezas por lote siguen mandando**, y las caravanas sirven para controlar y avisar.

| Etapa | Qué se hace | Qué se gana |
|---|---|---|
| **0. Hoy** | Solo cabezas por lote. | — |
| **1. Archivo guardado** | Cada sesión queda guardada y vinculada a su movimiento, sin interpretarla. | Prueba de qué salió en cada venta o traslado, para la guía, el SNIG o un reclamo. Búsqueda "¿cuándo y dónde se leyó la caravana X?". |
| **2. Última vez visto** | Cada lectura actualiza, para esa caravana: estancia, potrero, lote, fecha y tipo de movimiento. Una venta o una muerte la marcan como **baja**. | Avisos: "esta caravana figura en otro potrero (P12, leída el 03/10)", "esta caravana figura como vendida el 12/11", "es la primera vez que vemos esta caravana" (comprada sin leer, o caravana nueva). |
| **3. Cobertura por lote** | Por lote: cuántas de sus cabezas tienen caravana conocida. Ejemplo: "Terneras 2026: 112 de 120 identificadas (93 %)". | Con un lote bien cubierto, al leerlo la app dice **quiénes faltan**: "faltan 8 del lote" y cuáles. En un lote repartido con bastón, la app sabe qué animales quedaron en cada parte: **resuelve el riesgo de la sección 2**. |
| **4. Datos por animal** | Ecografía, inseminación y peso (si un día hay balanza con caravana) se guardan por animal cuando vienen con lecturas. | Preñez por vaca, vacías para descartar, ganancia de peso por animal. Fecha de nacimiento aproximada (del caravaneo o del destete), para sugerir cambios de categoría por edad. |
| **5. Cruce con el SNIG** | Si se puede obtener del SNIG la lista de caravanas registradas por establecimiento (a confirmar), se compara una vez por año. | Caravanas que el SNIG tiene y la app no (o al revés): bajas sin informar, compras sin registrar. |

**Para que funcione:**
- La **campaña de aftosa** (o el momento del año en que todo el rodeo pasa por la manga) es el ancla: con leer ahí, el registro queda casi completo de una vez por año.
- El **destete** suma a los terneros.
- Las **compras** suman a los que llegan.

**Lo que no se hace:** obligar a que cada movimiento interno se lea. El registro tolera huecos: "última vez visto hace 4 meses en P12" sigue siendo información útil.

---

## 7. Cambios al modelo de datos (en palabras)

**Lote**
- Nuevo campo **"lote raíz"** (opcional): de qué lote salió originalmente esta parte. Las partes de una familia comparten la raíz; la raíz no tiene raíz.
- No cambian: "un potrero" y "una categoría" por lote.

**Campo (estancia)**
- Nuevo dato **"registro DICOSE"**: una etiqueta que dice qué estancias comparten registro (por ejemplo, la estancia y el feedlot de La Gateada, si fuera así).
- Puede ser solo un grupo ("Registro 1", "Registro 2") **sin guardar el número**, si Diego prefiere no tenerlo en la base.
- Sirve para decidir si "Movimiento entre campos" pide el bastón.

**TipoMovimiento**
- Nuevo campo **"bastón"**: Obligatorio, Recomendado, Opcional o No aplica, editable en Configuración, con los valores de la tabla de la sección 3.
- Para "Movimiento entre campos", un valor especial: "obligatorio si cambia de registro".

**Movimiento**
- Nuevo **"estado de las lecturas"**: no pide · pendiente · completas · sin archivo.
- Nuevo **"motivo sin archivo"**.
- Nuevo **"cabezas sin leer"**, con su motivo (si se eligió "mantener lo contado").

**Importacion** (ya existe, con tipo BASTON y la huella del archivo)
- Se usa para el archivo del bastón igual que para la planilla: pendiente → confirmada.
- Guarda el texto original y lo leído.

**SesionBaston** (ya existe, sin código)
- Se le agregan:
  - el **lote**;
  - el **estado**: sin usar · vinculada · descartada;
  - cuántas lecturas **repetidas** e **ilegibles** tuvo;
  - el **nombre que le dio el bastón** (para la pista del nombre).
- Ya tiene: estancia, potrero, categoría, fecha, inicio, fin y cantidad.

**Nueva tabla: uso de la sesión**
- Vincula una sesión con un movimiento o con un evento (múltiple, entre campos), con la cantidad esperada, la leída, la diferencia y la opción elegida.
- Va aparte porque una sesión puede servir a un evento de varios pasos, y para desvincularla sin borrar nada.

**LecturaBaston** (ya existe)
- Queda como está: caravana y hora, sin repetirse en la sesión.
- Las repetidas del archivo se cuentan en la sesión, no se guardan dos veces.

**Nueva tabla: animal** (etapa 2 en adelante)
- Una fila por caravana conocida:
  - el número de caravana (normalizado: `A0000000858000066574797` → `858000066574797`; a confirmar si conviene guardar las dos formas);
  - la primera vez que se vio y por qué (compra, caravaneo, recuento);
  - la última vez vista: fecha, estancia, potrero, lote y sesión;
  - el estado: activo · vendido · muerto · consumido · perdido · salió del grupo;
  - opcionales: sexo y fecha de nacimiento aproximada.
- Su historia **no se guarda aparte**: sale de las lecturas y de los movimientos vinculados.

**Nueva tabla: reemplazo de caravana** (más adelante)
- Caravana vieja → caravana nueva, con fecha, para cuando se repone una caravana perdida y se sabe de qué animal era.

**Nada cambia** en las fotos de stock (`VersionStock` y sus líneas), ni en el Resumen, ni en los cálculos de carga.

---

## 8. Plan por fases

Cada fase es chica, termina con algo que Diego puede probar y espera el OK. Van ordenadas por valor sobre esfuerzo.

| Fase | Qué | Esfuerzo | Cómo lo prueba Diego |
|---|---|---|---|
| **1. Lote repartido** | Lote raíz; opción "Sigue siendo el mismo lote" propuesta primero al mover parte a un potrero; nombre automático `<lote> · <potrero>`; ficha con "Repartido en N potreros"; aviso y botón "Unirlas" cuando dos partes quedan juntas. | Bajo | Mover 30 de un lote de 100 a un potrero vacío con 6 toques; ver la ficha con las dos partes; mover las 30 de vuelta y unirlas. |
| **2. Repartir en varios potreros** | Opción "Repartir" en el "+": un lote, varios destinos con sus cabezas, un solo Confirmar (por dentro, un múltiple). | Bajo-medio | Abrir un lote de 120 en tres potreros de una vez y revertirlo entero. |
| **3. Bandeja de sesiones del bastón** | Subir un `.txt`, validar (formato, repetidas, huella, fecha), vista previa, guardar. "Recuento con bastón" contra un lote o un potrero: leídas contra cabezas. (Estaba en el alcance de la v1.) | Medio | Subir los dos archivos reales (948 y 125 lecturas); subir uno dos veces y ver el aviso; comparar con el stock de un lote. |
| **4. Lecturas dentro del registro** | Paso "Lecturas" en compra, venta, traslados, caravaneo y entre campos; nivel por tipo en Configuración; diferencias con las tres opciones; "registrar sin archivo" con motivo. | Medio | Registrar una venta con archivo y otra sin archivo; ver el pendiente; subir el archivo después y verlo cerrarse. |
| **5. Pendientes y avisos** | Lista de pendientes para el encargado y el jefe; potreros sin recuento; diferencias sin motivo; recuento a ojo con diferencia. | Bajo-medio | Ver los pendientes de la fase 4 y un potrero sin recuento hace más de 30 días. |
| **6. Registro por animal: última vez visto** | Tabla animal alimentada por cada sesión; avisos "figura en otro potrero", "figura como vendida", "caravana nueva"; búsqueda por caravana. | Medio | Subir una sesión con caravanas de otra sesión y ver los avisos; buscar una caravana y ver dónde se leyó. |
| **7. Cobertura y "faltan N"** | Cobertura por lote; al leer un lote, quiénes faltan; en una venta, el lote sugerido por las caravanas. | Medio | Leer de nuevo un lote con 5 caravanas menos y ver "faltan 5" con sus números. |
| **8. Borrador DICOSE al 30/06** | Stock al 30/06 por estancia y categoría DICOSE. | Bajo (con la equivalencia de categorías ya hecha) | Compararlo con el DICOSE de 2026. |
| **Después** | Datos por animal (ecografía, inseminación, peso); registro sin señal (borrador guardado en el celular que se manda al volver la señal); cruce con el SNIG. | Alto | — |

**Por qué este orden:**
- La fase 1 resuelve la falla que vio Diego con poco riesgo.
- Las fases 3 y 4 hacen que el bastón deje algo útil desde el primer archivo.
- El registro por animal llega cuando ya hay sesiones guardadas que lo alimentan.

---

## 9. Preguntas para el encargado o el jefe pecuario

1. **¿Cada estancia tiene su propio número DICOSE? ¿Cuáles comparten?** (La Gateada con su feedlot y la Granja; La Palma, que no aparece en el DICOSE del 30/06.) Define si mover entre estancias pide el bastón.
2. **¿Cómo baja hoy el archivo del bastón?** ¿A una compu con Data Link, a una app del celular, por Bluetooth, por WhatsApp? ¿Qué modelo es? Define si el paso "Lecturas" se usa en el celular o en la compu.
3. **¿Hay señal en la manga y en los potreros?** Define si hace falta registrar sin conexión antes de lo previsto.
4. **¿Cómo declaran hoy al SNIG** las ventas, compras, traslados y muertes? ¿Quién arma la lista de caravanas para la guía? Define qué tiene que exportar la app.
5. **¿A qué edad caravanean a los terneros?** ¿Al pie de la madre, al destete, antes de vender? ¿Hoy todos los animales adultos tienen caravana electrónica?
6. **Cuando reparten un lote en varios potreros, ¿lo siguen llamando igual?** ¿Cómo lo anotan en la planilla? Confirma la "familia de lotes".
7. **¿Pasan todo el rodeo por la manga en la vacunación de aftosa? ¿En qué meses?** Define el ancla del recuento anual con bastón.
8. **¿Cada cuánto recorren y cuentan los potreros?** ¿Qué diferencia entre bastón y conteo aceptan como normal (1, 2 animales)? Define el plazo del aviso "sin recuento" y la tolerancia.
9. **Si el bastón falla en un embarque, ¿qué hacen hoy?** ¿Quién debería poder registrar sin archivo?
10. **¿Les serviría el dato por animal en ecografía e inseminación** (qué vaca está preñada o vacía)? ¿El frigorífico o el comprador les pide la lista de caravanas?

---

## 10. Riesgos

| Riesgo | Qué pasa | Cómo se cubre |
|---|---|---|
| **Lecturas fallidas** | El bastón no lee a un animal que pasa rápido, o la caravana está sucia o rota: lecturas < cabezas. | Nunca se corrige solo. "Mantener lo contado" con N sin leer y motivo. Tolerancia acordada con el encargado. Los "sin leer" quedan a la vista hasta el próximo recuento. |
| **Lecturas de más** | El bastón lee una caravana del brete de al lado, o el mismo animal dos veces. | Las repetidas se cuentan una vez. Las de más se muestran y se quitan a mano. Con registro por animal: "esta figura en otro lote". |
| **Animal sin caravana o con la caravana perdida** | Está, se cuenta, pero no aparece en el archivo. | Cuenta como "sin leer" con motivo "caravana perdida". Se repone la caravana (a confirmar el trámite en el SNIG) y se registra el reemplazo cuando se sabe de qué animal era. |
| **Terneros sin caravanear** | Al pie de la madre no tienen caravana: en una lectura de vacas con cría, el archivo trae solo las madres. | En lotes de vacas paridas, la app compara las lecturas **solo con las madres** y pide los terneros como número aparte. El destete y el caravaneo los identifican. Por norma, el ternero se identifica antes de su primer movimiento o cambio de dueño (ver "Fuentes"): la app puede avisar si se intenta vender o trasladar afuera un lote de terneros sin lecturas. |
| **El mismo archivo subido dos veces** | Se duplicaría una venta o un recuento. | La huella del archivo (ya existe en `Importacion`) y el aviso de caravanas repetidas entre sesiones del mismo día. |
| **Una sesión que mezcla dos lotes** | Se leyeron dos lotes seguidos sin cortar la sesión del bastón. | La app propone cortar en los huecos de tiempo; con registro por animal, separa por el lote conocido de cada caravana. Queda la opción de usar solo una parte de la sesión. |
| **Reloj del bastón desconfigurado** | La fecha del archivo es absurda. | Aviso, y se usa la fecha del movimiento. |
| **Trabajo sin señal** | La app no guarda nada sin conexión (la PWA nunca toca la API sin red). Se pierde lo cargado en el campo. | Corto plazo: el formulario se guarda en el celular mientras se completa, y si falla el envío no se pierde. Largo plazo: borradores que se mandan solos al volver la señal (fase "Después"), siempre con vista previa al volver, porque el stock pudo cambiar mientras tanto. |
| **Dos verdades** (cabezas por lote contra caravanas) | Si las caravanas corrigieran el stock solas, una lectura fallida "mataría" animales. | Regla fija: **el stock lo dicen los movimientos y las cabezas; las caravanas solo avisan.** Toda corrección pasa por un movimiento con motivo. |
| **"Obligatorio" que traba el trabajo** | El bastón falla y no se puede registrar el embarque. | "Registrar sin archivo" con motivo y pendiente, y el nivel de cada tipo editable en Configuración. |
| **Normas mal entendidas** | Diseñar sobre una regla del SNIG o del DICOSE que no es así. | Todo lo normativo está marcado "a confirmar". El MGAP anunció cambios en el registro de animales y en el pedido de caravanas desde el 10/11/2026 (ver "Fuentes"): revisarlos antes de la fase 4. |
| **El lote repartido mal usado** | Se reparte por error y la familia queda con partes de 1 o 2 cabezas. | Las partes se unen con un toque; avisos de partes chicas; revertir como hoy. |
| **Confidencialidad** | Los archivos del bastón no tienen datos personales, pero el número DICOSE identifica al establecimiento. | Se puede guardar solo una etiqueta por registro, sin el número (sección 7). Los archivos reales siguen fuera de git. |

---

## Fuentes

Verificado en la web el 19/11/2026, sin datos de SAPSA en las búsquedas. Todo lo demás está marcado "a confirmar".

- El decreto 266/2008 dice que la identificación individual y el registro del ternero se hacen en el lugar de nacimiento, antes del primer movimiento o cambio de propiedad: [IMPO, decreto 266/2008](https://impo.com.uy/bases/decretos-originales/266-2008).
- Los movimientos, cambios de propiedad, muertes y extravíos de animales identificados se notifican al SNIG: [INAC, la experiencia de Uruguay en trazabilidad bovina](https://www.inac.uy/innovaportal/v/5046/4/innova.front/la-experiencia-de-uruguay-en-trazabilidad-bovina).
- El SNIG provee las caravanas: [gub.uy, Solicitud de caravanas para la trazabilidad del ganado](https://www.gub.uy/tramites/solicitud-caravanas-trazabilidad-ganado).
- El MGAP anunció cambios en el registro de animales y en el pedido de caravanas desde el 10/11/2026 (sin el detalle): [MGAP, resumen semanal de noticias](https://www.gub.uy/ministerio-ganaderia-agricultura-pesca/node/21939) y [SNIG](https://www.gub.uy/ministerio-ganaderia-agricultura-pesca/tramites-y-servicios/servicios/sistema-nacional-informacion-ganadera).
