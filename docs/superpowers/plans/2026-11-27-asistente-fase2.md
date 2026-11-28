# Asistente, fase 2: acciones con Confirmar (plan)

Diseño: `docs/superpowers/specs/2026-11-27-asistente-design.md` (fase 2). Pedido de Diego del 27/11/2026. **Plan aprobado por Diego el 27/11/2026**, con las cuatro respuestas recomendadas (ver el final).

## Qué se va a poder hacer

Pedirle al asistente, escrito o con el micrófono del teclado:

- "Mové 50 vaquillonas del 8.1 al 12." (mover dentro de la estancia)
- "Pasá el lote Frente A entero de EG a La Seda, guía 12345." (entre estancias)
- "Vendimos 30 novillos del P 55 a USD 3,30 el kilo, 480 kg." · "Se murieron 2 terneros en el 12, causa diarrea." · "Compramos 40 vaquillonas, van al 8.1." (entradas y salidas)
- "Anotá una pesada en el lote Frente A: 262 kg." · "Recuento en el 12: había 48." · "Vacuné todo EG contra aftosa." (eventos)
- "Pasto: el 8.1 bajo, el 12 alto, el 15 medio." (recorrida de pasto)

El asistente arma la propuesta, corre la **vista previa de siempre** y la muestra como una tarjeta en el chat, con **Confirmar** y **Cancelar**. Nada se registra hasta que la persona toca Confirmar.

## Cómo funciona

```
"Mové 50 vaquillonas      →  Claude busca el potrero y los lotes (fase 1)
 del 8.1 al 12"           →  pide proponer_movimiento { loteId, cabezas, destino… }
                             nuestro servidor:
                               1. arma el cuerpo de la ruta de siempre
                               2. corre POST /movimientos/vista-previa (con la cookie de la persona)
                               3. guarda la propuesta (tabla asistente_propuesta, PENDIENTE)
                               4. manda la tarjeta a la pantalla
Tarjeta: "De 8.1 a 12:    ←  Claude contesta corto: "Te dejé la propuesta para confirmar."
 50 Vaquillonas 1-2
 8.1: 80 → 30 · 12: 0 → 50"
 [Confirmar] [Cancelar]

Confirmar                 →  POST /api/asistente/propuestas/:id/confirmar
                               el servidor llama a POST /movimientos (la ruta de siempre:
                               zod, permisos, alcance, auditoría) con la cookie de la persona
                               y la marca X-Origen: asistente
                          ←  "Registrado" + enlace a la ficha (o el error de siempre)
```

### Una decisión distinta del diseño (para que la apruebes)

El diseño decía que la pantalla llama sola a la ruta de siempre al tocar Confirmar. Propongo que **la propuesta quede guardada en el servidor** y que Confirmar pase por `POST /api/asistente/propuestas/:id/confirmar`. Ese llamado usa por dentro la misma ruta de siempre: pasa por los mismos permisos, el mismo alcance y la misma auditoría.

Ventajas:

- **No se confirma dos veces.** La propuesta pasa de PENDIENTE a CONFIRMADA una sola vez, aunque se toque dos veces o se abra en dos celulares.
- **Lo que se confirma es exactamente lo que se vio.** El cuerpo queda guardado; la pantalla no lo arma ni lo puede cambiar.
- **Queda en el historial.** Al volver a abrir el chat, la tarjeta aparece con su estado ("Confirmada 14:32", "Cancelada", "Venció").
- **Claude se entera.** En la pregunta siguiente le llega "la propuesta #12 se confirmó (movimiento #345)" o "se canceló", y no la repite ni la da por hecha.
- Sirve igual el día que venga WhatsApp (fase 3): allá no hay pantalla que llame a la ruta.

## Reglas

1. **Solo quien tiene `pecuaria:CREAR` ve las herramientas `proponer_*`.** A quien no lo tiene, Claude ni se las ofrece, y le explica que no tiene permiso para registrar. Igual, la vista previa y la ruta de siempre lo controlan otra vez.
2. **Lo de otra estancia no existe**: las rutas de siempre contestan 404, como en la fase 1.
3. **La herramienta nunca registra**: solo llama a `…/vista-previa`. Un test lo controla para cada herramienta: después de proponer, la base no cambió.
4. **La propuesta vence a la hora** (VENCIDA). Si alguien movió algo mientras tanto, la ruta de siempre da el error de siempre ("en el 8.1 quedan 20"), la tarjeta lo muestra y la propuesta queda con ERROR. Para volver a intentar hay que pedirla de nuevo.
5. **Auditoría:** la fila de siempre (MOVIMIENTO_REGISTRADO, EVENTO_REGISTRADO, PASTO_REGISTRADO…) con `detalle.origen = 'asistente'` y el id de la propuesta. `registrar()` lo toma de la cabecera `X-Origen`, que solo pone el servidor al confirmar. Si alguien la manda a mano desde afuera, solo cambia esa marca: los controles son los mismos.
6. **Hasta 3 propuestas por respuesta** ("vendimos 30 y movimos 20" son dos tarjetas). Cada una se confirma por separado.
7. **Si hay dudas, pregunta antes de proponer.** Ejemplo: dos lotes de vaquillonas en el 8.1, o no dice el destino. Nunca supone cabezas ni potreros.

## Herramientas nuevas

Todas reciben ids de potreros y de lotes (salen de `buscar_potreros` y de `ficha_potrero`) y nombres del catálogo para el tipo, la categoría y la causa. El servidor resuelve los nombres a ids, como en la fase 1 (`buscarCategoria`, `buscarTipo`; `buscarCausa` es nueva).

| Herramienta | Arma el cuerpo de | Vista previa | Al confirmar |
|---|---|---|---|
| `proponer_movimiento` | `movimientoSchema`: lote, cabezas, potrero de destino, modo (SUMAR a un lote / NUEVO / ENTERO / CATEGORIA), "sigue siendo el mismo lote", peso, pasto al salir y al entrar, fecha, nota | `POST /movimientos/vista-previa` | `POST /movimientos` |
| `proponer_entre_campos` | `entreCamposSchema`: lo de mover, modo NUEVO o ENTERO, guía | `POST /movimientos/entre-campos/vista-previa` | `POST /movimientos/entre-campos` |
| `proponer_entrada_salida` | `entradaSalidaSchema`: tipo (COMPRA, VENTA, MUERTE, NACIMIENTO…), lote y cabezas (salida) o potrero y líneas (entrada), peso, causa, guía, precio de venta por kilo o por cabeza | `POST /entradas-salidas/vista-previa` | `POST /entradas-salidas` |
| `proponer_evento` | `eventoSchema`: tipo (pesada, recuento, vacuna…), a quién (lotes, potreros, categoría o estancia) y los datos del tipo | `POST /eventos-registro/vista-previa` | `POST /eventos-registro` |
| `proponer_pasto` | `recorridaPastoSchema`: potreros y altura (Bajo / Medio / Alto) | se arma la lista con los nombres (no hay vista previa) | `POST /pasto` |

Quedan fuera de esta fase:

- El movimiento múltiple.
- Empezar un proceso desde un entore (`empezarServicio`) y las etapas de los procesos (fase 3).
- El destete (va por los procesos).
- Revertir y anular (fase 3).

Si se los piden, el asistente dice que eso se hace desde la app y en qué botón.

Más:

- **El catálogo de las instrucciones suma las causas** de cada tipo (muerte, venta…), con el nombre. Así Claude sabe cuáles hay y cuándo son obligatorias. También qué tipos piden guía.
- `llamar.js` acepta `method` y `body` (hoy solo hace GET) y la cabecera `X-Origen`.

## Servidor

1. **Migración `asistente_propuestas`**: tabla `asistente_propuesta` con:
   - id, consulta, usuario y la herramienta;
   - la ruta y el cuerpo (JSON);
   - el resumen que se mostró y la vista previa (JSON);
   - el estado: PENDIENTE / CONFIRMADA / CANCELADA / VENCIDA / ERROR;
   - el resultado (el id del movimiento o del evento) o el error;
   - las fechas.
   
   A los 90 días se borra con lo demás (`purgarAsistente`).
2. `src/asistente/acciones.js`: las 5 herramientas `proponer_*`. Cada una tiene su entrada en zod, `armarCuerpo` (de lo que dijo Claude al cuerpo de la ruta), `resumir` (de la vista previa a la tarjeta: título, renglones antes → después, avisos) y `rutaConfirmar`.
3. `herramientas.js` y `asistente.service.js`:
   - `definiciones(permisos)` suma las `proponer_*` solo con CREAR.
   - Al proponer, se guarda la propuesta y se emite `{ tipo: 'propuesta', propuesta }`.
   - Claude recibe "Propuesta #12 lista para que la persona confirme", y nunca "registrado".
4. **Instrucciones nuevas** (`instrucciones.js`): se saca "esta versión solo consulta" y entra cómo proponer, cuándo preguntar antes, el tope de 3 y que nunca diga que algo quedó registrado.
   - Las conversaciones llevan una `version` de las instrucciones. Si cambia, la conversación arranca de nuevo por dentro (las de hoy tienen el texto de "solo consulta"). En la pantalla se sigue viendo un solo chat.
5. **Rutas:**
   - `POST /api/asistente/propuestas/:id/confirmar`: solo la persona dueña y solo si está PENDIENTE y no venció. Llama a la ruta de siempre con su cookie y `X-Origen: asistente`.
   - `POST /api/asistente/propuestas/:id/cancelar`.
   - `GET /api/asistente/historial` suma las propuestas de cada consulta.
6. **Lo que se confirma o cancela llega a Claude** en la pregunta siguiente: un renglón al principio, como la fecha.
7. **`audit.js`:** `registrar()` agrega `origen: 'asistente'` y `propuestaId` al detalle cuando viene la cabecera.

## Pantalla

- **Tarjeta de propuesta** (`components/TarjetaPropuesta.jsx`) debajo de la respuesta:
  - el título ("Mover 50 Vaquillonas 1-2");
  - los renglones de la vista previa ("8.1: 80 → 30 · 12: 0 → 50", "Venta: 30 × 480 kg × USD 3,30 = USD 47.520");
  - los avisos en ámbar (mezcla de categorías, sale de un proceso);
  - **Confirmar** (verde) y **Cancelar**.
- **Después de tocar:**
  - "✓ Registrado" con enlace a la ficha del potrero o del lote, y los botones desaparecen;
  - o el error en rojo;
  - o "Cancelada".
  - Mientras confirma, el botón queda gris ("Registrando…") y no se puede tocar dos veces.
- **En el historial**, cada tarjeta vuelve con su estado. Una PENDIENTE vencida dice "Venció: pedila de nuevo".
- **Sin permiso de registrar:** los ejemplos de arriba no ofrecen acciones.
- **Ejemplos:** se suma uno de acción para quien puede registrar ("Mové 20 terneros del 8.1 al 12").

## Tests

- **Servidor** (`asistente-acciones.test.js`, con Claude simulado, contra la base de test):
  - cada `proponer_*` arma el cuerpo correcto, corre la vista previa y **no cambia la base**;
  - sin CREAR, las herramientas no se ofrecen y la vista previa da 403;
  - lo de otra estancia da 404;
  - confirmar registra una sola vez (el segundo toque da error), con la auditoría marcada "asistente";
  - cancelar no registra nada;
  - la propuesta vencida no se confirma;
  - un cambio en el medio da el error de la ruta y queda ERROR;
  - otra persona no puede confirmar tu propuesta (404);
  - el tope de 3 por respuesta;
  - Claude se entera de lo confirmado;
  - las conversaciones con la versión vieja arrancan de nuevo.
- **Front:**
  - la tarjeta: renglones, avisos, Confirmar llama a `/confirmar` una sola vez, Cancelar, estados del historial, error;
  - `PanelAsistente` con el evento `propuesta`.
- **A mano** (cuesta unos centavos), con la base de desarrollo:
  - las frases de arriba, con Haiku;
  - si Haiku se equivoca seguido al armar los movimientos, probar las mismas con Sonnet 5.5 y te muestro las dos.

## Pasos

1. **Servidor:** migración, `llamar.js` con POST, `acciones.js`, la propuesta en el servicio, rutas de confirmar y cancelar, auditoría, instrucciones con versión y tests. Paro y te muestro.
2. **Pantalla:** la tarjeta, el historial con propuestas, ejemplos y tests. Lo reviso a 375 px contra la base de test con un escenario ficticio. Paro y te muestro.
3. **Prueba con frases reales** en la base de desarrollo, ajuste de las instrucciones y publicación (Railway y Render: la migración corre al arrancar). Lo probás vos en el celular.

## Avance (27/11/2026)

- **Paso 1, servidor:** hecho, sin commitear. 46 tests del asistente en verde (22 nuevos).
- Diferencia con el plan: la propuesta se guarda sin conversación y se le pone al guardar la pregunta (en una conversación nueva todavía no existe).
- **Paso 2, pantalla:** hecho, sin commitear (`TarjetaPropuesta.jsx` en el `PanelAsistente`). Front 454 en verde. No se revisó en el navegador con un escenario ficticio: se revisa en el paso 3, con frases reales.
- **Paso 3:** falta (prueba de Diego, commit y publicación).

## Decisiones de Diego (27/11/2026)

1. Confirmar pasa **por el servidor**, con la propuesta guardada.
2. La propuesta **vence a la hora**.
3. Entran **las cinco acciones**.
4. Dos pedidos en un mensaje son **dos tarjetas** (el movimiento múltiple, más adelante).
