# Procesos: ajustes (plan)

**Diseño:** `docs/superpowers/specs/2026-11-20-procesos-ajustes-design.md`. TDD; al final, las dos suites (una vez cada una) y `npx vite build`.

## Tarea 1 · Servidor

- Migración `procesos_iatf`: `ALTER TYPE "RolProceso" ADD VALUE 'SIN_SERVIR'`.
- Schema: `modalidad` TOROS | IATF (IA → 400 "Elegí cómo es el servicio: entore con toros o IATF"). `lineas[].reparto: [{ potreroId, cabezas, toros? }]` (máx. 50) y `lineas[].potreroId` (IATF: a dónde van las inseminadas).
- `cuerpoDesdeEvento`: INSEMINACION → IATF. `MODALIDAD.IA` se muestra "IATF".
- `crearEn` con un `ctx` (como las cargas): por lote, servidas S de n.
  - Reparto: cada fila es una parte de la familia (sufijo = potrero) a ese potrero, rol VIENTRES. Si se van las n, la última fila mueve el lote entero.
  - IATF con S < n: lo inseminado que no se reparte va a "<lote> · IATF dd/mm" (en `potreroId` o en el mismo potrero); el lote queda SIN_SERVIR.
  - Ancla INICIO en el lote original con S y `reparto` en los datos. `rolesAntes` para anular.
- `vistaPreviaCrear` simula `crearEn` (Simulacion) y devuelve los `pasos`.
- Plantilla: `INSEMINACION` ("Día de inseminación", repetible, toma SIN_SERVIR) y `FIN_INSEMINACION` ("Fin de la inseminación", toma SIN_SERVIR, destino REPASO | SALEN, `potreroId` opcional). Solo en la ficha de una IATF.
- Cálculos: servidas = INICIO + INSEMINACION + FIN_INSEMINACION con REPASO. Fechas del servicio: el inicio es el primero de esos; sin fin, el último. `proximas`: con lotes SIN_SERVIR, lo que sigue es INSEMINACION.
- Vacías: destino `{ reentore, potreroId? }` (se mueven y quedan para volver a servir) y `{ salen, potreroId }` (rol LIBRES, salen del proceso, con categoría). Lo viejo (venta, invernada, `{ potreroId }`) sigue andando.
- Lista: `loteIds` sin las vacías para volver a servir; `reentoreIds` aparte.
- Tests: `pecuaria-procesos-ajustes.test.js` + cálculos.

## Tarea 2 · Front

- `NuevoProcesoPage`: Entore / IATF; pasos Qué · A quién · Datos · Dónde · Revisar (Dónde se salta si ya está en curso); textos nuevos; las vacías para volver a servir, primero y marcadas; la revisión muestra los pasos.
- `cuerpoProceso` con `reparto` y `potreroId`.
- `ProcesoPage`: botones de INSEMINACION y FIN_INSEMINACION; rol SIN_SERVIR = "sin inseminar".
- `ProcesoEtapaPage`: pantallas de INSEMINACION y FIN_INSEMINACION; vacías con "Volver a intentar" y "Solo moverlas" (más "Decidir después" en el diagnóstico).
- Tests en `procesos.test.js`, `NuevoProcesoPage.test.jsx` (nuevo) y `ProcesoEtapaPage.test.jsx`.

## Tarea 3 · Publicar

Suites, build, CLAUDE.md, commit y push (Diego lo pidió), control en Render.
