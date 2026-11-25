# Encargo: el tablero de Procesos, con más información y que se adapte al alto

Fecha: 24/11/2026. Pedido de Diego, con una captura del celular (≈360 px de ancho).

## La situación

- `/pecuaria/procesos`, vista Tablero (`client/src/components/TableroProcesos.jsx`, `components/tablero.js`).
- Las 4 secciones arrancan cerradas y se reparten el alto en partes iguales (`flex-1`). Diego pidió eso y le gustó.
- **El problema:** cada bloque cerrado tiene solo número, nombre, subtítulo y total de cabezas. Son cuatro cajas grandes con mucho aire y poca información: "queda feo".
- En la captura, Inseminación y Entore están en 0 y ocupan la mitad de la pantalla. Preñadas (223 cab, 4 grupos) y Con cría al pie (327 cab, 4 grupos) no dicen nada más.
- El subtítulo de Entore se corta ("en otro color, las que vie…").
- **Lo que pide Diego:**
  - **Cerrada:** que cada sección muestre un poco más de información.
  - **Abierta (la flecha):** que aparezca aún más.
  - Que la solución sea **dinámica**: que use el lugar que hay, sin dejar huecos ni apretar.

## Lo que ya hay (no inventar datos)

- Cada proceso abierto trae `grupos` (`server/src/pecuaria/procesos.tablero.js`).
- Cada grupo trae: `seccion`, `tipo` (VIENTRES / VACIAS_REENTORE / VACIAS_A_DECIDIR / PRENADAS / PARIDAS), `cabezas`, `terneros`, `potreros`, `desde`, `deIatf` y `proxima`.
  - `proxima` trae: etapa, nombre, fecha, `hasta` en la parición, estado (PENDIENTE / PROXIMA / HOY / ATRASADA) y días.
- `armarTablero` los junta por sección, ordenados por lo que vence antes. También da `totales` y `deIatf`.
- Ayudas que ya existen:
  - En `components/procesos.js`: `diasCorto`, `estiloSugerencia`.
  - En `components/tablero.js`: `accionDeGrupo`, `avance`.
- Para medir el alto disponible, `useFilasQueEntran` (`components/tabla.jsx`) es un antecedente: usa `ResizeObserver`.
- **Preferir resolver todo en el front.** Si algo pide un dato que no está (por ejemplo, las preñadas por mes de parto), primero evaluar si se deduce de lo que hay. Sumarlo al servidor solo si vale la pena, y decirlo.

## Qué tiene que resolver la propuesta

### 1. El reparto del alto

- Que no sea parejo a ciegas: **una sección vacía no puede ocupar lo mismo que una con 300 cabezas.**
- Propuesta a evaluar: la sección vacía queda en un renglón ("Inseminación · sin vacas") y el lugar se lo llevan las que tienen algo.
- Si todas están vacías, un solo mensaje con "+ Nuevo".

### 2. Cerrada: un resumen que se adapta al lugar

- **Encabezado** en un renglón más chico: número, nombre, total.
  - El subtítulo, más corto o en otro lugar. Que no se corte.
  - La aclaración de que lo de IATF va "en otro color" puede ir solo cuando hay cabezas de IATF ("35 de IATF").
- **Debajo, lo más importante primero, y tanto como entre** (medir el alto y mostrar más o menos renglones):
  1. **Lo que viene antes** en la sección: evento, días y color de estado. Ejemplo: "Parición: empieza en 12 días". Si hay atrasados, primero y en rojo: "1 ecografía atrasada".
  2. **Un renglón por grupo**, compacto: proceso · cabezas · potreros · próximo evento con los días. El renglón de un grupo "viene de IATF" lleva el color trigo.
  3. Si no entran todos: "+N más" (que abre la sección).
- **Un dato propio de cada sección**, si entra:
  - Preñadas: la ventana de parición.
  - Con cría al pie: terneros al pie y el destete más cercano.
  - Entore: cuántas vienen de IATF.
  - Inseminación: la próxima ecografía.
- Tocar un renglón: definir si abre la sección o va al proceso. Recomendación: abre la sección (lo que ya hace la flecha) y desde la tarjeta se va al proceso.

### 3. Abierta: el detalle

- Ocupa el lugar libre y se scrollea por dentro, como ahora.
- Arriba, una línea de totales de la sección. Ejemplos:
  - Preñadas: por proceso o por mes esperado de parto, si se puede deducir.
  - Cría: vacas y terneros.
- Después, las tarjetas completas que ya existen (`TarjetaGrupo`): barra del tiempo, fechas y botón de lo que sigue.
- Evaluar si hace falta algo más en la tarjeta: el texto de la etapa (`proxima.texto`) y el avance ("faltan 100 por ecografiar"), si el servidor ya lo manda.

### 4. Que se vea prolijo en el celular

- Probar a 360 y a 375 px de ancho, y en un alto chico (≈640 px) y uno grande (≈800 px).
- El modo oscuro tiene que andar: usar los colores con nombre de uso (`superficie`, `boton`, `barra`), no `bg-white`.
- Con el celular acostado, que no se rompa (la barra de abajo de Procesos sigue visible).
- Nada de tipografía gigante para rellenar: el lugar se llena con información, no con tamaño.

## Cómo trabajar

1. Leer `TableroProcesos.jsx`, `tablero.js`, `ProcesosPage.jsx` y sus tests (`ProcesosPage.test.jsx`, `tablero.test.js`).
2. Escribir el diseño corto en este mismo archivo, en "Decisiones". Incluir un boceto en texto de cómo queda la captura de Diego (Inseminación 0, Entore 0, Preñadas 223 en 4 grupos, Cría 327 en 4 grupos) cerrada y con Preñadas abierta.
3. Implementar:
   - Lo puro va en `tablero.js`: el resumen de cada sección, qué viene primero y los atrasados.
   - La medición, en un hook chico.
4. Tests:
   - Puros: resumen por sección, orden, atrasados primero, "+N más".
   - De pantalla: vacía en un renglón, renglones por grupo, se abre y muestra las tarjetas.
   - jsdom no mide: el hook tiene que tener un valor por defecto razonable.
5. Correr los tests del front, aparte de los del servidor y con `--testTimeout=120000`, y después `npx vite build`.
6. Revisar a 375 px si se puede (Chrome sin ventana, como en la fase 5 de Procesos), o describir qué tiene que ver Diego.
7. Anotar en `CLAUDE.md` y avisar a Diego. **Subir a Render solo cuando él lo diga.**

## Cambio del 25/11

- Diego pidió que la sección abierta sea una tabla tipo Excel, no tarjetas. Ya está hecho: `TablaGrupos` en `TableroProcesos.jsx` y `ordenarGrupos` en `tablero.js`.
- Para la sección cerrada, conviene usar **las primeras filas de esa misma tabla**, tantas como entren, más "+N más". Así no se inventa otro formato.

## Decisiones

(Las completa quien ejecuta este encargo.)
