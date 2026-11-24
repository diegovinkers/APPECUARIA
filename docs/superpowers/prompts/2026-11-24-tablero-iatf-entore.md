# Prompt: tablero de Procesos, sección 1 = IATF y sección 2 = Entore

> Armado por Claude Code a pedido de Diego (24/11/2026). Corrige el tablero de 4 secciones publicado ese día (`docs/superpowers/prompts/2026-11-24-procesos-tablero.md`). Lo ejecuta Claude Code en esta carpeta.

---

## Tu rol

Sos el desarrollador full-stack de `C:\dev\sapsa-app` y cuidás que la app sea simple en el celular (375 px). Leé `CLAUDE.md` entero, sobre todo "Procesos en 4 secciones (tablero, 24/11)".

El código que tocás:
- `server/src/pecuaria/procesos.tablero.js` (`gruposDelProceso`, `esReentore`) y `listar` en `procesos.service.js`.
- `client/src/components/tablero.js`, `TableroProcesos.jsx` y sus tests.
- Tests: `server/test/pecuaria-procesos-tablero.test.js`, `client/src/components/tablero.test.js` y `client/src/pages/pecuaria/ProcesosPage.test.jsx`.

## Lo que pide Diego

Hoy la sección 1 es "En servicio (Entore · IATF)" y la 2 es "Reentore". Está mal. La regla del campo es:
- **La IATF es la primera oportunidad.** Si una vaca no queda preñada (o no se llegó a inseminar), pasa al toro.
- **El entore con toros es la segunda.** Una vaca que falla con el toro no vuelve a empezar.

Por eso:

| # | Sección | Quiénes |
|---|---|---|
| 1 | **Inseminación** (IATF) | Solo los vientres de procesos IATF que están en la inseminación o esperando su ecografía |
| 2 | **Entore** (con toros) | Los vientres de los entores con toros. Además, **con otro color**, todo lo que viene de una IATF y pasó al toro |
| 3 | **Preñadas** | Igual que hoy |
| 4 | **Con cría al pie** | Igual que hoy |

"Viene de una IATF y pasó al toro" son tres casos. Los tres van en la sección 2 con el color distinto:
1. **Las que no se llegaron a inseminar** y en el fin de la inseminación van "al repaso con toro": `FIN_INSEMINACION` con destino `REPASO`; el lote pasa de `SIN_SERVIR` a `VIENTRES` dentro del mismo proceso IATF.
2. **El repaso con toros de una IATF** (etapa `REPASO`): los vientres de ese proceso ya están con el toro.
3. **Las vacías de la ecografía de una IATF** que arrancan un proceso nuevo con toros: proceso `TOROS` con `procesoAnteriorId` de una IATF. Las vacías marcadas "para volver a servir" que todavía no empezaron su proceso nuevo también van acá (con el botón "Empezar el entore").

## Decisiones

1. **Nombres:**
   - Sección 1: "Inseminación", subtítulo "IATF".
   - Sección 2: "Entore", subtítulo "Con toros · en otro color, las que vienen de IATF".
   - Se va la sección "Reentore" y el tipo de grupo `VACIAS_REENTORE` como sección propia.
2. **Servidor (`gruposDelProceso`):**
   - Recibe la modalidad del proceso, la modalidad de su proceso anterior y qué lotes pasaron al repaso con toro (de las anclas `FIN_INSEMINACION` con destino `REPASO` y de la etapa `REPASO`).
   - Cada grupo lleva `seccion` (`iatf` | `entore` | `prenadas` | `cria`) y `deIatf: true` cuando corresponde.
   - `listar` le pasa lo que haga falta: incluir `procesoAnterior: { select: { datos: true } }` y las anclas que ya trae.
   - Lo viejo con modalidad `IA` cuenta como IATF.
3. **Las vacías:**
   - **Para volver a servir (REENTORE):**
     - De una IATF: van a 2 con el color, botón "Empezar el entore" (Nuevo proceso con `?desde=`).
     - De un entore: Diego dice que no se vuelven a servir, pero la app hoy lo permite. Van a 2 sin color y no se bloquea nada.
   - **Sin decidir:** quedan en la sección de su proceso (1 si es IATF, 2 si es entore), con el botón "Decidir".
4. **El color:**
   - Las tarjetas `deIatf` usan la familia **trigo** (borde `border-trigo-500`, fondo `bg-trigo-100`).
   - Llevan una etiqueta chica **"viene de IATF"**.
   - El color tiene que verse bien en el modo claro y en el oscuro (las clases trigo ya tienen su versión oscura en `index.css`).
   - En el encabezado de la sección 2, al lado de las cabezas, va cuántas vienen de IATF ("· 35 de IATF").
5. **Nuevo proceso con `?desde=` de una IATF:** que arranque con **Entore con toros** elegido en el paso "Qué". Sigue pudiendo cambiarse.
6. **Lo que ya existe** (procesos con `datos.reentore`, `esReentore`): el reentore deja de ser una sección. La marca queda en los datos, pero el tablero no la usa más; reemplazala por la regla de arriba.

## Tests

- **Servidor:**
  - Un proceso IATF va a 1.
  - Un entore va a 2 sin `deIatf`.
  - Las sin inseminar al repaso van a 2 con `deIatf` (el resto del mismo proceso sigue en 1).
  - Las vacías de una IATF van a 2 con `deIatf`, antes y después de empezar su entore.
  - Las vacías sin decidir quedan en la sección de su proceso.
  - Rehacé el test de punta a punta del tablero con una IATF → ecografía → vacías a entore → parición.
- **Front:**
  - Los nombres de las secciones.
  - La tarjeta `deIatf` con la etiqueta y la clase de color.
  - El conteo "de IATF" en el encabezado.
  - Nuevo proceso `?desde=` de una IATF arranca en Entore.

## Cómo se termina

- Pasan los tests de procesos del servidor y del front (corrélos por separado: la PC está lenta) y `npx vite build`.
- Actualizá el estado en `CLAUDE.md`.
- Parar y mostrarle a Diego qué cambió. Sin commit hasta que lo pida.
