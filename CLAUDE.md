# SAPSA · App interna: guía para Claude Code

Leé esto entero antes de tocar nada.
- Las decisiones, la visión y lo pendiente están en `docs/DECISIONES.md`.
- La instalación, el modelo y la API, en `README.md`.

## Qué es

Es la app interna de SAPSA, un grupo agroindustrial de Uruguay.
- **Hoy:** la base. Login, usuarios, roles, permisos por módulo y acción, sesiones y auditoría.
- **Después:** los módulos del negocio, que leen CIGAM (un ERP brasileño) **solo en modo lectura**.
- La app **nunca emite nada fiscal**.

## Reglas que no se negocian

- **Confidencialidad** (regla nueva, 17/11/2026):
  - En el código, el seed y los tests: solo datos ficticios (dominio `@ejemplo.test`, puestos en vez de nombres).
  - Datos del campo y del ganado (hectáreas, potreros, cabezas, kilos, categorías, uso de suelo, precios del ganado): se usan completos en docs y análisis. Las fuentes viven en `docs/info santi/` y `docs/img/`, que están en el `.gitignore`.
  - Datos sensibles, nunca: recursos humanos, cuentas y datos de clientes o proveedores, nombres de personas, RUT/CNPJ, servidores, usuarios y contraseñas.
- **Secretos:**
  - Nunca van en el código ni en git.
  - Nunca pidas, leas ni muestres contraseñas, ni el contenido de un `.env`.
  - Para revisar un `.env`, usá un script que diga solo si cada campo está completo, si falta o si tiene un largo incorrecto.
  - Si Diego escribe una contraseña en el chat, avisale que la cambie.
- **Sin commits** hasta que Diego los pida.
- **Por fases:** al terminar cada una, parar, mostrar qué se hizo y cómo probarlo, y esperar el OK.
- **Tests** de todo lo que se agrega.
- Los textos de la UI y los mensajes van en **español rioplatense (voseo)**.
- **No tocar** `C:\Users\Diego\Documents\code\auth-kit`:
  - Es la plantilla vieja, con MongoDB. Esta app salió de ahí, pero es otra cosa.
  - Documents se sincroniza con Google Drive: ningún `.env` debe vivir ahí.
- **`C:\Users\Diego\Documents\SAPSA\sapsaClaude` es otra cosa:**
  - Ahí se trabaja Power BI con datos reales, en modo solo estructura, y se sincroniza con Claude Desktop.
  - Tiene sus propias reglas de confidencialidad.
  - **El código de esta app no va ahí.**
  - Su carpeta `cigam/` (pantallas y procesos, solo estructura) va a servir para los módulos que lean CIGAM. Leela solo si Diego te lo pide.
- **Requisitos e informes:**
  - Los requisitos los define **Claude Desktop**, otra instancia de Claude que asesora a Diego.
  - Cuando Diego pida un informe de estado, va en Markdown listo para pegar allá.

## Cómo trabajar con Diego

- **Quién es:**
  - Desarrolla productos con IA y automatización sobre WhatsApp: `agenda-uy` y `appe`, en `Documents\code`.
  - **No asumas su nivel técnico.**
  - Los patrones que valora están en `docs/DECISIONES.md` §6.
- **Cómo explicarle:**
  - Prefiere **ir de a un paso**, con el motivo de cada uno y lo que tiene que ver si sale bien.
  - Si algo lo podés hacer vos (instalar, migrar, correr tests, levantar la app), hacelo y contale el resultado.
- **Su PowerShell:**
  - Al pegar desde el chat se cuelan caracteres invisibles. Ya pasó: `sapsa_app╪` en psql, y la ventana trabada en `>>`.
  - Dale comandos cortos, para escribir a mano. Si la ventana queda en `>>`, que apriete Ctrl+C.
  - Las ventanas que se abren (Bloc de notas, Explorador) pueden quedar detrás de otras: decile que mire la barra de tareas.
- **Los `.env`** los edita en el **Bloc de notas**, no en VS Code: lo que selecciona en VS Code te llega como contexto.

## Stack

- **Servidor:**
  - Node 24, que importa directo el cliente `.ts` que genera Prisma.
  - Express 5.
  - Prisma 7.10.1 con `@prisma/adapter-pg`.
  - PostgreSQL 18.
  - zod 4.
  - bcryptjs: costo 12, y 5 en los tests.
  - helmet y express-rate-limit.
- **Front:** React 19, React Router 7, react-hook-form, axios, Tailwind 4 y Vite 8.
- **Tests:** Vitest + supertest, contra un PostgreSQL real.

## Estructura de `server/`

- **`prisma/schema.prisma`:** la fuente de verdad.
  - Modelos: Usuario, Rol, Modulo, Permiso, UsuarioRol, RolPermiso, Sesion y Auditoria.
  - Las migraciones están en `prisma/migrations/`.
  - El cliente se genera en `src/generated/`, que está en el `.gitignore`.
- **`src/config.js`:** valida las variables al arrancar. Si alguna está mal, la API no arranca y dice cuál.
- **`src/app.js`:** helmet, cors, `checkOrigin`, `Cache-Control: no-store` y las rutas.
- **`src/index.js`:** el arranque, y el borrado de las sesiones vencidas cada hora.
- **`src/auth/`:**
  - `session.js`: el token opaco va en la cookie y en la base se guarda su SHA-256.
  - `auth.middleware.js`: `authRequired`, `authAllowPendingPassword` y `requireSuperadmin`, este último **TEMPORAL** hasta la fase 4.
  - `auth.controller.js`: login, logout, verify y cambio de contraseña.
  - `auth.schema.js`: las validaciones con zod.
  - `password.js`: el hash de las contraseñas.
- **`src/users/` y `src/roles/`:** cada uno con repository, controller, routes y schema.
- **`src/pecuaria/`:** módulo Pecuaria v1. `normalizar.js` (comparar textos de la planilla), `catalogos.repository.js` (usos de suelo y categorías con alias, parámetros), `tipos.repository.js` y `sexo.js` (tipos de movimiento, causas, sexo de la categoría), `lugares.repository.js` (campos y potreros), `planilla.parser.js` e `importaciones.service.js` (importar la planilla), `calculos.js`, `stock.service.js` (ficha, historial, stock a mano, uso), `resumen.service.js`, `lotes.js` y `movimientos.service.js` (mover, cambiar categoría, revertir, lista, historial de lote), schema, controller y routes. Rutas bajo `/api/pecuaria`, con `authRequired` solamente (fase 4 postergada).
- **`src/audit/audit.js`:** la función `registrar(req, { accion, entidad, entidadId, detalle })`, los códigos `ACCION` y `cambios(antes, despues, claves)` para auditar ediciones.
- **`src/seed/`:** el catálogo ficticio y `runSeed`. Es idempotente.
- **Errores:**
  - Se lanza un `HttpError` (`src/errors.js`), con un `code` opcional.
  - La respuesta siempre tiene la forma `{ errors: [...], code? }`.
  - Express 5 lleva solos los errores async al handler.
- **Entrada:** `validateBody(schema)` deja los datos limpios en `req.body`.

## Comandos

En `server/`:
- `npm run dev`
- `npm test`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:seed`
- `npm run db:studio`

En `client/`: `npm run dev`.

## Trampas

- **Prisma** no deja que un agente corra `migrate reset` ni `db push --force-reset` o `--accept-data-loss`: no los uses. Los tests usan `migrate deploy` y después TRUNCATE.
- **La base de test** tiene que terminar en `_test`; si no, los tests se niegan a correr. `TEST_DATABASE_URL` pisa lo que diga `.env.test`.
- **npm 11** muestra avisos de `install-scripts` (de prisma): son normales.
- **Windows:**
  - Cortar una tarea en segundo plano no siempre mata al proceso hijo de `npx vite`. Al terminar, revisá que los puertos 4000 y 5173 hayan quedado libres.
  - Nunca pases la salida de `pg_ctl start` por un pipe: el servidor hereda el pipe y el comando no termina.
- **Vitest y la letra del disco:** si la terminal quedó en `c:\` (minúscula), Vitest falla con "failed to find the runner". Corré los tests desde `C:\dev\sapsa-app\server` (mayúscula).
- **Vite a veces no ve un cambio** hecho por un script (sigue sirviendo la versión vieja). Se arregla actualizando la fecha del archivo.
- **Un .xlsx es un ZIP con la hora en que se armó:** la misma planilla armada en otro momento tiene otra huella. En los tests, para "el mismo archivo", subí el mismo buffer.
- **Al terminar de probar,** cerrá todo lo que hayas levantado.
- **PWA:** si un cambio publicado no aparece en el celular, es el service worker: tocar "Actualizar" en el cartel, o cerrar y abrir la app. En `npm run dev` la PWA está apagada; para probarla, `npm run build` y abrir la API (sirve `client/dist`). La API local corre en el puerto de `server/.env` (hoy 4001): si se prueba ahí, levantarla con `CLIENT_URL` igual a esa dirección.

## Estado (07/11/2026)

- **Fases:**
  - Las fases 2 y 3 están hechas y aprobadas. Pasan los 73 tests.
  - La fase 4 (permisos) tiene el plan aprobado (`docs/DECISIONES.md` §3), pero quedó **postergada** (17/11/2026): Pecuaria v1 va antes, con login y auditoría, sin permisos por rol.
  - **Módulo Pecuaria v1** (solo La Gateada): alcance en `docs/DECISIONES.md` §10; ficha técnica en `docs/PECUARIA.md`. Plan de 6 fases aprobado el 17/11/2026.
    - **Fase 1 hecha (17/11):** modelo completo (migración `pecuaria_modelo`), catálogos con alias, parámetro UG, campos y potreros, API y auditoría.
    - **Fase 2 hecha y aprobada (17/11):** `planilla.parser.js` (lee el .xlsx con exceljs; columnas por nombre, agrupados, relleno, el 72.10 que Excel convierte en 72.1), `importaciones.service.js` (vista previa PENDIENTE → confirmar/descartar), pantallas `/pecuaria` y `/pecuaria/importar`. Pasan 138 tests. Probado con la planilla real: 58 potreros, 6.255 cabezas, 0 errores.
    - **Carga inicial (17/11):** La Gateada en la base de desarrollo, con el usuario técnico `carga.inicial` (desactivado). Receta: `docs/info santi/carga-inicial-gateada.mjs` (fuera de git).
    - **Fase 3 hecha (17/11), esperando el OK:** `calculos.js` (cálculos puros), `stock.service.js` (detalle, historial, stock a mano, cambio de uso), pantalla `/pecuaria/potreros/:id`, corral desde la lista. Pasan 154 tests. Revisada en el navegador integrado a 375 px.
    - **Fase 4 hecha (17/11), esperando el OK:** `resumen.service.js` (categorías × CN/Verdeos/Corral/Otro/Total y carga por grupo), pestañas Resumen/Potreros en `/pecuaria`, pantalla `/pecuaria/configuracion` (kg por UG, grupos de uso, categorías con alias). Pasan 159 tests.
    - **Lotes y movimientos hechos (17/11), esperando el OK:** migración `lotes_y_movimientos` (creó un lote por potrero + categoría ya cargado), `lotes.js`, `movimientos.service.js` (planificar → vista previa o registro en una transacción), edición de stock por lote, pantallas `/pecuaria/mover` y lotes en la ficha del potrero. Pasan 177 tests.
    - **Lista de potreros con filtros (17/11), esperando el OK:** `client/src/components/PotrerosLista.jsx` (buscar, grupo, con/sin animales, categoría, datos incompletos, orden; resumen de lo filtrado; lotes y barra de carga por potrero; filtros y pestaña en la URL). La lista de la API trae `stock.lotes`.
    - **Página de movimientos (17/11):** pestaña Movimientos (`MovimientosLista.jsx`: lista con filtros por período, potrero y categoría; "Nuevo movimiento"; revertir), cambio de categoría como movimiento (modo CATEGORIA), reversión (modo REVERSION, migración `movimientos_reversion`: deja los potreros como estaban; solo si no hubo cambios después) e historial de cada lote (`/pecuaria/lotes/:id`). Pasan 188 tests.
    - **Categorías de CIGAM cargadas** en la base de desarrollo: 22 de vacunos nuevas + 3 vinculadas (script `docs/info santi/categorias-cigam.mjs`, fuera de git).
    - **Relevamiento de TEA4 en CIGAM** (categorías, 12 tipos de evento, causas, franjas de edad, razas, bastón): `docs/PECUARIA.md` §7c y §7d.
    - **Propuesta para el encargado:** `docs/PROPUESTA_MOVIMIENTOS.md` (todos los tipos de movimiento y evento, a qué nivel se aplica cada uno, reglas de cambio de categoría, 10 preguntas).
    - **Libro del rodeo, paso 1 hecho (17/11), esperando el OK:** migración `tipos_de_movimiento` (`TipoMovimiento` con efecto, niveles, sexo, causa y guía; `CausaMovimiento`; `Categoria.sexo` deducido del nombre; cada movimiento tiene su tipo: SUMAR→SUMAR_LOTE, NUEVO→LOTE_NUEVO, ENTERO→LOTE_ENTERO, CATEGORIA→CAMBIO_CATEGORIA, REVERSION→REVERSION). `tipos.repository.js`, `sexo.js`, rutas `/tipos-movimiento` y `/causas`, secciones nuevas en Configuración. Seed: 26 tipos (los que faltan, por clave) y 4 causas de CIGAM. Pasan 211 tests.
    - **Libro del rodeo, paso 2 hecho (18/11), esperando el OK:** migración `entradas_y_salidas` (`movimiento.campo_id`; origen o destino pueden faltar, con un CHECK de que haya al menos uno; `causa_id`, `guia`, `campo_otro_id`, `lote_madres_id`). `entradas-salidas.service.js` (modos ENTRADA y SALIDA; una entrada puede tener varias líneas, cada una su movimiento y su versión; causa y guía obligatorias si el tipo las pide), rutas `/entradas-salidas` y `/entradas-salidas/vista-previa`, reversión y lista con movimientos de un solo lado (resumen con entradas y salidas, filtro `tipoId`). Pantalla `/pecuaria/registrar` (`RegistrarPage.jsx`) y botones Entrada/Salida en la ficha, el lote y la pestaña Movimientos. Pasan 228 tests.
    - **Publicada en Render (17/11/2026):** workspace `SAPSA` (aparte de los proyectos personales de Diego), Blueprint `sapsa-app.` desde `main` (autoDeploy: cada push a `main` publica). Servicio `sapsa-app` y base `sapsa-db` (PostgreSQL 18, plan gratis: vence a los 30 días). Login probado por Diego: anda.
    - **Datos en Render (18/11/2026):** las mismas dos recetas que en desarrollo (`carga-inicial-gateada.mjs` y `categorias-cigam.mjs`): La Gateada al 13/11 (58 potreros, 6.255 cabezas, 32 lotes) y 31 categorías (25 vinculadas a CIGAM). Sin los movimientos de prueba de la base local. Cómo se hizo: Diego abre `sapsa-db` para su IP (Access Control), pega la External Database URL en `server/.env.render` (Bloc de notas), se corre con `sslmode=require` y **transacciones de 10 min** (desde Uruguay a Virginia la importación pasa los 60 s del importador), se borra `.env.render` y Diego saca la IP.
    - **PWA básica hecha (18/11/2026), esperando el OK:** diseño `docs/superpowers/specs/2026-11-18-pwa-design.md`, plan `docs/superpowers/plans/2026-11-18-pwa.md`. `vite-plugin-pwa` (`client/pwa.config.js`: modo prompt, nunca toca `/api`, apagada en dev), ícono provisorio "S" (`client/public/icono.svg` + PNG), `AvisosApp.jsx` (versión nueva / sin conexión), `useEnLinea.js`. Tests del front con Vitest en `client/` (11) y 3 nuevos en `server/test/front.test.js` (244 en total). Probada en Chrome sin ventana a 375 px. Falta: publicar e instalar en el Android de Diego; el dueño usa iPhone (Safari → Compartir → Agregar a inicio).
    - **Git:** el 17/11/2026 se rehízo el repo desde cero (el historial viejo se descartó). Rama `main`, remoto privado `origin` = `https://github.com/diegovinkers/APPECUARIA.git`. Commit inicial `79a02da`.
    - **Publicar en Render, fase 1 hecha (17/11), esperando el OK:** `src/front.js` (la API sirve `client/dist`; rutas del front → index.html), el front usa `/api` relativo (proxy de Vite en desarrollo), `CLIENT_URL` vacía = `RENDER_EXTERNAL_URL`, `render.yaml` (Virginia, plan gratis, migraciones + seed al arrancar con `npm run start:render`). Pasan 241 tests. `npm audit`: 0 en producción; 5 "high" solo en herramientas de desarrollo (picomatch ≤4.0.7, sin versión corregida todavía).
    - **Rediseño (18/11/2026), plan de 8 pasos en `docs/DECISIONES.md` §11:** pasos 0 (roles) y 1 (boceto) aprobados. **Paso 2 hecho, aprobado y publicado (18/11, commit `f50057f`; Diego lo ve en la PWA):** paleta clara "de campo" en `client/src/index.css` (`@theme`: suelo, campo, trigo, tierra; las clases zinc/sky se pasaron por script), ícono "S" trigo sobre verde (PNG regenerados), `navegacion/menu.js` (toda la navegación, con el permiso de cada ítem; `puede()` es lo único que cambia en la fase 4), `components/Marco.jsx` (barra de arriba con selector de estancia, barra de abajo en el celular, navbar en la compu, panel izquierdo), `HojaRegistrar.jsx` (el "+": acción → potrero → lote), `context/EstanciaContext.jsx`, `hooks/usePotreros.js`, pantallas `/pecuaria/resumen`, `/pecuaria/potreros` y `/pecuaria/movimientos` (`pages/pecuaria/`; `/pecuaria?vista=` redirige), Mover con `?cambio=categoria`. Se borraron `Navbar.jsx` y `PecuariaPage.jsx`. Tests: 32 en el front, 244 en el servidor. Revisado en el Chrome de Diego a 236 px de ancho; la vista de compu no se pudo revisar.
    - **Paso 3, permisos y estancias (plan `docs/superpowers/plans/2026-11-18-permisos.md`, aprobado 18/11). Parte A (servidor) hecha, esperando el OK:** migración `alcance_por_estancia` (`usuario_campo`, `usuario.todas_las_estancias`), `src/auth/permisos.js` (`requirePermission`, falla al arrancar si el módulo o la acción no existen; reemplaza a `requireSuperadmin`, que se borró), `src/pecuaria/alcance.js` (lo de otra estancia contesta 404; crear estancia o importar una nueva pide "todas"), permisos en cada ruta de Pecuaria (VER/CREAR/ANULAR/EDITAR), Usuarios y Roles. `/verify` trae `permisos`, `todasLasEstancias` y `campoIds`. Roles: ABM, `/roles/catalogo`, matriz `PUT /roles/:id/permisos` (solo superadmin). Usuarios: `PUT /:id/estancias`, `GET /estancias`; solo el superadmin asigna o saca roles de administración. Auditoría de altas, estado, roles, estancias, roles y permisos. Seed: Dirección, Jefe pecuario, Encargado de estancia, Capataz. Pasan 271 tests del servidor. **Parte B (pantallas) hecha, esperando el OK:** `navegacion/menu.js` usa `user.permisos` ('modulo:ACCION') e `inicioPara(user)`; `hooks/usePuede.js` oculta botones (registrar, revertir, editar stock, hectáreas, renombrar lote); `ProtectedRoute permiso=...` por grupo de pantallas; `UsersPage` en tarjetas con roles y estancias (los roles de administración, bloqueados para quien no es superadmin); `RolesPage` (`/roles`: alta, renombrar, borrar si nadie lo tiene, matriz solo para el superadmin; nombres de acciones en `navegacion/permisos.js`). Seed local corrido (4 roles nuevos). 42 tests del front. Revisado en el Chrome de Diego a 1242 px (Roles y Usuarios). **Parte C: commiteado (`8d267b4`) y publicado en Render el 18/11** (el front nuevo ya se sirve; la migración y el seed corren al arrancar). Diego lo revisó en Render (roles y usuarios): **paso 3 cerrado**.
    - **Paso 4, las otras estancias (18/11), cerrado (Diego confirmó la app en el celular con la base cerrada a internet):** el importador controla los duplicados por estancia (una planilla trae varias). Catálogo (decisión de Diego): usos Avena y Megamix (Verdeos), "S. Silero" = Sorgo; categorías generales Novillos y Vaquillonas; "vacas wagyu" = Vacas de cría Wagyu; "vacas primiparas" = Vaquillonas paridas (en el seed para instalaciones nuevas). `GET /api/pecuaria/resumen` (todas las estancias del usuario, con una fila por estancia); el selector de arriba tiene "Todas las estancias" (Resumen las suma; Potreros, Movimientos y el "+" piden elegir una). Receta `docs/info santi/estancias-13-11.mjs` (fuera de git), corrida en la base local: ES El Silencio 1.144, ER El Rincón 1.172, ESP 312, ELS La Seda 1.661, La Palma 390 → con EG, **10.934 cabezas en 137 potreros**. 273 tests del servidor, 43 del front. **Publicado (`7c18a02`) y cargado en Render el 18/11:** mismas 6 estancias y 10.934 cabezas que en desarrollo. Cómo: `docs/info santi/correr-en-render.mjs` (agrega `sslmode=require` y sube el tiempo de las transacciones a 10 min), con `--env-file=server/.env --env-file=server/.env.render`; `.env.render` borrado al terminar. Trampa: la IP de la casa de Diego cambia; si Render corta con "Connection terminated unexpectedly", la IP no está (o no se guardó) en Access Control de `sapsa-db`. Al terminar se borraron todas las reglas: `sapsa-db` quedó **cerrada a internet** (la app entra por la red interna de Render, `fromDatabase.connectionString`). Para otra carga, agregar la IP del momento y borrarla al final. Después del §11 sigue el libro del rodeo: eventos, atajos por nivel, balance y solicitudes.
    - **Mejoras sueltas (18/11), hechas en desarrollo, sin commitear:** en el Resumen, la categoría, cada número y cada tarjeta de grupo llevan a Potreros filtrado (`?categoria=&grupo=`), con una leyenda de qué es CN y Verdeos; filtros de Potreros reordenados (los grupos bajan de renglón, sin scroll; selectores con su etiqueta); los potreros dados de baja (`activo: false`) no se listan y uno con animales no se puede dar de baja. Los 7 "Pivot" de EG **se quedan activos** (el jefe dice que a veces se mete ganado ahí): se dieron de baja y se volvieron a activar el mismo día en la base local (`docs/info santi/baja-pivots.mjs` los reactiva); en Render nunca se tocaron. Tests: 45 del front, +2 del servidor (`pecuaria-baja-potrero.test.js`). En paralelo, otra sesión hace el paso 5 en esta misma carpeta.
    - Para levantar la app desde la app de escritorio: `.claude/launch.json` (configuraciones `api` y `web`).
    - `exceljs` trae un `uuid` viejo: está forzado a `^11.1.1` con `overrides` en `server/package.json`.
  - **Módulo Parcelas:** en diseño (`docs/DECISIONES.md` §9).
- **La PC de Diego:**
  - PostgreSQL 18.6 instalado: servicio `postgresql-x64-18`, puerto 5432, solo acepta conexiones locales.
  - Creados el rol `sapsa_app` y las bases `sapsa_dev` y `sapsa_test`.
- **Próximo paso:**
  1. Diego completa y guarda `server/.env` y `server/.env.test`.
  2. Vos los revisás sin mostrar los valores.
  3. Corrés `npm install`, `db:generate`, `db:migrate`, `db:seed` y `npm test`.
  4. Levantás la API y el front.
  5. Diego prueba en el navegador: el login, crear un usuario, el cambio de contraseña obligatorio, el bloqueo y el desbloqueo, y la auditoría.
