# SAPSA · App interna

Base de autenticación y permisos de la app interna. Salió de la plantilla
`auth-kit` (que queda intacta en su carpeta).

- **server/**: Express 5 + PostgreSQL con Prisma 7, zod, bcrypt, helmet. Requiere Node 24+.
- **client/**: React 19 + React Router + react-hook-form + axios + Tailwind 4.

Todos los datos de ejemplo son ficticios (dominio reservado `@ejemplo.test`).

## Estado

| Fase | Contenido | Estado |
| ---- | --------- | ------ |
| 2 | PostgreSQL + Prisma, modelo completo, login por usuario, sin registro público, seed | **hecha** |
| 3 | Sesiones revocables (inactividad + máximo), límite de intentos, helmet, cambio de contraseña, auditoría de logins | **hecha** |
| 4 | Permisos por módulo y acción en cada ruta, ABM de roles, reglas de administrador, auditoría de cambios | pendiente |
| 5 | Menú lateral por permisos, pantallas de usuarios y roles | pendiente |

Mientras tanto, **las rutas de administración son solo del superadmin** (marcado
como `TEMPORAL` en el código).

## Puesta en marcha

### 1. PostgreSQL (una sola vez)

Instalá PostgreSQL 18 y creá un usuario y dos bases para la app (en psql como
`postgres`):

```sql
CREATE ROLE sapsa_app LOGIN CREATEDB;
\password sapsa_app
CREATE DATABASE sapsa_dev  OWNER sapsa_app ENCODING 'UTF8' TEMPLATE template0;
CREATE DATABASE sapsa_test OWNER sapsa_app ENCODING 'UTF8' TEMPLATE template0;
```

- `\password` pide la contraseña sin mostrarla ni guardarla en el historial.
- `CREATEDB` hace falta solo en desarrollo: `prisma migrate dev` crea una base
  temporal ("shadow") para comparar migraciones. En producción no.

### 2. Variables de entorno

```bash
cd server
cp .env.example .env            # completar: DATABASE_URL, SUPERADMIN_*, SEED_PASSWORD_EJEMPLO
cp .env.test.example .env.test  # completar: DATABASE_URL de sapsa_test
```

Los dos están en `.gitignore`. Las credenciales del superadmin y de los usuarios
de ejemplo se leen de ahí; no hay ninguna en el código. Las variables de sesión
y de intentos de login ya traen valores por defecto (ver `.env.example`).
Si alguna tiene un valor inválido, la API no arranca y dice cuál.

### 3. Backend

```bash
cd server
npm install
npm run db:generate   # genera el cliente de Prisma en src/generated/
npm run db:migrate    # crea las tablas en sapsa_dev
npm run db:seed       # módulos, permisos, roles, superadmin y usuarios de ejemplo
npm test              # usa sapsa_test (se vacía en cada test)
npm run dev           # API en http://localhost:4000
```

El seed se puede repetir: solo crea lo que falta. No pisa nombres de módulos ni
permisos de roles editados, ni la contraseña de un superadmin que ya existe.

### 4. Frontend

```bash
cd client
npm install
npm run dev           # http://localhost:5173
```

El front llama siempre a `/api` (relativo). En desarrollo, Vite le pasa esas
requests a la API en `http://localhost:4000` (`client/vite.config.js`; otra
dirección con `API_DEV_URL`). En producción, la misma API sirve el front
compilado (`client/dist`, o la carpeta de `FRONT_DIR`): una sola dirección,
como exige la cookie `SameSite=Strict`. Ver `render.yaml`.

Tests del front: `npm test` en `client/` (Vitest).

### 5. App en el celular (PWA)

La app se puede instalar en el celular (ícono, pantalla completa). Diseño:
`docs/superpowers/specs/2026-11-18-pwa-design.md`.

- **Android (Chrome):** abrir la dirección de la app → "Instalar app" (o ⋮ → Instalar app).
- **iPhone (Safari):** abrir la dirección → Compartir → "Agregar a inicio".

Cómo funciona:
- El service worker (`vite-plugin-pwa`, config en `client/pwa.config.js`) guarda
  solo las pantallas de la app. **Nunca guarda ni contesta `/api`**: los datos y
  la sesión siempre vienen de la API.
- Cuando se publica una versión nueva, aparece "Hay una versión nueva" con el
  botón "Actualizar" (`client/src/components/AvisosApp.jsx`). Nunca se recarga
  sola. Se revisa cada hora y cada vez que se vuelve a la app.
- Sin señal, la app abre y muestra "Sin conexión"; lo que se cargue no se guarda.
  Trabajar sin señal (guardar en el celular y sincronizar) es otro proyecto.
- Apagada en `npm run dev`: para probarla, `npm run build` y abrir la API que
  sirve `client/dist`.
- Íconos: `client/public/icono.svg` es la fuente; los PNG se regeneran con los
  pasos de `client/pwa-assets.config.js`.

## Seguridad

| Tema | Cómo funciona | Configurable en `.env` |
| ---- | ------------- | ---------------------- |
| Sesión | Token aleatorio en una cookie `httpOnly` y `SameSite=Strict`. En la base se guarda solo su SHA-256. Logout, desactivar al usuario o cambiarle la contraseña la cierran al instante. | — |
| Vencimiento | Por inactividad y por tiempo máximo desde el login, lo que pase primero. | `SESION_INACTIVIDAD_MINUTOS` (30), `SESION_MAXIMA_HORAS` (8) |
| Bloqueo por cuenta | Tras varios intentos fallidos seguidos, la cuenta queda bloqueada un rato. Las sesiones ya abiertas siguen. Un administrador la puede desbloquear. | `LOGIN_MAX_INTENTOS` (5), `LOGIN_BLOQUEO_MINUTOS` (15) |
| Límite por IP | Logins fallidos por IP cada 15 minutos, sin importar el usuario. Los correctos no cuentan. | `LOGIN_MAX_FALLOS_POR_IP` (100) |
| Contraseñas | bcrypt costo 12. De 10 caracteres a 72 bytes (lo que bcrypt usa de verdad), sin reglas de composición. Los hashes viejos se rehacen solos al entrar. | — |
| Contraseña temporal | La que pone un administrador (al crear o al restablecer) se tiene que cambiar en el primer ingreso. Mientras tanto la API solo deja usar `/verify`, `/password` y `/logout`. | — |
| CSRF | Cookie `SameSite=Strict`, y además la API rechaza los POST/PUT/PATCH/DELETE con un `Origin` que no sea el del front. | `CLIENT_URL` |
| Encabezados | helmet (sin `X-Powered-By`, `nosniff`, HSTS, etc.). Las respuestas de `/api` no se guardan en caché. | — |
| Auditoría | Tabla `auditoria`. Ver los códigos más abajo. | — |

### Antes de producción

- **HTTPS siempre.** Con `NODE_ENV=production` la cookie se marca `Secure` y se
  llama `__Host-sapsa_sesion`.
- **El front y la API en la misma dirección**: la API sirve el front compilado
  y queda bajo `/api`. Dos subdominios de `onrender.com` cuentan como sitios
  distintos, y `SameSite=Strict` impediría que el navegador mande la cookie.
- **`CLIENT_URL`**: vacía, en Render se usa `RENDER_EXTERNAL_URL`. Hay que
  cargarla si se agrega un dominio propio.
- **Si hay un proxy delante** (IIS, nginx), poné `TRUST_PROXY=1`. Si no, la API
  ve a todos con la IP del proxy: el límite por IP se vuelve uno solo para
  todos y la auditoría pierde la IP real.

### Códigos de auditoría

| Acción | Quién (`usuario_id`) | Detalle |
| ------ | -------------------- | ------- |
| `LOGIN_OK` | el que entró | — |
| `LOGIN_FALLIDO` | la cuenta, o vacío si no existe | `motivo`: `password`, `usuario_inexistente`, `bloqueado`, `desactivado` |
| `USUARIO_BLOQUEADO` | la cuenta | `hasta` |
| `USUARIO_DESBLOQUEADO` | el administrador | — (`entidad_id` = el usuario) |
| `LOGOUT` | el que salió | — |
| `PASSWORD_CAMBIADA` / `PASSWORD_CAMBIO_FALLIDO` | el propio usuario | — |
| `PASSWORD_RESTABLECIDA` | el administrador | — (`entidad_id` = el usuario) |
| `USO_SUELO_CREADO` / `_EDITADO`, `CATEGORIA_CREADA` / `_EDITADA`, `CAMPO_CREADO` / `_EDITADO`, `POTRERO_CREADO` / `_EDITADO` | quien lo hizo | Alta: el nombre. Edición: `{ antes, despues }` con lo que cambió |
| `PARAMETRO_CAMBIADO` | quien lo hizo | `{ antes, despues }` (`entidad_id` = la clave) |
| `IMPORTACION_CONFIRMADA` / `IMPORTACION_DESCARTADA` | quien lo hizo | archivo, hoja, fecha, campo, potreros nuevos, versiones, cabezas |
| `STOCK_CAMBIADO` | quien lo hizo | `{ fecha, antes, despues, nota? }` con las líneas (categoría, cabezas, peso) |
| `USO_SUELO_CAMBIADO` | quien lo hizo | `{ antes: { uso, desde }, despues: { uso, desde } }` |
| `MOVIMIENTO_REGISTRADO` | quien lo hizo | fecha, cabezas, peso, modo, lote y potrero de origen y destino, categorías |
| `LOTE_EDITADO` | quien lo hizo | `{ antes: { nombre }, despues: { nombre } }` |
| `MOVIMIENTO_REVERTIDO` | quien lo hizo | `entidad_id` = el movimiento deshecho; fecha, cabezas, modo original, origen y destino |

Si alguien escribe un usuario que no existe, ese nombre **no** se guarda: a
veces es la contraseña tipeada en el campo equivocado.

## Modelo de datos

`prisma/schema.prisma` es la fuente de verdad. En PostgreSQL las tablas quedan
en snake_case.

| Modelo | Para qué |
| ------ | -------- |
| `Usuario` | Login por `usuario`. `email` y `codigoCigam` opcionales y únicos. `esSuperadmin` es un indicador, no un rol. No se borran: se desactivan (`activo`). |
| `Rol` | Agrupa permisos. Editable. |
| `Modulo` | Sección de la app / entrada del menú. `clave` es lo que usa el código; `nombre`, lo que se ve. |
| `Permiso` | Un par módulo + acción (`VER`, `CREAR`, `EDITAR`, `APROBAR`, `ANULAR`). |
| `UsuarioRol`, `RolPermiso` | Relaciones muchos a muchos. Un usuario puede tener varios roles. |
| `Sesion` | Sesiones abiertas: hash del token, último uso, vencimiento, IP y navegador. Las vencidas se borran al arrancar la API y cada hora. |
| `Auditoria` | Quién, qué, cuándo, sobre qué registro, detalle e IP. Desde la fase 3: logins y contraseñas. En la fase 4 se suman los cambios de usuarios y roles. |

### Pecuaria (DECISIONES §10)

Las columnas `id_*_cigam` son las claves para unir con CIGAM más adelante (vacías hasta que haya conexión). El historial nunca se pisa: cada cambio agrega filas.

| Modelo | Para qué |
| ------ | -------- |
| `Campo` | Estancia, granja o confinamiento (sigla EG, ES…). En CIGAM: TEA3FAZENDA. |
| `Potrero` | La unidad de la planilla ("42.1", "8.2/3/4/5"). Hectáreas y marca "a confirmar". Tipo `CORRAL` para el feedlot. En CIGAM: área de manejo. |
| `Subdivision` | Cada parte de un potrero agrupado ("8.2"). En CIGAM: TEA3TALHAO. |
| `UsoSuelo`, `Categoria` | Catálogos editables, con alias (cómo los escribe la planilla, normalizados). El uso tiene grupo: CN, VERDEO, CORRAL u OTRO. |
| `Parametro` | Valores configurables. `KG_POR_UG` = 380. |
| `PotreroUso` | Historial del uso de suelo de cada potrero (desde / hasta). |
| `Lote` | Grupo de animales que identifica el encargado: una categoría, un potrero a la vez; un potrero puede tener varios. En CIGAM: lote de manejo. |
| `VersionStock`, `VersionStockLinea` | Foto del stock de un potrero en una fecha: cabezas y peso promedio de cada lote. El stock actual es la última versión. |
| `Movimiento` | Animales que pasan de un lote a otro (SUMAR, NUEVO o ENTERO), con las versiones que generó en cada potrero. |
| `Importacion` | Archivo subido (planilla o bastón). `PENDIENTE` = vista previa. |
| `SesionBaston`, `LecturaBaston` | Lecturas de caravanas de un archivo del bastón. |

Después de cambiar el esquema: `npm run db:migrate -- --name descripcion-del-cambio`.

## API

Todas las rutas van bajo `/api`. Los errores siempre tienen la forma
`{ "errors": ["mensaje", ...] }`, y algunos traen además un `code` fijo para el
front: `SESION_VENCIDA` (401), `DEBE_CAMBIAR_PASSWORD` (403),
`USUARIO_BLOQUEADO` y `DEMASIADOS_INTENTOS` (429).

| Método | Ruta | Quién | Qué hace |
| ------ | ---- | ----- | -------- |
| POST | `/login` | público | Inicia sesión con `{ usuario, password }` |
| POST | `/logout` | público | Cierra la sesión (y la borra de la base) |
| GET | `/verify` | con sesión | Usuario actual, con sus roles |
| PUT | `/password` | con sesión | Cambia la propia contraseña (`{ passwordActual, passwordNueva }`); cierra las otras sesiones |
| GET | `/users` | superadmin* | Lista los usuarios |
| POST | `/users` | superadmin* | Crea un usuario (`rolIds` opcional); la contraseña es temporal |
| PUT | `/users/:id/roles` | superadmin* | Reemplaza los roles (`{ rolIds: [] }`) |
| PATCH | `/users/:id/estado` | superadmin* | Activa o desactiva (`{ activo }`); desactivar cierra sus sesiones |
| PUT | `/users/:id/password` | superadmin* | Restablece con una temporal (`{ password }`); cierra sus sesiones y lo desbloquea |
| POST | `/users/:id/desbloquear` | superadmin* | Levanta el bloqueo por intentos fallidos |
| GET | `/roles` | superadmin* | Lista los roles |

\* Temporal: en la fase 4 cada ruta exige su permiso (por ejemplo, `usuarios: CREAR`).

**Pecuaria** (`/api/pecuaria`): en la v1, cualquier usuario con sesión. Cada cambio queda en la auditoría.

| Método | Ruta | Qué hace |
| ------ | ---- | -------- |
| GET / POST | `/usos-suelo` | Lista / crea un uso (`{ nombre, grupo, alias? }`) |
| PATCH | `/usos-suelo/:id` | Edita nombre, grupo, orden, activo o alias |
| GET / POST | `/categorias` | Lista / crea una categoría (`{ nombre, especie?, alias? }`) |
| PATCH | `/categorias/:id` | Edita la categoría |
| GET | `/parametros` | Lista los parámetros |
| PUT | `/parametros/:clave` | Cambia un valor (`{ valor }`) |
| GET / POST | `/campos` | Lista / crea un campo (`{ sigla, nombre, tipo? }`) |
| PATCH | `/campos/:id` | Edita el campo |
| GET / POST | `/campos/:campoId/potreros` | Lista / crea un potrero (`{ nombre, tipo?, hectareas?, hectareasAConfirmar?, subdivisiones? }`) |
| PATCH | `/potreros/:id` | Edita el potrero |
| POST | `/importaciones/planilla?archivo=&hoja=&campo=` | Sube la planilla (el .xlsx tal cual en el cuerpo, hasta 5 MB) y devuelve la vista previa. No guarda nada salvo la importación PENDIENTE. Por defecto, la hoja más reciente y el campo EG |
| GET | `/importaciones/:id` | Vuelve a ver la vista previa |
| POST | `/importaciones/:id/confirmar` | Carga lo previsto (`{ fecha?, nombreCampo? }`): crea campo y potreros que falten, actualiza el uso de suelo y agrega una versión de stock por potrero |
| POST | `/importaciones/:id/descartar` | Descarta la vista previa |
| GET | `/potreros/:id` | Detalle: stock actual por categoría y cálculos (Cab./ha, Kg PV/ha, UG/ha; no se guardan) |
| GET | `/potreros/:id/historial` | Versiones de stock y usos de suelo, del más nuevo al más viejo |
| PUT | `/potreros/:id/stock` | Versión nueva a mano (`{ fecha?, lineas: [{ categoriaId, cabezas, pesoPromedioKg? }], nota? }`). Devuelve `{ potrero, aviso }`: aviso si la fecha es anterior al último dato |
| PUT | `/potreros/:id/uso` | Cambia el uso de suelo (`{ usoSueloId, desde? }`): cierra el vigente y abre el nuevo |
| GET | `/campos/:campoId/resumen` | Categorías × CN / Verdeos / Corral / Otro / Total, y la carga por grupo |
| PATCH | `/lotes/:id` | Renombra un lote (`{ nombre }`) |
| GET | `/campos/:campoId/movimientos?desde=&hasta=&potreroId=&loteId=&categoriaId=` | Todos los movimientos del campo, del más nuevo al más viejo, con `resumen` (cantidad y cabezas movidas) y `puedeRevertir` |
| POST | `/movimientos/:id/revertir` | Deshace un movimiento (si después no hubo otros cambios en esos potreros): registra un movimiento REVERSION |
| GET | `/lotes/:id` | El lote, dónde está, qué tiene y sus movimientos |
| POST | `/movimientos/vista-previa` | Calcula un movimiento sin guardar: antes y después de los dos potreros |
| POST | `/movimientos` | Registra un movimiento (`{ fecha?, loteOrigenId, cabezas, pesoPromedioKg?, destinoPotreroId, modo: SUMAR \| NUEVO \| ENTERO \| CATEGORIA, loteDestinoId?, nuevoLote?: { nombre?, categoriaId }, categoriaId?, nota? }`): una versión nueva en cada potrero, en un solo paso |

No existe `/register`: los usuarios los crea un administrador. Nadie puede
cambiar sus propios roles o estado, ni restablecer la contraseña de un
superadministrador desde la app.
