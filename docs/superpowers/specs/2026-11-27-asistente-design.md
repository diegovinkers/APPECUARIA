# Asistente de la app (bot que entiende lo que le pedís): diseño

Pedido de Diego del 27/11/2026. **Fase 1 hecha (27/11), esperando el OK.** Ver "Fase 1: cómo quedó" al final.

## Qué es

Una pantalla **Asistente** con un chat. Se le escribe, o se le habla con el micrófono del teclado del celular, y hace lo que se le pide usando lo que la app ya sabe hacer.

Ejemplos:

- "¿Cuántos terneros hay en La Gateada?"
- "¿Qué potreros llevan más de 30 días de descanso?"
- "¿Qué procesos tienen la ecografía atrasada?"
- "¿Qué se movió ayer en El Silencio?"
- "Mové 50 vaquillonas del 8.1 al 12."
- "Anotá una pesada en el lote Frente A: 262 kg."
- "Vendimos 30 novillos del P 55 a USD 3,30 el kilo, 480 kg."

## Por qué ahora

- La app ya hace muchas cosas, y cada una tiene su pantalla y sus pasos. Para alguien en el campo, decir "mové 50 vaquillonas del 8.1 al 12" es más rápido que recorrer el "+".
- Todo lo que se registra ya pasa por los mismos controles: **vista previa → confirmar**, **permisos por acción** (VER, CREAR, ANULAR, EDITAR), **alcance por estancia** y **auditoría**. El asistente usa esos mismos caminos: no hay una puerta nueva para cambiar datos.
- El servidor ya tiene la librería de Claude (`@anthropic-ai/sdk`), que se instaló para los precios de INAC (`server/src/pecuaria/precios.claude.js`).

## Cómo funciona

```
Celular / compu                 Nuestro servidor                    Claude (Anthropic)
───────────────                 ────────────────                    ──────────────────
"Mové 50 vaquillonas      →     POST /api/asistente           →     entiende el pedido y
 del 8.1 al 12"                 (con el login de quien habla)       elige herramientas
                                                              ←     "buscar potrero 8.1",
                                ejecuta la herramienta              "ver lotes del 8.1"…
                                con los permisos y el alcance
                                de ese usuario                →     arma el movimiento
                                                              ←     "proponer movimiento"
                                corre la VISTA PREVIA
Tarjeta: "De 8.1 a 12:    ←     devuelve la propuesta
 50 Vaquillonas…"               (ruta + datos + vista previa)
 [Confirmar] [Cancelar]

Toca Confirmar            →     POST /api/pecuaria/movimientos  (la ruta de siempre:
                                validación, permisos, alcance, auditoría)
```

- **Herramientas:** son funciones de la app que Claude puede pedir. Claude no toca la base: pide "ver el stock del potrero X" y nuestro servidor lo resuelve y le devuelve el resultado.
- **Dónde corre:** el ida y vuelta con Claude está en nuestro servidor (Messages API), no en los agentes que Anthropic aloja en sus servidores: las herramientas tienen que usar el login, los permisos y la base de la app.
- **Las acciones nunca se ejecutan solas.** Lo más que hace el asistente es la vista previa. La propuesta vuelve a la pantalla como una tarjeta, y **la persona toca Confirmar**. Ese botón llama a la misma ruta que usan las pantallas de hoy (por ejemplo `POST /pecuaria/movimientos`), así que pasa por la misma validación (zod), los mismos permisos, el mismo alcance y la misma auditoría.
- **Cuando hay dudas, pregunta.** Por ejemplo, si en el 8.1 hay dos lotes de vaquillonas: "¿Cuál: Vaquillonas 1-2 (30) o Vaquillonas +2 (40)?". Las opciones aparecen como botones.

## Reglas de seguridad

1. **Solo puede lo que puede la persona.** Cada herramienta declara su permiso (`pecuaria:VER`, `pecuaria:CREAR`…) y se controla con la misma función que usan las rutas. Las lecturas usan el mismo filtro de estancias (`filtroCampos`, `alcance.js`): lo de otra estancia no existe para el asistente.
2. **Nada se registra sin el toque de Confirmar** (ver arriba).
3. **Auditoría:** lo que se confirma desde el asistente queda auditado como siempre, y además marcado como "desde el asistente". La pantalla manda una cabecera (`X-Origen: asistente`) y `registrar()` la guarda en el detalle.
4. **Sin herramientas de administración:** nada de usuarios, roles, permisos, contraseñas ni configuración.
5. **Datos escritos por la gente:** el nombre de un lote o una nota podrían traer un texto que "le dé órdenes" al asistente. Las reglas 1 y 2 lo cubren: el asistente no puede salirse de los permisos de la persona, y nada se registra sin que ella confirme.
6. **Límites:** una cantidad máxima de pedidos por persona (express-rate-limit), un máximo de idas y vueltas con Claude por pregunta (8) y un largo máximo de la conversación.

## Herramientas

### Fase 1: solo preguntas (lectura, `pecuaria:VER`)

| Herramienta | Usa | Para |
|---|---|---|
| `buscar_potrero` | la búsqueda de la app (`busqueda.js`, pasada al servidor) | "8.1", "p1", "frente a" → el potrero |
| `stock_potrero` | `detallePotrero` | lotes, cabezas, peso, carga, pasto, descanso |
| `lista_potreros` | `GET /potreros` (con filtros) | "¿qué potreros tienen terneros?", "¿cuáles están vacíos?" |
| `resumen` | `GET /resumen` | categorías por estancia y por grupo, valor del ganado |
| `historial` | `GET /movimientos` (`ver=movimientos/eventos`) | "¿qué se movió ayer?", "¿cuántos se vendieron este mes?" |
| `lote` | `GET /lotes/:id` | historial y familia de un lote |
| `procesos` | `GET /procesos` y `GET /procesos/:id` | "¿qué ecografías están atrasadas?", próximo evento |
| `feedlot` | `GET /feedlots` | corrales, días de encierre, salidas próximas |
| `precios` | `GET /precios/ultimos` | precios de INAC de la semana |

El catálogo (estancias, categorías con sus alias, usos de suelo y tipos de movimiento) va en las instrucciones de cada conversación. Así Claude entiende "vaquillonas" o "EG" sin tener que preguntar.

### Fase 2: acciones con confirmación (`pecuaria:CREAR`)

Cada una corre **solo la vista previa** y devuelve la propuesta:

| Herramienta | Vista previa | Al confirmar |
|---|---|---|
| `proponer_movimiento` | `POST /movimientos/vista-previa` | `POST /movimientos` |
| `proponer_entre_campos` | `POST /movimientos/entre-campos/vista-previa` | `POST /movimientos/entre-campos` |
| `proponer_entrada_salida` | `POST /entradas-salidas/vista-previa` | `POST /entradas-salidas` (compra, venta con precio, muerte con causa, nacimiento) |
| `proponer_evento` | `POST /eventos-registro/vista-previa` | `POST /eventos-registro` (pesada, recuento, sanidad…) |
| `proponer_pasto` | (sin vista previa: se arma la recorrida) | `POST /pasto` |

### Fase 3: más adelante, si sirve

- Etapas de los procesos (ecografía, parición, destete), que tienen muchos datos y conviene hacer con calma.
- Revertir y anular, con confirmación y con `pecuaria:ANULAR`.
- Foto del bastón o de una planilla → propuesta de carga.
- El mismo asistente por WhatsApp (lo que Diego ya hace en `agenda-uy` y `appe`).

## La pantalla

- **Fase 1:** "Asistente" en el menú ☰. La barra de abajo ya está llena; si se usa mucho, después se le busca un lugar fijo.
- Chat con burbujas, las respuestas apareciendo de a poco (streaming) y un esqueleto mientras piensa.
- Las respuestas con números van en una tabla chica. Si el asistente menciona un potrero, un lote o un proceso, se puede tocar para abrir su ficha.
- Las tarjetas de propuesta muestran la vista previa de siempre ("queda 8.1 con 30, el 12 con 50") con **Confirmar** y **Cancelar**. Si después de armarla alguien movió algo, la ruta de siempre da el error de siempre y el asistente lo cuenta.
- Para hablarle se usa el micrófono del teclado del celular, que es gratis y ya anda. Un botón de micrófono propio se agrega solo si hace falta.
- La conversación vive en la pantalla. Al salir de la página se pierde, y hay un botón "Nueva conversación".

## Modelo y costo

- **Modelo:** Claude Opus 5.5, el más capaz de uso general, con poco esfuerzo de razonamiento (`effort: low` o `medium`). Para preguntas cortas puede andar bien Claude Haiku 5.5, que es mucho más barato. **Se miden los dos en la fase 1 con preguntas reales, y Diego elige.**
- **Costo aproximado por pregunta** (de 2 a 4 idas y vueltas, con caché):
  - Opus 5.5: unos USD 0,05 a 0,15 (entre 5 y 15 dólares cada 100 preguntas).
  - Haiku 5.5: menos de USD 0,01 (unos 20 centavos de dólar cada 100 preguntas).
  - El número real se mide en la fase 1: cada pregunta guarda los tokens que usó.
- **Tope:** poner un límite de gasto mensual en la consola de Anthropic, para que un error no se lleve una sorpresa.
- **Clave:** la misma `ANTHROPIC_API_KEY` que necesitan los precios de INAC, cargada por Diego en Railway. Nunca va en el código ni en el chat. Sin la clave, la pantalla dice "El asistente no está configurado".

## Confidencialidad

- A Claude le llegan los datos del campo y del ganado (potreros, cabezas, kilos, precios). La regla del 17/11 lo permite.
- No le llegan datos sensibles: el asistente no tiene herramientas de usuarios, roles ni auditoría, y no se le manda el nombre ni el email de quien pregunta. Para Claude, la persona es "el usuario".
- Lo que se manda a la API de Anthropic no se usa para entrenar modelos.

## Qué se guarda

- Una fila por pregunta en una tabla nueva, `asistente_consulta`: usuario, fecha, herramientas usadas, tokens, si terminó en una propuesta y si se confirmó. Sirve para ver el costo y qué se pide más.
- **El texto de las preguntas y de las respuestas:** a decidir por Diego (pregunta 3). Guardarlo ayuda a mejorar el asistente; no guardarlo es más simple.

## Tests

- Las herramientas, contra la base de test: cada una respeta el permiso y el alcance (lo de otra estancia no aparece), y las de la fase 2 nunca registran nada.
- El ida y vuelta, con el cliente de Claude simulado, como en `precios-respaldo.test.js`: un pedido → herramientas → propuesta, el tope de 8 idas y vueltas, las respuestas cortadas o rechazadas, y qué pasa sin la clave.
- La pantalla: burbujas, tarjeta de propuesta, Confirmar llama a la ruta de siempre con `X-Origen: asistente`, y Cancelar no llama a nada.
- Un set chico de preguntas reales ("¿cuántos terneros hay en EG?") con la respuesta esperada, para comparar los modelos y no empeorar con los cambios. Se corre a mano, porque cuesta plata.

## Fases

1. **Solo preguntas:** servidor (`src/asistente/`: rutas, herramientas de lectura, ida y vuelta con Claude), pantalla de chat, tabla `asistente_consulta`, tests y la comparación de modelos. Al terminar, Diego lo prueba con preguntas del campo.
2. **Acciones con confirmación:** las herramientas `proponer_*`, las tarjetas, `X-Origen` en la auditoría y los tests.
3. **Lo que sirva** de la lista de la fase 3, de a uno.

## Preguntas para Diego

1. **¿Quién lo usa primero?** ¿Vos y el jefe, o también los encargados en el campo? Si lo usan los encargados, importan más la voz y las respuestas cortas.
2. **¿Qué modelo?** Propuesta: medir los dos en la fase 1 y decidir con los números.
3. **¿Se guarda el texto de las preguntas?** Propuesta: sí, por 90 días, solo para mejorar el asistente.
4. **¿Nombre?** "Asistente" u otro.
5. **La clave de Anthropic** (`ANTHROPIC_API_KEY`) y un tope de gasto mensual, cargados por vos en Railway y en la consola de Anthropic. Es la misma clave que esperan los precios de INAC.

## Fuera de esto

Usuarios, roles, permisos y configuración; importar planillas; leer CIGAM; WhatsApp (puede venir en la fase 3).

## Fase 1: cómo quedó (27/11)

- **Modelo:** Claude Haiku 5.5 (decisión de Diego), con `effort: low`. Se cambia con `ASISTENTE_MODELO`.
- **Servidor** (`server/src/asistente/`):
  - `herramientas.js`: 9 herramientas de lectura (`buscar_potreros`, `ficha_potrero`, `resumen`, `historial`, `ver_lote`, `procesos`, `ficha_proceso`, `feedlot`, `precios_inac`), con la entrada en zod y el resultado resumido.
  - `limpiar.js`: saca los datos de personas (quién registró, emails, IPs) y los códigos de CIGAM, redondea y recorta lo largo (14.000 caracteres).
  - `llamar.js`: las herramientas llaman a las rutas de siempre con la cookie de la persona. La app escucha también en `127.0.0.1`, en un puerto que elige el sistema (no se ve desde afuera). Se probó `light-my-request` (pedidos sin red), pero con Express cambia el prototipo de todas las requests de la app: se descartó.
  - `busqueda.js`: copia del buscador del front (un test controla que sean iguales).
  - `instrucciones.js`: las instrucciones con el catálogo de la persona; se guardan con la conversación, así la caché sirve. La fecha va en cada pregunta.
  - `asistente.service.js` y `asistente.routes.js`: `POST /api/asistente` (NDJSON: `conversacion`, `buscando`, `texto`, `fin` o `error`) y `GET /api/asistente/estado`. Hasta 8 vueltas por pregunta (en la última, sin herramientas), 30 preguntas por conversación y 40 preguntas cada 10 minutos por persona.
  - Migración `asistente`: tablas `asistente_conversacion` y `asistente_consulta`. A los 90 días se borran las conversaciones y el texto de las consultas (`purgarAsistente`, cada hora en `index.js`).
- **Pantalla** `/asistente` (menú ☰ → Campo → Asistente; pide `pecuaria:VER`): `pages/AsistentePage.jsx`, `api/asistente.js` (lee la respuesta de a poco con `fetch`) y `components/asistenteFormato.jsx` (Markdown chico: párrafos, listas, negrita, tablas y enlaces solo internos). Ejemplos para tocar, "Nueva conversación", Enter manda. Tirar para actualizar no se usa ahí (borraría la conversación).
- **Probado con datos reales** (base de desarrollo, Chrome sin ventana a 375 y 1280 px): "¿Cuántos terneros hay en La Gateada…?" contestó bien en 7 s, con 2 herramientas, por unos USD 0,002.
- **Tests:** `server/test/asistente.test.js` (21, con Claude simulado), `client/src/components/asistenteFormato.test.js` y `client/src/pages/AsistentePage.test.jsx`.
- **Para publicar:** cargar `ANTHROPIC_API_KEY` en Railway. Sin la clave, la pantalla dice "no está configurado".

## Cajón con historial, un chat por persona (27/11, pedido de Diego)

- **Botón "IA"** en la barra de arriba (entre el tema y las iniciales), para quien tiene `pecuaria:VER`. Abre el asistente como un **cajón desde la derecha** (`components/PanelAsistente.jsx`), como el de los filtros de la izquierda. Queda armado aunque se cierre o se cambie de pantalla (vive en el Marco); Escape lo cierra. En el celular, tocar un enlace de la respuesta cierra el cajón para ver la ficha. Se borró la pantalla `/asistente` y su ítem del menú.
- **Un chat por persona:** al abrirse muestra el **historial de sus consultas** (`GET /api/asistente/historial`, de a 30, "Ver anteriores"), con separadores Hoy / Ayer / fecha.
- **Lo que recuerda Claude:** la conversación de las últimas 12 horas (`HORAS_DE_CONTEXTO`) o hasta 30 preguntas; después arranca otra por dentro, y en la pantalla se sigue viendo un solo chat. No se recorta la conversación vieja: la API no deja editar el medio de una conversación con razonamiento guardado.
- **Pendiente de ver:** a 360 px, el selector de estancia queda más angosto ("La ...").
