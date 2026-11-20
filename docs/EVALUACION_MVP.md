# Evaluación de la app y camino para cerrar el MVP

Hecha el 20/11/2026 a pedido de Diego. Encargo: `docs/superpowers/prompts/2026-11-20-evaluacion-mvp.md`.

- **Cómo se hizo:** solo leyendo `CLAUDE.md`, los documentos de `docs/`, el schema, el código del servidor y del front, `render.yaml` y los tests. No se corrió nada ni se tocó la base.
- **Qué se tomó como hecho:** lo que programa en paralelo el otro agente (feedlot por etapas, atrasados contra próximos y precio de venta real; ver `docs/superpowers/prompts/2026-11-20-feedlot-etapas-y-ventas.md`).
- **Los números de línea** (`archivo:línea`) son los del código al 20/11, antes de los cambios de ese agente. En `entradas-salidas.service.js`, `RegistrarPage.jsx`, `FeedlotAnalisis.jsx` y `ResumenCampo.jsx` pueden correrse unas líneas.
- **Los costos de Render** son aproximados. Salen de la página de Render del 20/11/2026: confirmalos en render.com/pricing antes de pagar.

---

## 1. Resumen en 10 renglones

1. **Lo que está bien:**
   - La base es sólida: login, roles, alcance por estancia y auditoría.
   - El stock por potrero y por lote nunca se pisa: cada cambio es una versión nueva.
   - La vista previa muestra exactamente lo que después se guarda.
   - Hay 341 tests en el servidor y 115 en el front.
2. **Lo que ya se puede hacer de punta a punta:** mirar el stock de las 6 estancias y los 2 feedlots (unas 13.350 cabezas), mover, mover entre campos, el movimiento múltiple, entradas, salidas, cambios de categoría, correcciones y revertir.
3. **Lo más urgente: la base gratis de Render vence el 17/12/2026.**
   - Después de esa fecha queda inaccesible.
   - El 31/12 Render la borra, con todos los datos.
   - Hoy no tiene ninguna copia de seguridad: el plan gratis no hace backups.
4. **También urgente:** la clave de la base quedó escrita en un chat y en un .txt que se sincroniza con Drive. Hay que cambiarla.
5. **El mayor riesgo para los datos es tener dos fuentes:** la planilla del encargado y la app.
   - Importar una planilla después de haber movido animales en la app puede cerrar lotes que siguen teniendo animales.
   - Hay que decidir desde qué día manda la app.
6. **En el código hay 4 problemas que pueden dejar el stock mal sin que nadie lo note:**
   - el doble envío con mala señal;
   - dos personas moviendo el mismo potrero al mismo tiempo;
   - la planilla vieja importada sobre datos nuevos;
   - una corrección con fecha para atrás.
7. **Para que el encargado y el capataz la usen todos los días faltan:**
   - una sesión que no venza a los 30 minutos;
   - que lo que se está cargando no se pierda si se corta la señal o vence la sesión;
   - el recuento;
   - botones más grandes.
8. **Para el dueño faltan:**
   - un informe del período: cuántos había, cuántos entraron, cuántos salieron, cuántos hay, y lo que vale;
   - descargar a Excel.
9. **Hoja de ruta:** 8 fases chicas (sección 7). La fase 0 es de operación, va esta semana y casi no lleva código.
10. **Fuera del MVP:** el bastón dentro de cada registro, el registro por animal, trabajar sin señal de verdad (una cola que se manda sola), CIGAM, Parcelas y el asistente con IA.

---

## 2. Urgente: esta semana

Si esto no se hace, se pueden perder todos los datos de Render o la base puede quedar abierta a quien tenga la clave vieja.

### 2.1 Qué pasa con la base gratis

- **Se creó el 17/11/2026:**
  - el **17/12/2026** vence y queda inaccesible;
  - hay **14 días** para pasarla a pago;
  - el **31/12/2026** Render la borra.
- **No tiene ningún tipo de backup.** Las bases pagas sí:
  - restauración a un momento anterior: 3 días hacia atrás en el workspace Hobby, 7 días en Pro;
  - exportaciones que se guardan 7 días.
- **Costo aproximado (a confirmar en render.com/pricing):**
  - base Basic-256mb: **USD 6 por mes**;
  - base Basic-1gb: **USD 19 por mes**;
  - disco: unos **USD 0,30 por GB por mes**.
  - Para esta app alcanza la de 256 MB: hoy la base es chica.

### 2.2 El servidor gratis se duerme

- Después de **15 minutos sin uso** se apaga. La próxima vez tarda **cerca de 1 minuto** en arrancar.
  - Para alguien en el campo, eso parece "la app no anda".
- El plan Starter cuesta **unos USD 7 por mes** y no se duerme.
- **Total con los dos pagos:** unos USD 13 a 15 por mes.

### 2.3 Los pasos, en orden

| # | Qué | Quién | Cómo se ve que salió bien |
|---|---|---|---|
| 1 | **Decidir el gasto** (unos USD 13-15 por mes) y con qué tarjeta se paga. Si es una tarjeta de la empresa, conviene que el workspace `SAPSA` tenga como dueño a alguien de SAPSA. | Diego y el dueño | Hay una tarjeta cargada en el workspace `SAPSA`. |
| 2 | **Pasar `sapsa-db` a Basic-256mb** desde el panel (sapsa-db → cambiar el tipo de instancia). Hacerlo esta semana, no el 16/12. | Diego, en el panel | El panel ya no dice "Free" ni muestra la fecha de vencimiento. La app sigue entrando. |
| 3 | **Cambiar también `render.yaml`** (`plan: free` → `basic-256mb` en la base, y `starter` en el servicio). Lo hace Claude y lo commitea cuando Diego lo pida. Si no se cambia, una sincronización del Blueprint podría querer volver al plan gratis (a confirmar cómo lo maneja Render). | Claude | El Blueprint sincroniza sin cambios pendientes. |
| 4 | **Cambiar la clave de la base** desde la sección de credenciales de `sapsa-db` (a confirmar el nombre exacto en el panel). Después, un "Manual Deploy" del servicio, para que tome la conexión nueva. | Diego | Entrás a la app y ves el Resumen. |
| 5 | **Borrar el .txt con la URL** de Documentos y de la papelera de Google Drive. Revisar que en Access Control de `sapsa-db` no quede ninguna IP. | Diego | No hay ninguna IP en la lista y el archivo ya no está en Drive. |
| 6 | **Primera copia de seguridad:** desde el panel (Export, ya en el plan pago), bajar el archivo y guardarlo **fuera de Drive** (por ejemplo `C:\backups\sapsa\`). | Diego; Claude le da los pasos de a uno | Hay un archivo `.dir.tar.gz` con la fecha de hoy. |
| 7 | **Probar que la copia sirve:** restaurarla en una base local aparte (`sapsa_restore`, nunca `sapsa_dev`) y contar las cabezas. | Claude, con el archivo que le pase Diego | Da las mismas 13.350 cabezas (aprox.) que muestra Render. |
| 8 | **Pasar el servicio a Starter.** | Diego, en el panel | Abrís la app después de una hora sin uso y entra enseguida. |
| 9 | **Avisos de Render** por mail: cuando falla un deploy y cuando el servicio se cae (en Notifications del workspace). | Diego | Llega un mail de prueba, o se ve la opción activada. |
| 10 | **Regla nueva:** antes de cada push que traiga una migración, se exporta una copia. Va a la checklist de `CLAUDE.md`. | Claude la anota; Diego la cumple | La copia del día está en `C:\backups\sapsa\`. |

**Mientras no esté la fase 1:** no importar planillas nuevas en Render si ya se cargaron movimientos en la app (ver B1 en la sección 5).

---

## 3. Huecos por persona

| Persona | Qué hace en la app | Cada cuánto | ¿Lo hace de punta a punta? | Huecos |
|---|---|---|---|---|
| **Dueño** (Dirección, iPhone, solo mira) | Ver cuánto ganado hay, dónde está y cuánto vale. Feedlots: cuándo salen. | Semanal o diario, un minuto | **Sí, para mirar el día de hoy.** | Sin informe del período (entraron, salieron, ventas, muertes, cómo cambió el valor). Sin evolución en el tiempo. Sin Excel ni PDF para mandar. No ve la auditoría. La primera vez espera un minuto (servidor dormido) y entra de nuevo todos los días (sesión de 8 h). En el iPhone nadie le explicó cómo instalarla (Safari → Compartir → Agregar a inicio). Los valores usan precios supuestos o de noviembre, sin fecha a la vista. |
| **Jefe pecuario** (todas las estancias) | Revisar el stock y la carga, mirar los movimientos de todos, configurar categorías y precios, importar la planilla, revertir errores. | Diario y semanal | **Casi.** | Sin Excel. Sin avisos (datos viejos, carga alta, corrales atrasados). Sin pantalla de auditoría. Sin "pendientes". Sin balance del período por estancia. La planilla y la app pueden pisarse (B1). |
| **Encargado de estancia** (su estancia) | Registrar movimientos, entradas (nacimientos, compras), salidas (ventas, muertes), cambios de categoría y correcciones. Todavía manda la planilla. | Diario | **Sí, con riesgo.** | Con mala señal puede registrar dos veces (B2) o perder lo cargado. La sesión vence a los 30 minutos. Sin recuento. Pesada, ecografía, vacunas y destete están en el catálogo (tipo REGISTRO) pero no hay pantalla: `entradas-salidas.service.js:25` solo acepta entradas y salidas. Sin bastón. No sabe si tiene que seguir con la planilla. |
| **Capataz / peón** (su estancia, sin revertir) | Mover lotes, anotar una muerte, contar un potrero. | Diario, desde el celular en el campo | **Mover y anotar una muerte, sí. Contar, no.** | No hay recuento: tiene que usar "Corrección de stock", que es para otra cosa. Botones chicos (sección 6). En el formulario de mover, el destino es una lista larga sin buscador. Si vence la sesión o se corta la señal, pierde lo que escribió. |

---

## 4. Inventario

| Área | Pantallas | Acciones | Datos (Render, 19/11) |
|---|---|---|---|
| Acceso | Login, Cambiar contraseña, Mi perfil | Entrar, salir, cambiar la contraseña, bloqueo a los 5 intentos | Usuarios con roles y estancias |
| Administración | Usuarios (tarjetas), Roles y permisos (matriz) | Alta, desactivar, roles, estancias, restablecer contraseña, desbloquear; abm de roles, matriz (solo el superadmin) | 4 roles de Pecuaria + los de ejemplo |
| Resumen | Por estancia, "Todas las estancias", feedlot y "Todos los feedlots" | Tocar un número lleva a Potreros filtrado | 6 estancias, 10.934 cab; FEG 1.372 y FELS 1.046 en 21 corrales; valor ≈ USD 12,9 M (estancias) |
| Potreros | Tabla con filtros y paginado; ficha del potrero | Corrección de stock, uso de suelo y área utilizable, hectáreas, "+ Corral", unir partes de un lote | 137 potreros y 21 corrales; 17 potreros con hectáreas "1" de relleno |
| Lotes | Ficha del lote | Renombrar, entrada al corral, ver la familia (lote repartido) | Un lote por potrero y categoría al empezar |
| Movimientos | Tabla tipo Excel con filtros y totales | Revertir (suelto o el evento entero) En Render, al 19/11, el único movimiento conocido es el #15 |
| Botón "+" | Hoja de acciones | Mover, mover entre campos, movimiento múltiple, cambio de categoría, entrada, salida, corrección | 27 tipos, 4 causas |
| Importar | Importar planilla | Vista previa → confirmar o descartar | Planilla del 13/11 (y corrales del 12/11) |
| Configuración | Usos, categorías (peso y precio), kg por UG, feedlot (GMD y ciclo), tipos y causas | Abm de todo, auditado | 33 categorías con precio; kg por UG = **250** en Render y **380** en la base local |
| PWA | Instalable, aviso de versión nueva y de "sin conexión" | — | No guarda nada sin señal |
| **No hay** | Auditoría, Excel, informe, recuento, pesada y sanidad, bastón, avisos, Parcelas, IA | — | — |

---

## 5. Bugs y riesgos en el código

Gravedad: **Alta** (puede dejar el stock mal sin que se note) · **Media** (error visible o dato raro en un caso posible) · **Baja** (prolijidad).

| # | Dónde | Qué pasa | Gravedad | Arreglo propuesto |
|---|---|---|---|---|
| B1 | `server/src/pecuaria/importaciones.service.js:192`, `:240-259` | Al confirmar una planilla se cierran los lotes que la planilla no trae y se reabren los que sí (`activo`), **aunque la fecha de la planilla sea anterior** a los movimientos hechos en la app. La versión nueva queda vieja, no vigente, pero los lotes quedan cerrados: después "El lote está cerrado" y no se pueden mover. Con una planilla más nueva, en cambio, se pisan sin aviso los movimientos de la app. | **Alta** | En la vista previa, comparar con el último dato de cada potrero. Si la planilla es más vieja, error. Si hay movimientos de la app después de la última planilla, avisar cuáles se pisan y pedir que se confirme a propósito. Después (fase 4), un modo "comparar" que muestre las diferencias sin cargar nada. |
| B2 | `client/src/pages/MoverPage.jsx:133-147`, `RegistrarPage.jsx:164-175` y las demás pantallas que registran; en el servidor no hay clave | Si la señal se corta después de que el servidor guardó pero antes de que llegue la respuesta, la pantalla dice "No se pudo registrar" y el usuario lo vuelve a mandar: **queda registrado dos veces**. Con señal mala es lo esperable. | **Alta** | Cada formulario genera una clave (`crypto.randomUUID()`) que viaja con el registro. Una columna única en `movimiento` y `evento_movimiento`: si la clave ya existe, se devuelve lo que se guardó la primera vez. Test con dos envíos iguales. |
| B3 | `server/src/pecuaria/movimientos.service.js:46`, `:63` (también `entradas-salidas.service.js:88`, `:140` y `stock.service.js:255`) | La foto del potrero se lee dentro de la transacción, pero sin bloquear nada (PostgreSQL por defecto deja leer mientras otro escribe). Si dos personas mueven del mismo potrero casi al mismo tiempo, las dos parten de la misma foto y **la segunda borra el cambio de la primera** del stock vigente. El movimiento queda en la lista, pero las cabezas no cierran. | **Alta** (poco frecuente, y no se nota) | Al empezar `aplicar`, `planSalida` y `planEntrada`, bloquear los potreros que se tocan con `SELECT pg_advisory_xact_lock(id)`, ordenados por id. Test con dos movimientos en paralelo. |
| B4 | `server/src/pecuaria/stock.service.js:227`, `:264-281`, `:286-289`, junto con `movimientos.service.js:661-670` | Una corrección con fecha anterior al último dato se guarda (con un aviso), pero **cambia ya** la categoría y el estado de los lotes. Además, revertir un movimiento después toma la versión anterior por fecha: puede volver a esa corrección "del pasado" en vez de al estado real de antes. | Media | La misma regla que en los movimientos: la fecha no puede ser anterior al último dato del potrero. Para cargar historia vieja, que sea solo importando. |
| B5 | `server/src/pecuaria/movimientos.service.js:147-152` y `:224` (y `:686-694` al revertir) | Mover el **lote entero a otra estancia** no controla si allá ya hay un lote con el mismo nombre. Es posible: hay potreros que se llaman igual en varias estancias ("1", "P. Grande", "Molino"). PostgreSQL rechaza el cambio y el usuario ve "Error interno". Lo mismo pasa al revertir, si mientras tanto se creó un lote con ese nombre en el origen. | Media | Si el nombre está ocupado en el destino, renombrar con `nombreLibre` (".. (2)") y decirlo en la vista previa. Test. |
| B6 | `server/src/app.js:63-64` | Cualquier error de la base (un nombre repetido, un choque entre dos transacciones) sale como "Error interno. Probá de nuevo.", que no dice qué pasó. | Media | Traducir los códigos de Prisma: P2002 → 409 "Ya existe…" y P2034 → 409 "Otro usuario cambió esto recién: probá de nuevo". |
| B7 | `client/src/pages/RegistrarPage.jsx:369-381`, `server/src/pecuaria/entradas-salidas.service.js:68-73` | "Traslado a otro campo" y "Traslado desde otro campo" dejan elegir **una estancia del grupo**. Si alguien lo usa en vez de "Mover entre campos", los animales salen de una estancia y no entran en la otra: **el grupo pierde cabezas en la app**. | Media | Los traslados, solo para campos de afuera. Si el campo es del grupo, el servidor contesta "Para otra estancia de SAPSA usá Mover entre campos". |
| B8 | `server/src/pecuaria/movimientos.service.js:644`, `:647-656` | La lista de movimientos trae como mucho 1.000, sin avisar, y los totales (cabezas, entradas, salidas) se calculan solo sobre esos. Con el uso diario se llega en pocos meses. | Media | Paginar en el servidor, calcular los totales con una consulta aparte y avisar "se muestran los últimos N". |
| B9 | `server/src/pecuaria/pecuaria.controller.js:247-253`, `:270-272`, `:312-316`, `:320-322` (y los demás `registrar(req, …)`) | La auditoría se escribe **después** de la transacción. Si esa escritura falla, el movimiento queda guardado sin auditoría. | Baja-media | Pasarle la transacción a `registrar` y escribir la auditoría adentro. |
| B10 | `server/src/pecuaria/pecuaria.schema.js:212-217`, `pecuaria.routes.js:113` | Cualquier parámetro acepta cualquier número mayor que cero, y lo puede cambiar el encargado (`pecuaria:EDITAR`) **para todas las estancias**. Así quedó "kg por UG" en 250 en Render. | Media | Un rango por parámetro (por ejemplo, kg por UG de 300 a 500). El "kg por UG" y los precios, solo para el jefe y el superadmin (a decidir, pregunta 7). |
| B11 | `server/src/pecuaria/movimientos.service.js:52-53`, `entradas-salidas.service.js:138-139` | El servidor deja mandar animales a un potrero dado de baja (las pantallas no lo ofrecen, pero la API sí). | Baja | Rechazar el destino si `activo` es false. |
| B12 | `server/src/users/users.controller.js:147-156` | Un administrador que no es superadmin puede restablecer la contraseña del dueño (o de otro administrador) y entrar como él. | Baja (hoy el único administrador es Diego) | Que solo el superadmin restablezca la contraseña de usuarios con "todas las estancias" o con roles de administración. |
| B13 | `client/src/context/AuthContext.jsx:23-25`, `server/src/config.js:51` | Al vencer la sesión (30 minutos sin uso) la app manda al login, y **se pierde lo que se estaba escribiendo**. | Media (para la gente de campo) | Borrador del formulario en el celular (ver la fase 2) y sesión más larga para la gente de campo (pregunta 4). |
| B14 | `client/src/context/AuthContext.jsx:57` | El mensaje "¿Está levantada la API?" es técnico. Además, con el servidor dormido, es justo lo que va a ver el dueño. | Baja | "No hay conexión con el servidor. Si recién abrís la app, esperá un minuto y probá de nuevo." |
| B15 | `server/src/pecuaria/entradas-salidas.service.js:257-272` | Una entrada de varias líneas (por ejemplo, un parto con terneros y terneras) guarda un movimiento por línea. Para revertirla hay que deshacer las líneas de a una, empezando por la última. | Baja | Agruparlas en un evento, como el movimiento múltiple, y revertirlo entero. |
| B16 | `server/src/pecuaria/movimientos.service.js:127` | Sumar a un lote sin peso: el promedio del destino queda vacío, aunque se conozca el peso de los que llegan. | Baja | Si el destino no tiene peso, usar el de los que llegan solo si eran todas sus cabezas; si no, dejarlo vacío, pero avisarlo en la vista previa. |
| B17 | `server/src/pecuaria/movimientos.service.js:531-538`, `:554-577`, `:870` | Muchas consultas sueltas: una por potrero y una por evento en cada lista. Hoy anda; con mil movimientos y la base chica de USD 6 se va a notar. | Baja | Traer las últimas versiones en una sola consulta (`DISTINCT ON`). |
| B18 | `client/src/pages/MoverPage.jsx:8` (y el mismo `hoy()` en otras 6 pantallas) | "Hoy" sale de la hora del celular, y el servidor usa la de Uruguay. Con el celular en otra zona horaria, la fecha puede dar "futura". | Baja | `toLocaleDateString('sv-SE', { timeZone: 'America/Montevideo' })`, como en el servidor. |
| B19 | `server/src/pecuaria/pecuaria.schema.js:17`, `:244`, `:367` | Algunos mensajes son de programador: "activo tiene que ser true o false", "mismoLote tiene que ser true o false". | Baja | Solo salen si el front manda algo mal; igual, pasarlos a lenguaje de la app. |
| B20 | `server/prisma/schema.prisma:231` y `CLAUDE.md` (encabezado "Estado (07/11/2026)" y "Próximo paso", al final) | Un comentario del enum `Sexo` quedó arriba de `PrecioPor`. La parte "Próximo paso" de `CLAUDE.md` habla del `.env` del 07/11 y ya no aplica. | Baja | Moverlo y actualizarlo. |

**Revisado y bien:**
- El alcance por estancia se aplica en todas las rutas.
- El login y las sesiones están bien hechos (token opaco, SHA-256, bloqueo, límite por IP).
- La fecha de "hoy" del servidor es la de Uruguay.
- No se aceptan fechas futuras.
- No se puede revertir si después hubo otros cambios.
- La vista previa del movimiento múltiple se simula en una transacción que después se deshace.
- Los textos que ve el usuario están en español con voseo: no se encontró ninguno en inglés.

---

## 6. Experiencia en el celular

Leído del código, a 375 px:

1. **Botones chicos para dedos con guantes:**
   - el selector de estancia de arriba (`Marco.jsx:56`, unos 28 px de alto);
   - volver y cerrar en la hoja del "+" (`HojaRegistrar.jsx:81`, `:86`, unos 32 px);
   - la flechita de los filtros (`Marco.jsx:323`, 20 px de ancho).
   - El mínimo recomendado es 44 px.
2. **Letra de 11 px:** en la barra de abajo (`Marco.jsx:234`) y en las segundas líneas de las tablas (`ResumenCampo.jsx:69`, `FeedlotAnalisis.jsx:14`). Al sol cuesta leerla: 12-13 px como mínimo.
3. **El destino en Mover** es una lista nativa con todos los potreros, y cada opción es larga ("8.2/3/4/5 · 200 Terneros chicos · Festuca vieja"), sin buscador (`MoverPage.jsx:205-213`). Con 59 potreros en La Gateada, es buscar con el dedo. Propuesta:
   - un buscador como el del "+";
   - primero los potreros vecinos o los más usados desde ese origen;
   - después los vacíos.
4. **El botón Confirmar queda al final**, después de tres bloques y de la vista previa: son dos pantallas de scroll. Propuesta:
   - Confirmar fijo abajo, con el resumen en una línea ("30 Terneros → P12");
   - fecha y motivo plegados en "Más opciones", porque casi siempre son hoy y vacío.
5. **El "+" con "Todas las estancias" pide primero la estancia** (`HojaRegistrar.jsx:64`): es un paso de más. Propuesta:
   - mostrar directo los potreros de todas, con la sigla adelante (como ya hace Potreros);
   - o recordar la última estancia que se usó.
6. **Después de un error al guardar**, la pantalla dice "No se pudo registrar" y no dice si quedó guardado (B2). Con la clave del formulario se puede decir "Ya estaba registrado".
7. **El minuto de arranque** del servidor gratis parece una app rota (se va con el plan Starter, paso 8 de la sección 2).
8. **Sin guía de instalación en el iPhone.** Una pantalla "Instalar en el celular", con los 3 pasos de Safari, en Mi perfil.
9. **Revertir y unir usan `window.confirm`** (`MovimientosLista.jsx:268`, `PotreroPage.jsx:65`). Funciona, pero es el cartel del sistema: chico, con los botones del navegador y sin poder marcar en rojo la acción que no se deshace. Mejor una hoja propia con "Revertir" en rojo y "Volver".

---

## 7. Hoja de ruta para cerrar el MVP

Cada fase termina con algo que Diego prueba en el celular, y espera su OK antes de seguir. Esfuerzo: **chico** (1 sesión), **medio** (2-3 sesiones), **grande** (más).

### Fase 0: que la app no se pierda ni se duerma (esta semana)

- **Qué incluye:** los 10 pasos de la sección 2.
- **Por qué va primero:** sin esto se pueden perder todos los datos el 31/12, y cualquier mejora encima no sirve.
- **Esfuerzo:** chico. Casi todo es en el panel de Render; Claude hace `render.yaml` y la prueba de restaurar la copia.
- **Cómo lo prueba Diego:**
  - el panel ya no muestra la fecha de vencimiento;
  - hay una copia en `C:\backups\sapsa\` que Claude restauró en `sapsa_restore`, con las mismas cabezas que Render;
  - la app entra enseguida después de una hora sin uso;
  - la clave vieja ya no sirve.

### Fase 1: blindar los datos

- **Qué incluye:**
  - B1, el importador que no pisa;
  - B2, la clave del formulario contra el doble envío;
  - B3, el bloqueo por potrero;
  - B4, la corrección sin fecha para atrás;
  - B5 y B6, los nombres repetidos entre estancias y los errores claros;
  - B7, los traslados solo afuera del grupo;
  - B8, la lista paginada;
  - B9, la auditoría en la misma transacción.
  - Cada uno con su test.
- **Por qué va acá:** el encargado y el capataz van a cargar todos los días. Cada error de estos deja el stock mal sin que se note, y arreglarlo después cuesta mucho más.
- **Esfuerzo:** medio.
- **Cómo lo prueba Diego:**
  - en la base local, con el celular en modo avión justo después de tocar Confirmar: al volver la señal y reintentar, queda **un solo** movimiento y la app dice "Ya estaba registrado";
  - importar la planilla del 13/11 después de un movimiento del 19/11 da un error claro;
  - un traslado a una estancia del grupo lo manda a "Mover entre campos";
  - mover entero "1 · Novillos" de ELS a ER, si allá existe ese nombre, propone "1 · Novillos (2)".

### Fase 2: cargar desde el celular sin trabarse

- **Qué incluye:**
  - **Sesión** más larga para el celular, según lo que se decida (pregunta 4). Por ejemplo, "recordarme en este celular", que Diego puede cerrar desde Usuarios.
  - **Borrador** de cada formulario guardado en el celular. Sobrevive a que venza la sesión, a que se corte la señal o a que se cierre la app, y se ofrece "Seguir con lo que estabas cargando".
  - El **mensaje** de "sin conexión con el servidor" (B14).
  - **Botones** de 44 px y letra de 12 px como mínimo (sección 6, puntos 1 y 2).
  - **Buscador** y **Confirmar fijo** en Mover (puntos 3 y 4).
  - El **"+" con "Todas"** sin el paso de la estancia (punto 5).
  - La pantalla **"Instalar en el celular"** (punto 8).
- **Por qué va acá:** el MVP es que la gente de campo cargue todos los días. Si se traba, vuelve a la planilla.
- **Esfuerzo:** medio.
- **Cómo lo prueba Diego:** en su Android y en un iPhone (el del dueño, o uno prestado):
  - empezar a mover 30 terneras, poner modo avión, cerrar la app, abrirla con señal: el formulario sigue ahí;
  - mover con 6 toques y un número, como dice `LOGISTICA_MOVIMIENTOS.md` §5, sin scroll para llegar a Confirmar;
  - después de 2 horas sin usarla, la app sigue con la sesión abierta.

### Fase 3: recuento, y la planilla en modo "comparar"

- **Qué incluye:**
  - **"Recuento"** (tipo 27) en el "+", por potrero o por lote, para el capataz:
    - pone el número que contó;
    - la app muestra la diferencia;
    - si no coincide, pide el motivo (muerte sin anotar, se pasaron de potrero, error de carga) y lo registra como un movimiento con motivo.
    - "Corrección de stock" queda para el jefe.
  - **"Pesada"** por lote: actualiza el peso promedio.
  - **El importador en modo "comparar":** sube la planilla del encargado y muestra las diferencias por potrero y categoría, sin cargar nada.
- **Por qué va acá:** el recuento es el control que compensa no usar el bastón (`LOGISTICA_MOVIMIENTOS.md` §4). Comparar deja seguir recibiendo la planilla sin que haya dos fuentes.
- **Esfuerzo:** medio.
- **Cómo lo prueba Diego:**
  - contar 98 donde la app dice 100, elegir "muerte sin anotar": queda la salida de 2, con su motivo, en Movimientos;
  - subir la planilla de la semana en "comparar": ver las diferencias sin que cambie ningún número de la app.

### Fase 4: descargar a Excel

- **Qué incluye:** un botón "Descargar Excel" en Potreros (con los filtros aplicados), Movimientos (el período filtrado) y Resumen. Se arma en el servidor con `exceljs`, que ya está instalado.
- **Por qué va acá:** es barato y es lo que más piden el jefe y la oficina (cruzar con el DICOSE, mandarlo por mail).
- **Esfuerzo:** chico.
- **Cómo lo prueba Diego:** descargar desde el celular los movimientos de EG de este mes, abrirlos en Excel y ver que los totales coinciden con los de la pantalla.

### Fase 5: el informe para el dueño

- **Qué incluye:** una pantalla "Informe" con un período (esta semana, este mes, entre fechas), por estancia y del total:
  - el **balance**: había N + nacimientos + compras − ventas − muertes − consumo ± traslados = hay M, con la diferencia si no cierra;
  - las ventas (cabezas, kilos y USD si se cargó el precio; lo hace el otro agente);
  - el valor del ganado al principio y al final del período;
  - los feedlots: salieron, atrasados, próximos.
  - Se imprime a PDF desde el celular (Compartir → Imprimir) y el link se manda por WhatsApp; el dueño lo abre con su usuario.
- **Por qué va acá:** necesita las fases 1 y 3, para que los números cierren. Es lo que le muestra al dueño que la app sirve.
- **Esfuerzo:** medio.
- **Cómo lo prueba Diego:** el informe del mes de La Gateada cierra: lo de antes, más las entradas, menos las salidas, da lo de hoy. El dueño lo abre en su iPhone desde un link de WhatsApp.

### Fase 6: avisos dentro de la app y auditoría

- **Qué incluye:**
  - Una campanita con avisos calculados, sin notificaciones push:
    - potreros sin dato ni recuento hace más de 30 días (el plazo se configura);
    - carga por encima del máximo de su grupo (pregunta 8);
    - corrales atrasados;
    - precios con más de 60 días.
  - La pantalla de **Auditoría** (quién, qué, cuándo, con filtros) para Diego y Dirección.
- **Por qué va acá:** con los datos ya confiables, los avisos no dan falsas alarmas.
- **Esfuerzo:** chico-medio.
- **Cómo lo prueba Diego:**
  - la campanita de EG muestra los potreros de campo natural sin recuento;
  - en Auditoría se ve el movimiento que él mismo registró, con su usuario y la hora.

### Fase 7: bastón, primer paso

- **Qué incluye:** las fases 2 y 3 de `LOGISTICA_MOVIMIENTOS.md` §8:
  - "Repartir" en varios potreros de una vez;
  - la bandeja de sesiones del bastón: subir el `.txt`, validarlo y hacer un recuento con bastón contra un lote.
- **Por qué va acá, y último:** depende de cómo llega el archivo (pregunta en `LOGISTICA_MOVIMIENTOS.md` §9), y el recuento a ojo de la fase 3 ya cubre lo básico.
- **Esfuerzo:** medio.
- **Cómo lo prueba Diego:**
  - subir los dos archivos reales (948 y 125 lecturas) y ver el aviso al subir uno dos veces;
  - comparar las 125 lecturas con el lote de vaquillonas Wagyu.

**Con las fases 0 a 6 el MVP queda redondo.** La 7 es el puente al bastón.

---

## 8. Lo que dejaría para después del MVP

- **Trabajar sin señal de verdad**, con una cola que se manda sola al volver la señal y vista previa de nuevo (`LOGISTICA_MOVIMIENTOS.md` §10). En el MVP alcanza con el borrador y la clave contra el doble envío.
- **El bastón dentro de cada registro** (paso "Lecturas", obligatorio en ventas y compras) y el **registro por animal**: fases 4 a 8 de `LOGISTICA_MOVIMIENTOS.md`.
- **Sanidad y reproducción:** vacunas, ecografía, inseminación, destete, castración, entore. Y las **solicitudes de cambio de categoría** por edad y por peso.
- **CIGAM en modo lectura:** hace falta antes el acceso (SQL Server, un usuario de solo lectura, una réplica). Lo más útil primero: hectáreas reales (TEA3TALHAO) para los 17 potreros con "1".
- **El módulo Parcelas** (`DECISIONES.md` §9): es el módulo siguiente, cuando Pecuaria se use todos los días (§4: "de a un módulo").
- **El asistente con IA** (§11, paso 7).
- **Notificaciones push en el iPhone:** solo andan con la PWA instalada y aceptadas.
- **2FA para el dueño y los administradores** (`DECISIONES.md` §7). Conviene antes de sumar más gente o datos sensibles. Si el dueño lo quiere ya, se puede adelantar a la fase 6.
- **Pasar a TypeScript** y un ambiente de prueba en Render, que publique antes que `main`.
- **Ovinos.**

---

## 9. Preguntas para Diego, el jefe o el encargado

1. **¿Desde qué fecha la app es la única fuente del stock?** Después de esa fecha, la planilla solo se compara (fase 3). *(Jefe y encargado)*
2. **¿1 UG = 380 kg o 250 kg?** En Render quedó en 250 y en la base local en 380, y la UG/ha de Render da un 50 % más alta. *(Jefe)*
3. **¿Se aprueban unos USD 13-15 por mes de Render, y quién paga?** Si es la empresa, conviene que el workspace tenga un dueño de SAPSA. *(Diego y el dueño)*
4. **¿Cuánto puede quedar abierta la sesión en el celular del capataz?** Por ejemplo, 12 horas, o 30 días "en este celular" con la opción de cerrarla desde Usuarios. *(Diego)*
5. **¿Hay señal donde se carga** (la manga, los potreros, solo cerca de la casa)? **¿Qué celulares usan el encargado y el capataz?** *(Encargado)*
6. **¿Qué quiere ver el dueño, y cada cuánto?** Por ejemplo, un informe semanal por WhatsApp con el balance y el valor, o solo el Resumen. *(Diego, con el dueño)*
7. **¿Quién puede cambiar los precios y el kg por UG, y cada cuánto se actualizan los precios?** Hoy puede el encargado, y cambia para todas las estancias. *(Jefe)*
8. **¿Cuál es la carga máxima aceptable por grupo** (campo natural, verdeos, praderas), en UG/ha o cab/ha? *(Jefe)*
9. **¿Cada cuánto cuentan los potreros, y qué diferencia aceptan como normal?** Define el aviso "sin recuento" y la tolerancia del recuento. *(Encargado)*
10. **El movimiento #15 de Render** (575 Terneros de EG Cerro sumados a Frente A, el 19/11), **¿pasó de verdad o fue una prueba?** Si fue una prueba, hay que revertirlo antes de que el encargado empiece. *(Diego)*

---

## Datos que faltan o son supuestos, y cómo completarlos

| Dato | Estado | Cómo completarlo |
|---|---|---|
| Kg por UG | 250 en Render, 380 en la base local | Pregunta 2. Después, un rango en Configuración (B10). |
| Peso y precio por categoría | 7 categorías con valores supuestos (Terneros y Terneras chicos, Vacas, Vacas CUT, Vaquillonas paridas, Novillos y Vaquillonas generales); precios de mercado de noviembre | El jefe los revisa en Configuración → Categorías. Agregar la **fecha del precio** y el aviso de "precio viejo" (fase 6). |
| Hectáreas | 17 potreros de ER y EG con "1" de relleno; "altiplano" de La Palma sin hectáreas | El filtro "datos incompletos" de Potreros ya los lista. El encargado o el mapa dan las reales; después, CIGAM (TEA3TALHAO). |
| Área utilizable | Vacía en todos los potreros (se usan todas las hectáreas) | La carga el encargado al cambiar el uso (sorgos y arroces parciales). |
| Categorías del corral | Por la observación de la hoja ("gordos" → Novillos 1-2), confirmadas por Diego | El encargado del feedlot las confirma corral por corral. |
| Entrada al corral | Fechas en texto y pesos en rango ("230-250") en la hoja | El encargado del feedlot las corrige en la ficha del lote ("Entrada al corral"). |
| Carga máxima por grupo | No existe | Pregunta 8. Va con los avisos de la fase 6. |
| Siglas y registros | ESP sin nombre; La Palma no está en el DICOSE; número DICOSE por estancia desconocido | Preguntas de `PECUARIA.md` §8 y `LOGISTICA_MOVIMIENTOS.md` §9. |
| Movimiento #15 en Render | Sin revertir; no se sabe si fue real | Pregunta 10. |
