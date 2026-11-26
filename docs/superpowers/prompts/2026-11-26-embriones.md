# Prompt: transferencia de embriones como tercera forma de servicio

> Armado por Claude Code con Diego (26/11/2026). Lo ejecuta Claude Code en esta carpeta, en 3 fases, parando al final de cada una.

---

## Tu rol

Sos el desarrollador full-stack de `C:\dev\sapsa-app`. Leé `CLAUDE.md` entero, sobre todo "Procesos" (fases 1 a 8, reglas del campo y el tablero).

## Qué pide Diego

Sumar a los procesos de reproducción una tercera forma de servicio: la **transferencia de embriones (TE)**, al lado del Entore con toros y la IATF.

Cómo es en el campo:
- SAPSA **compra los embriones hechos**: son **Wagyu** y se transfieren a **receptoras Angus**. No hay donantes ni colecta.
- Las receptoras se sincronizan como en una IATF. El día de la transferencia el veterinario revisa cada una:
  - las **aptas** reciben un embrión;
  - las **no aptas** no lo reciben.
- La ecografía va unos 30 días después de la transferencia.
- El parto se espera unos **276 días después de la transferencia** (283 de gestación menos los 7 días que ya tiene el embrión).
- El ternero es Wagyu aunque la madre sea Angus.

## Decisiones (Diego, 26/11/2026)

1. **Funciona como la IATF:**
   - transferencias por día (tandas);
   - las transferidas y las que no, en potreros distintos (R2);
   - una ecografía por tanda;
   - las vacías van al toro una sola vez o a engorde (R5).
2. **Embriones usados:** en cada transferencia se anota **cuántos embriones se usaron** (por defecto, uno por transferida; nunca menos que las transferidas) y, si se quiere, **de qué embriones** (texto libre: toro, partida). **No se lleva el stock del termo.**
3. **Las no aptas van al toro.** Ese mismo día salen de la transferencia y quedan para el entore. Se modelan como las vacías de una IATF que se vuelven a servir: rol `VACIAS` con destino `REENTORE`. Entran a un entore con toros una sola vez, aparecen en "Entore" del tablero con el color de "viene de…" y en la ficha con "Empezar con ellas". No hay "otro día" para las no aptas.
4. **Las vacías de la ecografía:** al toro (entore con toros, una sola vez) o a engorde, como en la IATF.
5. **Terneros:** van a su propio lote Wagyu por mes ("Terneros/as Wagyu sep-2027"), categoría **"Terneros/as Wagyu"**, sin sexo. Se crea la primera vez si la base no la tiene, después de "Terneros/as".
6. **Plazo del parto:** etapa nueva de Configuración → Procesos, **"Parición (embriones)"**, de 276 días desde cada transferencia. Se puede editar.
7. **Tablero:** la sección 1 pasa a llamarse "Inseminación · Embriones". Cada proceso lleva su etiqueta y no hay sección nueva.

## Modelo

- `proceso.datos.modalidad = 'TE'`. Es JSON: no hace falta migración.
- **Tipo de evento nuevo** `TRANSFERENCIA_EMBRIONES` ("Transferencia de embriones", REGISTRO, hembras, niveles CATEGORIA / LOTE / PARTE_LOTE). El seed agrega los tipos que faltan por clave, así que en Render entra al arrancar.
- **Plazo** `PARICION_TE` en `PLAZOS_INICIALES` (desde `TRANSFERENCIA`). `completarPlazos` lo suma aunque la tabla `etapa_plantilla` no lo tenga; `guardarConfiguracion` lo crea con un upsert.
- **Datos de las anclas de una TE:**
  - INICIO y TANDA: `{ modalidad: 'TE', embriones: { usados, detalle? } }` (en la primera ancla de la carga) y `noAptas` (en la del lote).
  - Embudo: `embriones` (total usado) y `noAptas`.

## Fases

1. **Servidor:**
   - modalidad TE en la API (crear, tanda, desde Eventos);
   - no aptas al entore;
   - embriones usados;
   - plazo del parto en las sugerencias, la ficha y el aviso de parición temprana;
   - terneros Wagyu;
   - textos ("la transferencia" en vez de "la IATF" donde corresponde).

   Tests puros (sugerencias, tablero, cálculos) y de punta a punta: transferencia de 80 de 100 con 20 no aptas a otro potrero, entore con las no aptas, ecografía, vacías al entore, parición con terneros Wagyu, destete; el stock cuadra en cada paso.
2. **Pantallas:**
   - Nuevo proceso: "Transferencia de embriones" en el paso Qué; "¿A cuántas se les transfirió?"; las no aptas "van al toro: ¿a qué potrero?"; embriones usados y de qué embriones.
   - Ficha: embriones en el embudo y "N no aptas para el entore".
   - Tablero: "Inseminación · Embriones", con etiqueta.
   - Configuración: el plazo nuevo.
   - Eventos → Reproducción: "Transferencia de embriones" (empieza un proceso o va a uno).
3. **Prueba de punta a punta en el navegador a 375 px**, publicación en Render y revisión de Diego en el celular.

## Lo que no se toca

- La IATF y el entore siguen igual. Lo viejo con modalidad `IA` sigue contando como IATF.
- El stock del termo queda para más adelante, si se pide.
