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

## Estado (07/11/2026)

- **Fases:**
  - Las fases 2 y 3 están hechas y aprobadas. Pasan los 73 tests.
  - La fase 4 (permisos) tiene el plan aprobado (`docs/DECISIONES.md` §3), pero quedó **postergada** (17/11/2026): Pecuaria v1 va antes, con login y auditoría, sin permisos por rol.
  - **Módulo Pecuaria v1** (solo La Gateada): alcance en `docs/DECISIONES.md` §10; ficha técnica en `docs/PECUARIA.md`. Plan de 6 fases aprobado el 17/11/2026.
    - **Fase 1 hecha (17/11):** modelo completo (migración `pecuaria_modelo`), catálogos con alias, parámetro UG, campos y potreros, API y auditoría.
    - **Fase 2 hecha y aprobada (17/11):** `planilla.parser.js` (lee el .xlsx con exceljs; columnas por nombre, agrupados, relleno, el 72.10 que Excel convierte en 72.1), `importaciones.service.js` (vista previa PENDIENTE → confirmar/descartar), pantallas `/pecuaria` y `/pecuaria/importar`. Pasan 138 tests. Probado con la planilla real: 58 potreros, 6.255 cabezas, 0 errores.
    - **Carga inicial (17/11):** La Gateada en la base de desarrollo, con el usuario técnico `carga.inicial` (desactivado). Receta: `docs/info santi/carga-inicial-gateada.mjs` (fuera de git).
    - **Primer commit:** `f80188b` (fases 1 y 2).
    - **Fase 3 hecha (17/11), esperando el OK:** `calculos.js` (cálculos puros), `stock.service.js` (detalle, historial, stock a mano, cambio de uso), pantalla `/pecuaria/potreros/:id`, corral desde la lista. Pasan 154 tests. Revisada en el navegador integrado a 375 px.
    - **Fase 4 hecha (17/11), esperando el OK:** `resumen.service.js` (categorías × CN/Verdeos/Corral/Otro/Total y carga por grupo), pestañas Resumen/Potreros en `/pecuaria`, pantalla `/pecuaria/configuracion` (kg por UG, grupos de uso, categorías con alias). Pasan 159 tests.
    - **Lotes y movimientos hechos (17/11), esperando el OK:** migración `lotes_y_movimientos` (creó un lote por potrero + categoría ya cargado), `lotes.js`, `movimientos.service.js` (planificar → vista previa o registro en una transacción), edición de stock por lote, pantallas `/pecuaria/mover` y lotes en la ficha del potrero. Pasan 177 tests.
    - **Lista de potreros con filtros (17/11), esperando el OK:** `client/src/components/PotrerosLista.jsx` (buscar, grupo, con/sin animales, categoría, datos incompletos, orden; resumen de lo filtrado; lotes y barra de carga por potrero; filtros y pestaña en la URL). La lista de la API trae `stock.lotes`.
    - **Segundo commit:** `37809e8` (fases 3 y 4, lotes, movimientos, filtros).
    - **Página de movimientos (17/11), en el tercer commit:** pestaña Movimientos (`MovimientosLista.jsx`: lista con filtros por período, potrero y categoría; "Nuevo movimiento"; revertir), cambio de categoría como movimiento (modo CATEGORIA), reversión (modo REVERSION, migración `movimientos_reversion`: deja los potreros como estaban; solo si no hubo cambios después) e historial de cada lote (`/pecuaria/lotes/:id`). Pasan 188 tests.
    - **Categorías de CIGAM cargadas** en la base de desarrollo: 22 de vacunos nuevas + 3 vinculadas (script `docs/info santi/categorias-cigam.mjs`, fuera de git).
    - **Relevamiento de TEA4 en CIGAM** (categorías, 12 tipos de evento, causas, franjas de edad, razas, bastón): `docs/PECUARIA.md` §7c y §7d.
    - **Propuesta para el encargado:** `docs/PROPUESTA_MOVIMIENTOS.md` (todos los tipos de movimiento y evento, a qué nivel se aplica cada uno, reglas de cambio de categoría, 10 preguntas).
    - **Libro del rodeo, paso 1 hecho (17/11), esperando el OK:** migración `tipos_de_movimiento` (`TipoMovimiento` con efecto, niveles, sexo, causa y guía; `CausaMovimiento`; `Categoria.sexo` deducido del nombre; cada movimiento tiene su tipo: SUMAR→SUMAR_LOTE, NUEVO→LOTE_NUEVO, ENTERO→LOTE_ENTERO, CATEGORIA→CAMBIO_CATEGORIA, REVERSION→REVERSION). `tipos.repository.js`, `sexo.js`, rutas `/tipos-movimiento` y `/causas`, secciones nuevas en Configuración. Seed: 26 tipos (los que faltan, por clave) y 4 causas de CIGAM. Pasan 211 tests.
    - **Libro del rodeo, paso 2 hecho (18/11), esperando el OK:** migración `entradas_y_salidas` (`movimiento.campo_id`; origen o destino pueden faltar, con un CHECK de que haya al menos uno; `causa_id`, `guia`, `campo_otro_id`, `lote_madres_id`). `entradas-salidas.service.js` (modos ENTRADA y SALIDA; una entrada puede tener varias líneas, cada una su movimiento y su versión; causa y guía obligatorias si el tipo las pide), rutas `/entradas-salidas` y `/entradas-salidas/vista-previa`, reversión y lista con movimientos de un solo lado (resumen con entradas y salidas, filtro `tipoId`). Pantalla `/pecuaria/registrar` (`RegistrarPage.jsx`) y botones Entrada/Salida en la ficha, el lote y la pestaña Movimientos. Pasan 228 tests.
    - **Tercer commit del libro del rodeo:** `f4d4cff` (pasos 1 y 2). Sin remoto de GitHub todavía.
    - **Publicar en Render, fase 1 hecha (17/11), esperando el OK:** `src/front.js` (la API sirve `client/dist`; rutas del front → index.html), el front usa `/api` relativo (proxy de Vite en desarrollo), `CLIENT_URL` vacía = `RENDER_EXTERNAL_URL`, `render.yaml` (Virginia, plan gratis, migraciones + seed al arrancar con `npm run start:render`). Pasan 241 tests. `npm audit`: 0 en producción; 5 "high" solo en herramientas de desarrollo (picomatch ≤4.0.7, sin versión corregida todavía).
    - **Siguiente (acordado con Diego):** el "libro del rodeo". Paso 3: pestaña Registro. Después: "Editar stock" → "Corrección"; luego publicar (Render); después eventos, atajos por nivel, balance y solicitudes.
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
