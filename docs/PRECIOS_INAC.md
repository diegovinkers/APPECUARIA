# Precios de hacienda de INAC

Ficha técnica de la fuente. Encargo: `docs/superpowers/prompts/2026-11-25-precios-inac.md`.
Reconocida el 25/11/2026 (fase 0). Copias en `server/test/fixtures/inac/`.

Uso **solo interno** de SAPSA. Cada precio se muestra con su fuente: "Fuente: INAC · semana del 15/11 al 21/11".

## 1. Dónde está

- **Página:** `https://www.inac.uy/innovaportal/v/5541/37/innova.bs/precios`.
- **Excel semanal (fuente principal):** `https://www.inac.uy/innovaportal/file/10952/1/webinac---serie-semanal-precios-de-hacienda.xlsx` (1,1 MB).
  - En la página, el enlace no tiene texto propio: el título está **adentro** del `<a>`, en un `<h5 class="list-title">Serie semanal precios de hacienda</h5>`, con la descripción "Evolución semanal de precios de hacienda gorda… (Archivo Excel)".
  - Para encontrarlo: buscar el `<a href="….xlsx">` cuyo contenido tiene ese título. Si no aparece, usar la URL conocida.
  - Ojo con el vecino: "Serie **mensual** precios de hacienda" (`file/10953/…`) tiene casi el mismo nombre.
- **Informe en PDF (respaldo):** `https://www.inac.uy/innovaportal/file/17274/1/precios-de-hacienda-bovina-y-ovina.pdf` (1,4 MB, 10 páginas).
  - **La URL del encargo (`file/17275/…`) da 404.** La buena es `file/17274/…`; se encuentra en la página `https://www.inac.uy/innovaportal/v/17274/37/innova.bs/precios-de-hacienda-bovinos-y-ovinos`.
  - **Está al día:** el 25/11/2026 decía "Informe actualizado el 25/11/2026" y "Semana actual: del 15/11/2026 al 21/11/2026" (la misma semana que el Excel).
- Las dos descargas contestan rápido, sin pedir nada especial. El servidor no manda `Last-Modified` ni `ETag`: para saber si cambió, hay que bajar el archivo y comparar el hash.

## 2. El Excel

Cinco hojas visibles: `NOVILLO`, `VACA`, `VAQUILLONA`, `CORDERO` y `OVEJA`. Sin fórmulas en los datos: todo son valores.

### Encabezados

| Hoja | Títulos | Primera fila de datos | Desde | Hasta (25/11) |
|---|---|---|---|---|
| NOVILLO | filas 10 a 13 | 14 | 02/01/2000 | 15/11–21/11/2026 (fila 1413) |
| VACA | filas 10 a 13 | 14 | 02/01/2000 | 15/11–21/11/2026 (fila 1413) |
| VAQUILLONA | filas 10 a 13 | 14 | 02/01/2000 | 15/11–21/11/2026 (fila 1413) |
| CORDERO | filas 8 a 10 | 11 | 20/09/2009 | 15/11–21/11/2026 (fila 906) |
| OVEJA | filas 8 a 10 | 11 | 29/12/2013 | 15/11–21/11/2026 (fila 683) |

- En los bovinos hay **tres renglones de títulos combinados** (fila 10: "VALORES CONTADO - PUESTO EN FRIGORIFICO" / "VALORES CORRIENTES - 45 DÍAS"; fila 11: "EN PIE", "EN CUARTA BALANZA", "A CAMPO", "A LEVANTAR", "CAMPO A LEVANTAR"…; fila 12: "USD/kg", "% participación", "% rendimiento") y una **cuarta fila con nombres cortos** (fila 13: `Pie-Contado-Puesto-USD/kg`…).
- **La fila de nombres cortos está mal:** a "A CAMPO" le pone `Cuarta-corriente45-ALevantar-USD/kg`, y en NOVILLO y VAQUILLONA las columnas 17 a 19 no tienen nombre. **El lector tiene que reconocer las columnas por las filas 10 + 11 + 12 juntas**, no por la fila corta.
- En los ovinos, lo mismo con las filas 8 + 9 (la 10 es la corta).

### Columnas de cada semana

- A: `Sem_Inicio` (domingo), B: `Sem_Fin` (sábado), C: año (solo en la primera semana del año), D: mes, E: número de semana. Las fechas vienen como fecha de Excel (formato `mm-dd-yy`).
- Valores en USD/kg con 3 decimales (los ovinos, con todos los decimales). Los "% participación" y "% rendimiento" no se guardan por ahora.

### Qué columna es cada indicador

Comparado con el PDF de la misma semana (15/11–21/11/2026): coinciden todos.

| Indicador | Hoja | Col. | Títulos (fila 10 / 11 / 12) | Unidad | 15–21/11 |
|---|---|---|---|---|---|
| `NOVILLO_PIE` | NOVILLO | F (6) | Contado / En pie / USD/kg | USD/kg en pie | 3,412 |
| `NOVILLO_4TA` | NOVILLO | J (10) | Contado / En cuarta balanza / USD/kg | USD/kg 4ta bza. | 6,135 |
| `NOVILLO_CAMPO_4TA` | NOVILLO | M (13) | Contado / A campo / USD/kg | USD/kg 4ta bza. | 6,099 |
| `NOVILLO_45D` | NOVILLO | Q (17) | Corrientes 45 d / A levantar / USD/kg | USD/kg 4ta bza. | 6,142 |
| `NOVILLO_CAMPO_45D` | NOVILLO | T (20) | Corrientes 45 d / Campo a levantar / USD/kg | USD/kg 4ta bza. | 6,088 |
| `VACA_PIE` | VACA | F (6) | Contado / En pie | USD/kg en pie | 2,929 |
| `VACA_4TA` | VACA | J (10) | Contado / En cuarta balanza | USD/kg 4ta bza. | 5,698 |
| `VACA_45D` | VACA | O (15) | Corrientes 45 d / A levantar | USD/kg 4ta bza. | 5,661 |
| `VAQUILLONA_PIE` | VAQUILLONA | F (6) | Contado / En pie | USD/kg en pie | 3,298 |
| `VAQUILLONA_4TA` | VAQUILLONA | J (10) | Contado / En cuarta balanza | USD/kg 4ta bza. | 5,986 |
| `VAQUILLONA_CAMPO_4TA` | VAQUILLONA | M (13) | Contado / A campo | USD/kg 4ta bza. | 5,956 |
| `VAQUILLONA_45D` | VAQUILLONA | Q (17) | Corrientes 45 d / A levantar | USD/kg 4ta bza. | 5,967 |
| `VAQUILLONA_CAMPO_45D` | VAQUILLONA | T (20) | Corrientes 45 d / Campo a levantar | USD/kg 4ta bza. | 5,944 |
| `CORDERO_GANCHO` | CORDERO | F (6) | Contado / En gancho | USD/kg gancho | 6,691 |
| `CORDERO_CAMPO` (propuesto) | CORDERO | I (9) | Contado / A campo | USD/kg gancho | 6,691 |
| `CORDERO_CAMPO_30D` (propuesto) | CORDERO | K (11) | Corrientes 30 d / Campo a levantar | USD/kg gancho | 6,573 |
| `OVEJA_GANCHO` | OVEJA | F (6) | Contado / En gancho | USD/kg gancho | 5,599 |

- **Vaca no tiene "a campo"** (ni 4ta ni 45 días), igual que en el PDF.
- El Excel trae además lo que el PDF no muestra: el precio **en pre-dressing** y el de **45 días puesto en frigorífico** (NOVILLO O, VACA M, VAQUILLONA O). No están en la lista del encargo; quedan fuera salvo que Diego los quiera.
- Desde cuándo hay dato en cada columna: en pie y 4ta balanza desde 2000; 45 días desde 2005; "a campo" desde 2017 (vaca, 45 días a levantar desde 2017); cordero a campo desde 2018 y a 30 días desde 2021; oveja desde 2017 (las semanas de 2014 a 2016 están vacías).

### Rarezas que el lector tiene que aguantar

- **Una fecha escrita como texto e imposible:** NOVILLO fila 1111, `Sem_Inicio` = `"31/02/2021"` (la semana real es 31/01 al 06/02/2021). Regla: si `Sem_Inicio` no es una fecha, usar `Sem_Fin` − 6 días.
- **Semanas que faltan o que no duran 7 días** (todas viejas): 2000-10-29 → 2000-11-03 (semana de 3 días), 2000-11-26 → 2000-12-10, 2001-04-22 → 2001-05-20, y en NOVILLO 2021-01-24 → 2021-02-07 por la fecha mala. En OVEJA, la semana del 07/11/2021 no termina a los 6 días. Al leer el histórico, estas semanas se guardan igual (o se saltean con un aviso), sin frenar la importación.
- **Basura después de la última semana:** en NOVILLO, la fila 1414 tiene espacios en la columna B. La tabla termina en la primera fila sin fecha en A **y** sin valores.
- **Columnas sin título en OVEJA** (desde la I hasta más allá de la AH): restos de copias, con fechas repetidas y valores sueltos. Se ignoran: en OVEJA solo valen A a H.
- VAQUILLONA, CORDERO y OVEJA dicen tener 16.383–16.384 columnas (formato vacío hasta el final). No afecta, pero no hay que recorrer columnas hasta `columnCount`.
- **Precios viejos fuera de rango:** en 2000 el novillo en pie valía 0,715 USD/kg. El control de rangos del encargo (en pie entre 1 y 6) **no se puede aplicar al histórico**: solo a las semanas nuevas.

## 3. El PDF

- Export de Power BI, 10 páginas: Bovinos (p. 2–3), Ovinos (p. 4–5), evolución semanal por indicador y por año, acumulados por período y la ficha técnica.
- Con `pdftotext -layout` el texto sale **desordenado**: los nombres de los indicadores y los números quedan corridos (por ejemplo, "Novillo en pie 6,099", cuando 6,099 es el novillo campo 4ta bza.). Confirma lo del encargo: no sirve para un lector de reglas fijas; solo como entrada para Claude.
- Lo único que se lee bien con reglas: "Informe actualizado el dd/mm/aaaa" y "Semana actual: del dd/mm/aaaa al dd/mm/aaaa". Sirve para saber si el PDF trae una semana más nueva que el Excel.
- Decimales con coma y miles con punto ("6.378.221").

## 4. Lo que el informe tiene y el Excel no

- **Cabezas, kilos en 4ta balanza, mediana, moda, desvío y coeficiente de variación:** el Excel semanal **no los trae**. El PDF los muestra solo para la categoría elegida en el filtro (en el export: "Nov en 4ta Bza.", 20.636 cabezas, 6.378.221 kilos; ovinos: "Cordero en gancho", 13.435 cabezas, 246.291 kg).
  - Consecuencia: `PrecioMercado.cabezas` queda vacío con el Excel. Solo se podría llenar desde el PDF (vía Claude) y solo para esas dos categorías.
  - La página de INAC tiene otro archivo, "Serie de distribución de frecuencia" (`file/13413/…`), que podría traer la dispersión. No se revisó.
- Todos los **precios** del informe sí están en el Excel.

## 5. Cuándo publica

- El 25/11/2026 (miércoles) los dos archivos ya traían la semana del 15/11 al 21/11. Coincide con "los miércoles, la semana de domingo a sábado anterior".

## 6. Cómo está armado en la app (fase 1)

- **Modelo** (migración `precios_mercado`):
  - `PrecioMercado`: un precio por (fuente, indicador, semana). Tiene `publicado` (false mientras su importación está en revisión).
  - `ImportacionPrecio`: cada corrida. **Una sola `EN_CURSO` por fuente**, por un índice único parcial (`importacion_precio_una_en_curso`). Es el bloqueo entre corridas: la segunda falla al crear su fila. Si una corrida se corta y queda `EN_CURSO`, la fase 2 la tiene que dar por vencida.
- **`server/src/pecuaria/precios.indicadores.js`:** los 17 indicadores (clave, nombre, grupo, unidad, cómo se reconocen en el Excel y en el informe), los rangos por unidad, la variación máxima (15 %) y el mapeo con las categorías de la app (vacío a propósito).
- **`precios.inac.js`:** `leerSerieInac(buffer)` → `{ semanas, columnas, errores, avisos }`. Reconoce las hojas por nombre y las columnas por los títulos: el bloque (primera fila: "contado" / "corrientes"), la columna (segunda fila: "en pie", "a campo"…), alguna fila con "USD/kg" y ninguna con "%". Si una columna no aparece o aparece dos veces, es un error con el nombre del precio. También `hashArchivo` y `sumarDias`.
- **`precios.validacion.js`:** `validarSemana({ semana, anterior, hoy })` → `{ estado: OK | EN_REVISION | ERROR, errores, marcas, avisos }`, y `variacion(actual, anterior)` en %.
  - ERROR: fechas mal, semana que no dura 7 días o que no terminó, o falta novillo, vaca o vaquillona en 4ta balanza.
  - EN_REVISION: un precio fuera del rango de su unidad o que varió más de 15 %.
- **Tests:** `precios-inac.test.js` (el Excel real, uno roto a mano y series chicas de `precios-fixture.js`), `precios-validacion.test.js` y `precios-modelo.test.js`.
- **Trampa:** exceljs se queda sin memoria al **volver a guardar** el Excel real, porque tres hojas dicen tener 16.384 columnas. Leerlo anda bien: 2,3 s y unos 150 MB.

## 7. Si INAC cambia el Excel

- Columna renombrada o movida: si los títulos siguen diciendo lo mismo, no pasa nada (se busca por título). Si cambian, la importación da ERROR con "No encontré la columna de …". Corregí `bloque` / `columna` de ese indicador en `precios.indicadores.js` y sumá un test con una serie chica que tenga el título nuevo.
- Hoja renombrada: `excel.hoja` en el mismo archivo.
- Archivo nuevo en la página: el enlace se busca por el título "Serie semanal precios de hacienda".
