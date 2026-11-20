# Plan: feedlot por etapas, atrasados y precio de venta real (20/11/2026)

Encargo: `docs/superpowers/prompts/2026-11-20-feedlot-etapas-y-ventas.md`.

## 1. Categorías del feedlot por etapa del encierre

- [x] `feedlot.service.js`: `etapaDeEncierre(dias, { adaptacionDias, engordeDias, cicloDias })` (pura; límites inclusive: 20 → Adaptación, 21 → Engorde, 121 → Para salir; sin días → SIN_FECHA), `problemaEtapas`, `columnasEtapas` y `resumenPorEtapas(analisis, etapas)`.
- [x] La tabla sale de las filas de `analisisFeedlot`: el valor es el del peso estimado de hoy, igual que el análisis por corral.
- [x] `resumen.service.js`: `resumenCampo` de un CONFINAMIENTO y `resumenTodas(filtro, 'feedlots')` devuelven la tabla por etapas (`tipo: 'FEEDLOT'`, `columnas`, `etapas`, `porGrupo: []`). Las estancias suman `tipo: 'ESTANCIA'` y `columnas` (CN / Verdeos / Corral / Otro); lo demás no cambia.
- [x] Seed: `FEEDLOT_ADAPTACION_DIAS` (20) y `FEEDLOT_ENGORDE_DIAS` (90). Validación adaptación < engorde < ciclo en `PUT /parametros/:clave` y en el nuevo `PUT /parametros` (varios juntos, todo o nada).
- [x] Front: `TablaResumen` arma las columnas con lo que manda el servidor (`columnasDe`, `valorColumna`); `compu` / `celular` / `suma` para juntar Adaptación + Engorde en "Hasta 90 d" solo en el celular. Leyenda de etapas, sin "Carga por grupo". `ResumenFeedlot` pide el análisis y el resumen.
- [x] Configuración → Feedlot: los cuatro valores, guardados juntos (`setParametros`), con aviso si las etapas no van en orden.

## 2. Atrasados y próximos

- [x] `analisisFeedlot`: cada fila trae `atrasado` (la salida ya pasó) y `salidaCerca` (0 a 6 días). Totales `atrasados` y `proximos` (de hoy a hoy + 30, sin los atrasados), por corral. Se sacó `salenEn30`.
- [x] `FeedlotAnalisis.jsx`: "N atrasados" y "N salen en 30 días"; la salida atrasada dice "atrasado N d" en ámbar fuerte.

## 3. Precio de venta real

- [x] Migración `precio_de_venta`: `movimiento.precio_venta_usd` (Decimal 12,2) y `precio_venta_por` (`PrecioPor`).
- [x] `entradas-salidas.service.js`: `precioDeVenta` (solo VENTA; pide "por"; por kilo pide el peso de salida). Se guarda, la vista previa trae `valorVentaUsd`, la auditoría lo incluye.
- [x] `calculos.js`: `valorVenta` (por kilo: cabezas × peso × precio; por cabeza: cabezas × precio).
- [x] `aItems` (lista de movimientos): `precioVentaUsd`, `precioVentaPor`, `valorVentaUsd`. La reversión no cambia.
- [x] Análisis del feedlot: `ventas` (últimos 90 días, sin revertidas, de los corrales), con `ventaConEstimado` (pura): peso estimado a la fecha de la venta y la diferencia.
- [x] Front: `PrecioVenta.jsx` en `RegistrarPage` (solo VENTA), el valor en la lista de Movimientos (`textoVenta`) y en el historial, y la sección "Últimas ventas".

## Tests

- Servidor: `pecuaria-feedlot-etapas.test.js` (nuevo) y `pecuaria-feedlot.test.js` (actualizado: atrasados / próximos y el resumen por etapas).
- Front: `FeedlotEtapasVentas.test.jsx` (nuevo), `FeedlotAnalisis.test.jsx` y `ConfiguracionPecuariaPage.test.js`.
