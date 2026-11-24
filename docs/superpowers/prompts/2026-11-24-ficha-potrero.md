# Prompt: la ficha del potrero, centrada en lo que fue pasando

> Armado por Claude Code a pedido de Diego (24/11/2026): "al apretar un potrero abre una nueva page y repite mucha información... que nos muestre una tabla así como la de potreros pero más que nada mostrando los últimos movimientos y la variación de datos de ese potrero en base a cada movimiento". Lo pidió el jefe. Lo ejecuta Claude Code en esta misma sesión.

---

## Tu rol

Sos el desarrollador full-stack de `C:\dev\sapsa-app` y cuidás que la app sea simple en el celular (375 px). Leé `CLAUDE.md` entero antes de tocar nada.

Código que tocás:
- `client/src/pages/PotreroPage.jsx`: la ficha de hoy.
- `client/src/components/PotrerosLista.jsx` y `components/tabla.jsx`: el estilo de tabla que hay que copiar (celdas, filas alternadas, títulos y Total fijos, columnas "solo en la compu").
- `server/src/pecuaria/stock.service.js` (`historialPotrero`, `detallePotrero`) y `calculos.js` (`calcularPotrero`).

## El problema (lo que se ve en las capturas de Diego, 24/11)

Al tocar el potrero 8.1 en la tabla de Potreros se abre una ficha que:
1. **Repite la fila de la tabla:** 272 cabezas, 3,18 cab/ha y 795,6 kg PV/ha en tres tarjetas grandes, el uso y las hectáreas. Eso ya se vio un toque antes.
2. **Ocupa la primera pantalla con botones** (Anotar evento, Editar stock, Cambiar uso de suelo, Corregir hectáreas), que se usan poco.
3. **Esconde lo que importa:** el historial está abajo de todo, en tarjetas con frases largas ("Llegaron 5 Terneros chicos desde 44.1 (lote 8.1 · Terneros chicos · 44.1) al lote 8.1 · Terneros chicos"), una por versión del stock, y **sin decir cuánto cambió** cada dato.

## Lo que pide el jefe

Que la ficha muestre, primero y como tabla (el mismo estilo que Potreros), **los últimos movimientos del potrero y cómo variaron sus datos con cada uno**: cabezas, peso promedio, kg/ha y cab/ha.

## Evaluá y decidí

Antes de programar, contestá:
- ¿Qué de la ficha actual ya está en la tabla de Potreros? Eso sale o se achica.
- ¿Qué no está en ningún otro lado y hace falta? (los lotes por nombre con el enlace a su historial, renombrar un lote, el valor del ganado, "Unirlas", los datos del corral, los formularios de edición, los eventos que no tocan el stock, los usos de suelo anteriores).
- ¿Qué datos ya existen para la tabla? (cada versión del stock trae sus lotes con cabezas y kilos; falta calcular la carga de cada versión y la diferencia con la anterior).

## Decisiones (tomadas al evaluar)

1. **Encabezado de una línea y media:** "← Potreros", el nombre con la estancia chica al lado, y debajo uso · ha (· utilizables) · procesos. Sin tarjetas de números ni "Stock al ...".
2. **Acciones en un menú "⋯"** arriba a la derecha (Editar stock, Cambiar uso de suelo, Corregir hectáreas o metros de comedero) y "Anotar evento" como botón chico al lado. Los formularios se abren debajo del encabezado, como hoy.
3. **"Qué hay hoy", compacto:** una línea por lote (nombre con enlace a su historial, categoría, cabezas, peso) y, en una línea chica, el valor del ganado. Renombrar con un lápiz chico. En un corral, la entrada de cada lote. "Unirlas" queda (solo aparece si hace falta).
4. **La tabla "Movimientos" es el centro:** una fila por cambio del stock, la más nueva arriba.
   - Columnas: **Qué pasó** (fecha y título corto; debajo, el detalle: de qué potrero, a cuál, qué categoría) | **Cab.** | **Peso** | **kg/ha** | **cab/ha**. Las mismas que Potreros, para que se lean igual.
   - Cada número muestra el valor **después** del cambio y, chico debajo, **la variación** contra la fila anterior (+5, −100, +12 kg). Sin cambio no se muestra nada.
   - Títulos cortos: "Entraron 5", "Salieron 100", "Llegó el lote", "Compra", "Venta", "Muerte", "Pesada", "Recuento", "Cambio de categoría", "Reversión", "Planilla", "A mano".
   - Tocar una fila la despliega: los lotes de esa versión, la nota y quién lo cargó.
   - Se ven 15 filas y "Ver más".
5. **Abajo, plegados:** "Eventos" (vacunas y demás que no cambian el stock) y "Usos de suelo".
6. **Servidor:** el historial suma, en cada versión, `titulo`, `detalle`, `carga` (cabHa, kgPvHa, pesoPromedio, con ≈ si hay pesos estimados) y `cambio` (la diferencia con la versión anterior). La carga se calcula con las hectáreas de hoy (no se guardan las de antes): se aclara en un comentario.
7. **Arreglo encontrado al evaluar:** el texto de un movimiento lee el potrero de origen y destino sin controlar que exista; en una entrada (compra, nacimiento) o una salida (venta, muerte) falta uno de los dos y el historial da error 500. Va con un test.

## Cómo se termina

- Tests del servidor (historial con carga, variación, títulos, y una entrada y una salida sin error) y del front (la tabla, la variación, desplegar una fila, el menú).
- `npx vite build` anda.
- Revisión a 375 px.
- Parar y mostrarle a Diego qué cambió y cómo probarlo. Sin commit hasta que lo pida.
