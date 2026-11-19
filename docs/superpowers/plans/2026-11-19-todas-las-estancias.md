# "Todas las estancias" en Potreros y Movimientos: plan

> Se ejecuta en esta misma sesión (Diego: "dale, hacelo"). Spec: `docs/superpowers/specs/2026-11-19-todas-las-estancias-design.md`.

**Objetivo:** con "Todas las estancias" elegido, Potreros y Movimientos listan los datos de todas las estancias del usuario, sin cartel, y cada potrero lleva la sigla de su estancia adelante.

**Restricciones:**
- Textos en voseo.
- Solo datos ficticios en los tests.
- Lo que no es del usuario no aparece nunca (`filtroCampos`).
- Sin commits hasta que Diego los pida.

## Puntos a revisar

1. Un usuario con 2 estancias asignadas no ve potreros ni movimientos de una tercera.
2. Un movimiento entre campos aparece una sola vez en la lista de todas.
3. Al pasar de una estancia a "Todas" no queda la tabla vieja.
4. La búsqueda "EG 8" encuentra el potrero 8.1 de EG.
5. Los potreros dados de baja (`activo: false`) siguen sin listarse.

### Tarea 1: Servidor

**Archivos:**
- `server/src/pecuaria/lugares.repository.js`
- `movimientos.service.js`
- `pecuaria.controller.js`
- `pecuaria.routes.js`
- Test nuevo: `server/test/pecuaria-todas.test.js`

**Cambios:**
- `listPotrerosTodas(filtro)`: `filtro` es lo que devuelve `filtroCampos(user)`. Trae los potreros activos de esos campos, ordenados por `campo.orden`, `orden` y `nombre`. Cada potrero trae `campo: { id, sigla, nombre, orden }`, también en `listPotreros(campoId)`.
- `listarTodas(filtro, filtros)`: mismo resultado que `listar` (`{ movimientos, resumen }`). Si `filtro` es `undefined`, trae todos. Si no, trae los que tienen `campoId` o el potrero de origen o de destino dentro de esos campos.
- En `incluir`, `potreroOrigen` y `potreroDestino` suman `campo: { select: { sigla: true } }`.
- Rutas nuevas: `GET /potreros` y `GET /movimientos`, con `ver`.

**Tests:**
- Un usuario con una sola estancia asignada recibe solo esos potreros, con `campo.sigla`.
- El superadmin recibe los de las dos estancias, en el orden de las estancias.
- Un movimiento entre campos aparece una sola vez.
- Un usuario con una estancia no ve los movimientos internos de otra.

### Tarea 2: Front

**Archivos:**
- `client/src/api/pecuaria.js`: `getPotrerosTodas()` y `getMovimientosTodas(filtros)`.
- `hooks/usePotreros.js`: `usePotreros(campoId, todas)`. Limpia el estado cuando no hay ni estancia ni "Todas".
- `components/pecuaria.jsx`: `nombreConSigla(potrero, todas)`.
- `PotrerosLista.jsx` (prop `todas`): nombre, búsqueda, orden por estancia.
- `MovimientosLista.jsx` (prop `todas`):
  - Con "Todas", `lado()` arma `SIGLA nombre`.
  - Usa `getMovimientosTodas`.
  - El filtro por potrero muestra la sigla.
- `PotrerosPage` y `MovimientosPage`: sin `ElegirEstancia`. "+ Corral" solo con una estancia elegida.

**Tests (Vitest):**
- `nombreConSigla`.
- `armarFilas` con "Todas" da `EG 72.4`.
- `PotrerosLista` con "Todas" muestra `EG 8.1` y `ES 8.1`.
- Buscar "es 8" deja solo `ES 8.1`.

### Tarea 3: Verificar

- Las dos suites completas.
- Navegador a 375 px con "Todas": Potreros y Movimientos.
- Puertos libres al terminar.
- `CLAUDE.md` actualizado.
