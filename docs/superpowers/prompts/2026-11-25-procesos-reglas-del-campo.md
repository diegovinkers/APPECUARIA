# Prompt: Procesos con las reglas del campo (IATF → ecografía → entore una vez → engorde)

> Lo armó Claude a pedido de Diego (25/11/2026), después de revisar con él el flujo de Procesos con dibujos. Lo ejecuta Claude Code en esta carpeta, por fases.

---

## Tu rol

Sos el desarrollador full-stack de `C:\dev\sapsa-app` y cuidás que la app sea simple en el celular (375 px). Antes de tocar nada, leé:
- `CLAUDE.md` entero (sobre todo Procesos, fases 1 a 8, y el tablero del 24/11).
- `docs/superpowers/specs/2026-11-20-procesos-design.md` y `2026-11-20-procesos-ajustes-design.md`.
- `docs/superpowers/prompts/2026-11-24-tablero-iatf-entore.md` (la regla "la IATF es la primera oportunidad, el toro la segunda").

El código que tocás:
- **Servidor:** `server/src/pecuaria/procesos.service.js` (`acomodarAlEmpezar`, `cargaInseminacion`, `cargaFinInseminacion`, `cargaDiagnostico`, `cargaDecision`, `ejecutarDecision`, `abortoAVacias`, `cargaFinParicion`, `cargaDestete`, `cargaTanda`, `ficha`), `procesos.calculos.js` (`planDecision`, `etapaActual`), `procesos.datos.js`, `procesos.plantillas.js` y `procesos.tablero.js`.
- **Front:** `pages/pecuaria/NuevoProcesoPage.jsx`, `ProcesoEtapaPage.jsx`, `ProcesoPage.jsx`, `components/procesos.js`, `tablero.js` y `TableroProcesos.jsx`.

## El principio (en palabras de Diego)

> IATF: inseminan, hacen ecografía, las preñadas se mueven. Las vacías se mandan a engordar o a entore **una vez**. Si en el entore vuelve vacía, se va a engordar.

```
IATF ──► Ecografía ──► Preñadas: se mueven y siguen el ciclo (parición → cría al pie → destete)
                  └──► Vacías ──► Engorde (salen del proceso)
                             └──► Entore con toros (1 sola vez) ──► Ecografía ──► Preñadas: siguen el ciclo
                                                                             └──► Vacías: engorde
Un rodeo que empieza con entore entra directo en "Entore con toros".
```

**Nunca se entora dos veces seguidas.**

## Las reglas

### R1. Al separar, una de las partes cambia de potrero
Si la app parte un grupo en dos (inseminadas y sin inseminar, preñadas y vacías, ecografiadas y sin ecografiar), **las dos partes no pueden quedar en el mismo potrero**: en el campo nadie las podría distinguir. Al menos una de las partes tiene que tener otro potrero de destino. El servidor lo controla (error claro) y el front no deja seguir sin elegirlo.
- **Excepción:** las paridas con su cría y las preñadas que todavía no parieron **conviven hasta el destete** (la parición sigue creando sus partes en el mismo potrero, como hoy).

### R2. Arranque de la IATF
- Se elige el potrero y la app dice cuántas hay ("En P8 hay 103"). Se pregunta cuántas se inseminan.
- **Todas (103):** se ofrece "Se quedan en P8" o "Moverlas a…".
- **Menos (por ejemplo 80):** **no** se ofrece quedarse. Hay que elegir qué parte se va: "Las 80 inseminadas a…" o "Las 23 sin inseminar a…". La otra se queda.
- Lo mismo vale para "Otro día de inseminación" (desde el lote "sin inseminar").

### R3. Las sin inseminar
- Quedan aparte (por R2) y se pueden inseminar otro día, moverse, o no hacer nada.
- **"Terminar la inseminación"** pregunta solo: **"Salen del proceso"** (se pueden mover) o "Las dejo para otro día" (no hace nada). Se va la opción **"Repaso con toro"**: si meten un toro antes de la ecografía, se hace por fuera de la app.
- Lo ya guardado con `FIN_INSEMINACION` destino `REPASO` se sigue mostrando como está.

### R4. Ecografía: se decide y se separa en el momento
- **Se va "Decidir después"** para cargas nuevas. Las vacías siempre tienen destino al confirmar.
- **Preñadas y vacías se separan siempre (Diego, 25/11):** o se van las vacías, o se van las preñadas (o las dos, a potreros distintos). Lo que no puede pasar es que queden las dos en el mismo potrero (R1). La pantalla pregunta "¿Quiénes se van?" (Las vacías · Las preñadas · Las dos) y pide el potrero de las que se van.
- **El destino de las vacías** (vayan o se queden):
  - **De una IATF:** "Entore con toros (1 vez)" o "Engorde".
  - **De un entore** (incluido el entore de vacías que vinieron de una IATF): **solo "Engorde"**.
  - **Engorde** = salen del proceso (`LIBRES`, destino `INVERNADA`), con la categoría de invernar sugerida (`sugerirCategoria('VACIA', …)`), editable.
- **Preñadas de varios meses:** si los datos traen más de un mes, la app pregunta **"¿Las separás por mes?"**.
  - **No:** un solo lote de preñadas; los meses quedan como dato (para la parición esperada).
  - **Sí:** un lote por mes, y cada uno con su potrero (R1).
  - Si es un solo mes, no se pregunta.
- **Ecografía por partes** (un día no da para todo el potrero): quedan **tres grupos separados**: preñadas, vacías y **sin ecografiar**. Las ecografiadas (preñadas y vacías) salen del potrero de las sin ecografiar (R1). Las sin ecografiar quedan como `VIENTRES` para otro día.
- **El proceso no está "Diagnosticado" mientras queden sin ecografiar:** `etapaActual` devuelve `ESPERA_DIAGNOSTICO` (o un texto "Diagnóstico a medias: faltan N") hasta que no quede ningún lote en `VIENTRES` con su fin del servicio hecho.
- **La revisión** (corrección del diagnóstico) sigue como está, pero las que cambian de grupo se mueven al lote del grupo nuevo (R1), sin el aviso "separalas con el +".

### R5. Nunca dos entores seguidos (en el servidor)
- `ejecutarDecision`, `cargaDecision` y `planDecision` **rechazan** `reentore` cuando el proceso es de toros (`modalidad TOROS`): "Las vacías de un entore van a engorde: no se vuelven a servir".
- Al crear un proceso o una tanda con lotes `VACIAS · REENTORE` de otro proceso, el proceso anterior tiene que ser IATF (`IATF` o `IA`) y el nuevo, de toros. Si no, error.
- Lo ya guardado que no cumpla (vacías de un entore marcadas REENTORE) se sigue mostrando, con un aviso en la ficha. No se borra nada.

### R6. Vacías de IATF al entore: nuevo o uno en curso
- Ya existen los dos caminos: "+ Nuevo proceso" con `?desde=` y "Tanda" en un entore abierto. Mantenelos.
- **Avisar en los dos procesos:** en la ficha del proceso IATF, "12 vacías → entore *Servicio 26-27 · Vacas* (desde el 10/01)"; en la del entore, "12 vienen de la IATF *…*". Usá `procesoAnteriorId` o lo que ya guarda la tanda (`anteriores`); si la tanda no lo guarda, agregalo en sus `datos`.

### R7. Abortos y falladas: a engorde
- **Aborto** con "sacarlas": ya no van a un lote de vacías para decidir después. Van a engorde (salen del proceso, a otro potrero, categoría de invernar sugerida).
- **Fin de la parición:** las falladas van a engorde, igual. Se va el "para decidir después".
- Las dos cosas en la misma carga, todo o nada.

### R8. Con cría al pie: cuántas vacas y cuántos terneros por potrero
- En la ficha del proceso (sección de lotes) y en la carga de parición, por cada potrero: **"P12: 40 vacas (25 paridas · 15 preñadas) · 24 terneros"**.
- Es una cuenta pura de los lotes del proceso (con su rol y potrero): ponela en `procesos.calculos.js` con tests.

### R9. Destete: vacas y terneros, cada uno con su destino
- El destete separa: **terneros** (como hoy: a un potrero, categoría y peso opcionales) y **vacas**: "Se quedan" o "Moverlas a…", y su categoría.
- R1: al menos uno de los dos grupos cambia de potrero (si los dos van al mismo potrero nuevo, error).
- Todo en la misma carga; si se anula, vuelve todo.

### R10. Avisos por mezcla (no bloquean)
Cuando una carga del proceso (o un movimiento del "+") deja en un mismo potrero animales que no se deberían juntar, **la vista previa avisa y deja seguir**. Por ahora no se bloquea nada.

1. **El aviso más importante:** dos grupos del mismo proceso en distinto estado (preñadas con vacías, sin ecografiar con ecografiadas, inseminadas con sin inseminar), aunque sean de la misma categoría.
2. **Por categoría:** una función pura `avisosDeMezcla(lotesDelPotrero)` con **grupos de manejo**. Propuesta (Diego la tiene que confirmar; dejala en un solo lugar para cambiarla fácil, por nombre normalizado y con su Wagyu):

| Grupo de manejo | Categorías | Sin aviso con | Avisa con |
|---|---|---|---|
| Cría al pie | Vacas paridas, Vaquillonas paridas, Terneros chicos, Terneras chicas, Terneros/as | Preñadas y otras paridas | Engorde, recría |
| Vientres | Vacas, Vacas de cría, Vaquillonas 1-2, Vaquillonas +2 y sus preñadas | Otros vientres, paridas | Engorde, recría, destetados |
| Engorde hembras | Vacas invernar, Vacas CUT | Entre ellas | Vientres, cría, novillos |
| Recría | Vaquillonas (sin edad) | Entre ellas | Entore con toros, novillos |
| Destetados | Terneros, Terneras | El mismo sexo | El otro sexo, vacas |
| Engorde machos | Novillos | Entre ellos | Cualquier hembra |

Una categoría que no está en la tabla no da aviso.

## Lo ya cargado (no se rompe nada)

- **Vacías pendientes** (`VACIAS` sin destino) de antes: la ficha las sigue mostrando con el botón **Decidir**, que ahora solo ofrece los destinos de R4 (según el origen del proceso) y pide potrero.
- **Repaso con toro de IATF** ya guardado: se sigue mostrando; el tablero lo sigue mandando a "Entore" con el color de IATF.
- **VENTA / INVERNADA / REENTORE** viejos: se muestran como están.
- Sin migración de datos. Si hace falta un campo nuevo, migración chica y con default.

## Lo que no cambia

- El modelo (proceso, ancla, familia de lotes), anular una carga entera, el embudo, la parición en varias cargas, los toros, las tandas, las bajas.
- Los textos en voseo, con el estilo de los mensajes actuales.

## Fases (parar al final de cada una y mostrarle a Diego)

1. **Cuentas puras (servidor):** `planDecision` con R1 (error si dos partes quedan en el mismo potrero, salvo la excepción de cría) y R5; `etapaActual` con el diagnóstico a medias; la cuenta de vacas y terneros por potrero (R8); `avisosDeMezcla` (R10).
   - Tests puros de cada una.
2. **Cargas (servidor):** R2 (`acomodarAlEmpezar`, `cargaInseminacion`), R3 (`cargaFinInseminacion`), R4 (`cargaDiagnostico`, `cargaDecision`, `cargaRevision`), R5 (crear y tanda), R6 (avisos en la ficha), R7 (`abortoAVacias` → engorde, `cargaFinParicion`), R9 (`cargaDestete`), R10 en las vistas previas.
   - Tests: IATF de 80 de 103 sin potrero da error; IATF de 103 se queda; ecografía con preñadas y vacías en el mismo potrero da error (y anda si se van las vacías, si se van las preñadas o si se van las dos a potreros distintos); vacías de un entore a "entore" da error; vacías de IATF a un entore en curso con los dos avisos; ecografía por partes con tres grupos y la etapa a medias; aborto y fallada a engorde; destete con las madres que se mueven; anular cada una vuelve todo.
   - Rehacé el test de punta a punta: IATF (80 de 103) → otro día (23) → ecografía (60 preñadas, 20 vacías, 23 sin ecografiar) → otra ecografía → vacías a un entore → ecografía del entore → vacías a engorde → parición → destete.
3. **Pantallas:** `NuevoProcesoPage` (R2 con "En P8 hay 103"), `ProcesoEtapaPage` (R3, R4 con la pregunta de los meses y sin "Decidir después", R7, R9), `ProcesoPage` (R6, R8, Decidir para lo viejo), los avisos de R10 en Revisar.
   - Tests del front de cada pantalla, `npx vite build` y revisión a 375 px.
4. **Tablero y documentación:** el tablero sin `VACIAS_A_DECIDIR` para lo nuevo (lo viejo sigue apareciendo), la etapa a medias en la lista y en las tarjetas, y `CLAUDE.md` y `docs/PECUARIA.md` §9 al día con estas reglas.

## Cómo se termina cada fase

- Pasan los tests de procesos del servidor y del front (corrélos por separado: la PC está lenta).
- Actualizá el estado en `CLAUDE.md`.
- Parar y mostrarle a Diego qué cambió. Sin commit hasta que lo pida.

## Preguntas que quedan para Diego (no frenan las fases)

1. ¿La tabla de grupos de manejo (R10) está bien, o algún grupo se mezcla distinto?
