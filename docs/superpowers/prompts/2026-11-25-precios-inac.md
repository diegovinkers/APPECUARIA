# Prompt: precios de hacienda de INAC, automáticos cada semana, con API interna

> Lo armó Claude a pedido de Diego (25/11/2026). Lo ejecuta Claude Code en esta carpeta, por fases.

---

## Tu rol

Sos el desarrollador full-stack de `C:\dev\sapsa-app` y cuidás que la app sea simple en el celular (375 px). Antes de tocar nada, leé:
- `CLAUDE.md` entero.
- `docs/superpowers/specs/2026-11-19-peso-y-precio-por-categoria-design.md` (cómo guarda hoy la app el precio por categoría).
- `docs/info santi/precios-mercado-11-2026.mjs` y `pesos-precios-categorias.mjs` (cómo se cargaron precios a mano hasta ahora).

## Lo que pide Diego

Que la app tenga los **precios de hacienda de INAC** de cada semana **sin cargarlos a mano**. Un proceso los baja una vez por semana, los valida, los guarda con su historial y los expone con una **API interna nuestra**. Siempre se pueden corregir a mano.

**Solo para uso interno de SAPSA.** No se abre la API a terceros ni se revenden los datos. En la pantalla, cada precio dice de dónde sale: "Fuente: INAC · semana del 10/05 al 16/05".

**ACG no se usa:** sus términos prohíben herramientas automatizadas y aplicaciones que incorporen sus datos.

## La fuente

1. **Principal: la serie semanal en Excel de INAC.**
   - Página: `https://www.inac.uy/innovaportal/v/5541/37/innova.bs/precios` ("Serie semanal precios de hacienda").
   - Archivo hoy: `https://www.inac.uy/innovaportal/file/10952/1/webinac---serie-semanal-precios-de-hacienda.xlsx`.
   - **No hardcodees solo la URL del archivo:** otros archivos de esa página llevan la fecha en el nombre (`serie-rhe-14-11-2026.xlsx`). Primero leé la página, buscá el enlace por su título y, si no lo encontrás, usá la URL conocida.
2. **Respaldo: el informe semanal en PDF** (`https://www.inac.uy/innovaportal/file/17275/1/precios-de-hacienda-bovina-y-ovina.pdf`).
   - Ojo: el 25/11/2026 ese PDF decía "Informe actualizado el 20/05/2026". Puede que esa URL ya no se actualice: verificalo.
   - Es un export de Power BI: el texto sale **desordenado y con la tabla de bovinos repetida**. No sirve para un parser de reglas fijas; solo sirve como entrada para Claude (paso 3 de la extracción).
3. **INAC publica los miércoles** las operaciones de domingo a sábado de la semana anterior.

### Lo que trae el informe (para entender los indicadores)

Bovinos (USD/kg), con valor de la semana, la anterior y la variación:
- **Novillo:** en pie · Campo 4ta bza. · en 4ta bza. · 45 días a levantar · Campo 45 días a levantar.
- **Vaca:** en pie · en 4ta bza. · 45 días a levantar.
- **Vaquillona:** en pie · Campo 4ta bza. · en 4ta bza. · 45 días a levantar · Campo 45 días a levantar.
- Además, por categoría: cabezas, kilos en 4ta balanza, mediana, moda, desvío y coeficiente de variación.

Ovinos (USD/kg en gancho): cordero en gancho, cordero campo, cordero campo 30 días a levantar, oveja en gancho.

Definiciones (de la ficha técnica del informe; ponelas como ayuda en la pantalla):
- Promedio ponderado por kilos. Novillo gordo de más de 380 kg y vaca de más de 370 kg en pie, razas carniceras y cruzas; vaquillona sin filtro de peso.
- "Valor contado": deflactado por el plazo de pago con la tasa BROU para la industria frigorífica.
- "A levantar": sin flete. "Campo": sin animales de corral (según SNIG).
- "45 días a levantar": valor corriente, sin flete, a 45 días.

## Lo que hay que construir

### 1. Modelo (una migración, `precios_mercado`)
- **`PrecioMercado`:** `id`, `fuente` (enum: `INAC`, `MANUAL`; dejá lugar para `REMATE` más adelante), `indicador` (texto con clave estable, ej. `NOVILLO_PIE`, `NOVILLO_4TA`, `NOVILLO_CAMPO_4TA`, `NOVILLO_45D`, `NOVILLO_CAMPO_45D`, `VACA_PIE`, `VACA_4TA`, `VACA_45D`, `VAQUILLONA_PIE`, `VAQUILLONA_CAMPO_4TA`, `VAQUILLONA_4TA`, `VAQUILLONA_45D`, `VAQUILLONA_CAMPO_45D`, `CORDERO_GANCHO`, `OVEJA_GANCHO`), `semanaDesde`, `semanaHasta`, `valor` (Decimal), `unidad` (`USD_KG_PIE`, `USD_KG_4TA`, `USD_KG_GANCHO`), `cabezas` (opcional), `origen` (`EXCEL` · `PDF` · `CLAUDE` · `MANUAL`), `importacionId`, `corregidoPorId`, `nota`, `creadoEn`, `actualizadoEn`.
  - Único por (`fuente`, `indicador`, `semanaDesde`).
- **`ImportacionPrecio`** (el registro de cada corrida): `id`, `fuente`, `inicio`, `fin`, `estado` (`OK` · `SIN_CAMBIOS` · `EN_REVISION` · `ERROR`), `origen`, `semana`, `hashArchivo`, `detalle` (Json: qué se leyó, qué falló, avisos), `disparadoPor` (`PROGRAMADO` · `AL_ABRIR` · `BOTON` + usuario).
- Los nombres y las claves de los indicadores van en un solo archivo (`server/src/pecuaria/precios.indicadores.js`), con su nombre para mostrar, unidad, grupo (Novillo · Vaca · Vaquillona · Ovinos) y el texto de INAC con que se reconocen (normalizado con `normalizarTexto`).

### 2. Extracción (en `server/src/pecuaria/precios.inac.js`, lo que se pueda en funciones puras)
1. **Excel con `exceljs`** (ya es dependencia). Leé la última semana (y, la primera vez, todo el histórico que traiga la serie). Es el camino normal.
2. **Si el Excel falla** (no baja, cambió la estructura, no está la semana): el PDF.
3. **Claude de respaldo** (`@anthropic-ai/sdk`, modelo Haiku): se le manda el PDF (o el Excel convertido a CSV) y se le pide un JSON con la semana y los indicadores. La respuesta se valida con zod. **Si no hay `ANTHROPIC_API_KEY`, este paso se salta** y la importación queda en `ERROR` con un mensaje claro.
- Bajá los archivos con el `fetch` de Node 24, con timeout y User-Agent propio: `SAPSA-app (uso interno; contacto: <email de Diego>)`. **Una sola descarga por corrida**, sin reintentos agresivos.
- **Idempotente:** si el hash del archivo es el de la última corrida OK, queda `SIN_CAMBIOS` y no se toca nada.

### 3. Validación (pura, con tests)
- Cada valor en su rango razonable según la unidad (configurable en un solo lugar; por ejemplo, en pie entre 1 y 6 USD/kg, en 4ta balanza o en gancho entre 2 y 12).
- `semanaHasta` = `semanaDesde` + 6 días, y no en el futuro.
- Variación contra la semana anterior: más de 15 % en un indicador lo marca. **Si hay algo marcado, la importación queda `EN_REVISION`**: los precios se guardan pero no se publican hasta que alguien con `pecuaria:CREAR` los apruebe en la pantalla.
- Tienen que estar al menos novillo, vaca y vaquillona en 4ta balanza; si faltan, es `ERROR`.

### 4. Cuándo corre (el servicio está en el plan gratis de Render: se duerme)
Un reloj dentro del servidor (tipo `node-cron`) **no sirve** en el plan gratis. Hacé las tres cosas:
1. **GitHub Actions** (`.github/workflows/precios-inac.yml`): los jueves a las 12:00 de Uruguay (15:00 UTC), y de nuevo el viernes por si INAC publicó tarde.
   - Primero llama a `/health` para despertar el servicio y espera a que conteste.
   - Después `POST /api/pecuaria/precios/actualizar` con el encabezado `Authorization: Bearer <PRECIOS_TOKEN>`.
   - El token es un secreto del repo y una variable de Render (`sync: false` en `render.yaml`).
   - Confirmá con Diego que el repo está en GitHub y que se puede agregar el secreto.
2. **Al abrir:** si alguien entra a la pantalla de precios y la última importación OK tiene más de 8 días, se dispara una en segundo plano (no más de una cada 6 horas).
3. **Botón "Actualizar ahora"** en la pantalla (con `pecuaria:CREAR`).
- Dos corridas a la vez no pueden pisarse: bloqueo en la base (advisory lock o una fila de `ImportacionPrecio` en curso).

### 5. API interna (bajo `/api/pecuaria`, con los permisos de siempre)
| Ruta | Permiso |
|---|---|
| `GET /precios?indicador=&desde=&hasta=&fuente=` (historial) | VER |
| `GET /precios/ultimos` (la última semana publicada, con la anterior y la variación) | VER |
| `GET /precios/importaciones` (las últimas corridas, con su estado) | VER |
| `POST /precios/actualizar` (botón, o GitHub con el token) | CREAR o token |
| `POST /precios/importaciones/:id/aprobar` (lo que quedó en revisión) | CREAR |
| `PATCH /precios/:id` (corregir un valor, con nota obligatoria) y `POST /precios` (cargar uno a mano) | CREAR |

- Auditoría: `PRECIOS_IMPORTADOS`, `PRECIOS_APROBADOS`, `PRECIO_CORREGIDO`, `PRECIO_CARGADO`.
- La ruta con token no sirve para nada más: solo dispara la importación.

### 6. Pantalla: Configuración → Precios de mercado
- **Arriba:** "Última semana: 10/05 al 16/05 · Fuente: INAC · actualizado el jueves 20/05" y el estado de la última corrida (OK, en revisión con el botón **Revisar**, o error con el mensaje).
- **Tabla:** por grupo (Novillo, Vaca, Vaquillona, Ovinos), indicador · esta semana · anterior · variación. Lo corregido a mano lleva una marca.
- **Historial:** elegís un indicador y ves las últimas semanas (tabla; si ya hay un componente de gráfico en la app, usalo).
- **Ayuda** con las definiciones de INAC (valor contado, a levantar, campo, 45 días).
- En el celular, 3 líneas por fila, igual que las otras listas.

### 7. Lo que queda para después (no lo hagas sin preguntar)
- **Unir estos precios con el precio por categoría de la app** (el diseño del 19/11): por ejemplo, que "Vacas invernar" tome un valor. INAC da precios de **ganado gordo**, no de reposición, así que eso lo tiene que decidir Diego. Dejá preparada una tabla o función de mapeo vacía, y nada más.
- **Precios de remates por pantalla** (Plaza Rural, Lote 21) para la reposición: antes hay que revisar sus términos de uso.

## Fases (parar al final de cada una y mostrarle a Diego)

0. **Reconocer la fuente.**
   - Bajá el Excel y el PDF.
   - Documentá en `docs/PRECIOS_INAC.md`: hojas, encabezados, dónde empiezan los datos, cómo viene la semana, unidades, hasta qué semana llega, y si el PDF está al día.
   - Guardá copias como fixtures en `server/test/fixtures/inac/`.
   - **Parar y mostrar.** Si el Excel no trae algún indicador del informe, decilo antes de seguir.
1. **Modelo y cuentas puras:** la migración, `precios.indicadores.js`, el lector del Excel y la validación. Tests con los fixtures (incluido un Excel "roto" a mano y una semana con una variación grande).
2. **Importación y API:** el PDF y Claude de respaldo (testeado con el cliente de Anthropic simulado), el bloqueo, las rutas, la auditoría y el `render.yaml` con las variables nuevas (`PRECIOS_TOKEN`, `ANTHROPIC_API_KEY`).
   - Tests con supertest: la ruta con token, sin token, `SIN_CAMBIOS`, `EN_REVISION` y aprobar, la corrección manual.
3. **Pantalla y GitHub Actions:** la pantalla con sus tests, el workflow, `npx vite build` y revisión a 375 px.
4. **Documentación:** `CLAUDE.md` y `docs/PRECIOS_INAC.md` al día (cómo se agrega una fuente, qué hacer si INAC cambia el Excel).

## Cómo se termina cada fase

- Pasan los tests nuevos y los de pecuaria del servidor y del front (corrélos por separado: la PC está lenta).
- Actualizá el estado en `CLAUDE.md`.
- Parar y mostrarle a Diego qué cambió. Sin commit hasta que lo pida.

## Para Diego (no frenan las fases)
1. El email de contacto para el User-Agent.
2. ¿El repo está en GitHub? (para el workflow y el secreto).
3. Conviene mandarle un mail a INAC contando el uso (interno, una descarga por semana, citando la fuente) y preguntando si tienen un formato o una dirección recomendada.
