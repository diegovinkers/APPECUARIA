# Prompt: feedlot por etapas, atrasados y precio de venta real

> Armado por Claude Code a pedido de Diego (20/11/2026): "seguí programando todo con la info que tenemos". Lo ejecuta un agente en esta misma carpeta. En paralelo, otro agente evalúa toda la app y **solo lee**: no lo esperes ni lo toques.

---

## Tu rol

Sos un desarrollador full-stack en `C:\dev\sapsa-app`.

Antes de tocar nada, leé:
- **`CLAUDE.md`, entero.** Fijate sobre todo en las entradas del 19/11: "Feedlots", "Peso promedio y precio por categoría" y "Columna Valor".
- `docs/superpowers/prompts/2026-11-19-feedlots.md`: el encargo anterior, que ya está hecho y publicado.
- **El código del feedlot:**
  - `server/src/pecuaria/feedlot.service.js` (`analisisFeedlot`, `feedlotsTodos`);
  - `server/src/pecuaria/resumen.service.js`;
  - `client/src/components/FeedlotAnalisis.jsx`;
  - `client/src/components/ResumenCampo.jsx` (`TablaResumen`, la columna Valor);
  - `client/src/pages/pecuaria/ResumenPage.jsx`.
- **Las salidas:** `server/src/pecuaria/entradas-salidas.service.js` (modo SALIDA, tipo VENTA con `pideGuia`) y `client/src/pages/RegistrarPage.jsx`.

Seguí el estilo que ya existe: comentarios en español, textos de la UI en voseo, zod, y tests con Vitest + supertest contra PostgreSQL real.

## Qué hay que hacer

### 1. La tabla de categorías del feedlot, por etapas del encierre

- **Dónde:** en el Resumen de un feedlot o de "Todos los feedlots", la tabla de categorías (`TablaResumen`).
- **Columnas:** en vez de CN / Verdeos / Corral, van las etapas según los días de encierre de cada lote (hoy − `fechaEntrada`):
  - **Adaptación:** de 0 a `FEEDLOT_ADAPTACION_DIAS` (20).
  - **Engorde:** hasta `FEEDLOT_ENGORDE_DIAS` (90).
  - **Terminación:** hasta `CICLO_FEEDLOT_DIAS` (120, el que ya existe).
  - **Para salir:** más del ciclo.
  - **Sin fecha:** si el lote no tiene fecha de entrada. Solo aparece si hay alguno.
- **Además:** la columna **Valor USD** (la que ya existe, entre las etapas y el Total) y el **Total**.
- **Parámetros nuevos:** `FEEDLOT_ADAPTACION_DIAS` y `FEEDLOT_ENGORDE_DIAS` van en el seed como valores genéricos. Se editan en Configuración → Feedlot y se validan: adaptación < engorde < ciclo.
- **Servidor:** el resumen de un grupo de feedlots devuelve las filas con esas columnas.
  - El cálculo de la etapa va en una función pura testeable, por ejemplo `etapaDeEncierre(dias, parametros)`.
  - **El valor de esta tabla usa el peso estimado de hoy**, el mismo que el análisis por corral. Así la tabla y el cuadro "Valor del ganado" del feedlot dan lo mismo. Hoy dan distinto: USD 3,05 M contra 4,46 M en Render.
- **Front:** los títulos de las columnas salen de lo que manda el servidor. Para las estancias no cambia nada: CN / Verdeos / Corral.
- **En el celular (375 px):** si no entran cuatro etapas, más Valor y Total, juntá "Adaptación" con "Engorde" en una columna "Hasta 90 d" solo en el celular. En la compu van separadas. Usá el mismo truco que ya existe: `hidden md:table-cell` y una segunda línea.

### 2. Separar los atrasados de los próximos

- **Hoy** `salenEn30` cuenta también las salidas que ya pasaron. En Render son 15 de 19 corrales.
- **Separalo en dos:**
  - `atrasados`: la salida probable ya pasó;
  - `proximos`: sale entre hoy y hoy + 30 días.
- **En la tabla por corral:**
  - un corral atrasado muestra "atrasado N d" en ámbar fuerte;
  - un corral que sale en los próximos 7 días, en ámbar suave (como ahora).
- **En los totales de arriba:** "N atrasados" y "N salen en 30 días", por separado.

### 3. Precio de venta real en las salidas

- **Migración nueva:** en `movimiento`, `precio_venta_usd` (Decimal 12,2, opcional) y `precio_venta_por` (el enum `PrecioPor` que ya existe: KG o CABEZA).
- **Al registrar una salida de tipo VENTA** (`RegistrarPage` y `entradas-salidas.service.js`), campos opcionales en dólares:
  - **peso de salida**: el `pesoPromedioKg` que ya existe;
  - **precio de venta**: USD por kilo o por cabeza.
- **Se valida y se guarda.** El valor real es:
  - por kilo: cabezas × peso × precio;
  - por cabeza: cabezas × precio.
- **Auditoría:** el detalle de la auditoría lo incluye.
- **Lista de Movimientos:** una venta con precio muestra el valor en dólares, en la segunda línea en el celular y en la columna de detalle en la compu. Mirá cómo se arma el texto en `MovimientosLista.jsx`.
- **Análisis del feedlot:** una sección **"Últimas ventas"** con las ventas que salieron de los corrales del feedlot en los últimos 90 días, cada una con:
  - fecha, corral, categoría y cabezas;
  - peso real y peso estimado a esa fecha (entrada + días × GMD), con la diferencia;
  - precio, y valor real en USD.
  - Si falta un dato, va "—".
- **Revertir una venta** sigue funcionando igual.

## Reglas

- **Tests de todo lo nuevo:**
  - `etapaDeEncierre`, atrasados y próximos con fechas fijas;
  - el resumen del feedlot por etapas, y que el de estancias no cambie;
  - la venta con precio: validación, guardado, auditoría y reversión;
  - "Últimas ventas";
  - en el front: los títulos por etapa, los atrasados y el campo de precio.
- **Migraciones:** con `npx prisma migrate dev --name ...` y `npm run db:generate`. **Nunca** `migrate reset`, `db push --force-reset` ni `--accept-data-loss`.
- **Corré las dos suites completas al final, una sola vez cada una y nunca dos a la vez**, desde `C:\dev\sapsa-app\server` y `C:\dev\sapsa-app\client`, con C mayúscula. Corré también `npx vite build` en `client`.
- **Sin commits ni push.** No toques Render ni su base.
- **Confidencialidad:** solo datos ficticios en el código, el seed y los tests. No leas `.env`.
- **No levantes servidores de desarrollo.**
- **Al terminar:**
  - Escribí el plan corto que seguiste en `docs/superpowers/plans/2026-11-20-feedlot-etapas-y-ventas.md`.
  - **Actualizá `CLAUDE.md`:** una entrada nueva al final de la lista del módulo Pecuaria, en el mismo formato de viñetas cortas que las del 19/11.

## Lo que contestás al final

Un informe corto en español:
1. Qué hiciste, por punto.
2. Los archivos tocados.
3. Los tests: cuántos y si pasan las dos suites.
4. Lo que Diego tiene que decidir.
5. Lo que no pudiste hacer.
