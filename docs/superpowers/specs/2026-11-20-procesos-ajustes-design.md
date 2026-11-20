# Procesos: ajustes después de la primera prueba (20/11/2026)

Complementa a `2026-11-20-procesos-design.md`. Sale de la charla con Diego al probar "+ Nuevo proceso" en Render.

## Por qué

El proceso tiene que seguir lo que pasa en el campo, para que el encargado tenga todo el ganado ordenado sin hacer pasos aparte:
- En el entore se reparten pocas vacas por potrero (20 o 30 con un toro). Hoy eso obliga a mover antes, por separado.
- En la IATF se insemina en uno o dos días. Las que no se inseminaron se apartan en la manga: si la app no lo refleja, al otro día nadie sabe cuáles son.
- Algunos campos no se entienden ("Cabezas que se sirven").

## Los cinco cambios

### 1. Solo Entore e IATF

- Al crear un proceso, las opciones son **Entore (con toros)** e **IATF**. Se saca "Inseminación" (decisión de Diego: para ellos es lo mismo).
- El servidor deja de aceptar `modalidad: 'IA'` al crear. Lo ya guardado con IA se sigue mostrando, como "IATF".
- El evento que deja la IATF sigue siendo el tipo "Inseminación" del catálogo.

### 2. Paso "¿Dónde?" al empezar

- Va después de elegir los lotes. Arranca marcado en **"Se quedan donde están"**: si ya están acomodadas, se toca "Seguir" y no pasa nada más.
- La otra opción es **"Repartirlas en potreros"**: por cada lote, filas de *potrero · cabezas · toros*. Lo que no se reparte se queda en el potrero de origen.
- Cada grupo repartido es una parte del mismo lote ("Sigue siendo el mismo lote", la familia de lotes) y entra al proceso con el mismo rol. Todo va en la misma carga que el inicio: si se anula el inicio, las vacas vuelven a donde estaban.
- Solo a potreros de la misma estancia. Un potrero de destino con otro lote: se avisa, como en Mover.
- Los toros de cada grupo quedan anotados en el inicio (por potrero). Los toros no se mueven como animales en esta versión.
- Sirve igual para la IATF (por ejemplo, llevarlas al potrero de al lado de la manga).

### 3. IATF por días

- La etapa de inicio de una IATF pasa a ser **"Día de inseminación"**, y se puede repetir.
  - Primer día: al crear el proceso, se dice cuántas se inseminaron de cada lote.
  - Siguientes días: desde la ficha, "Otro día de inseminación".
- En cada día, la app **parte el lote**: "<lote> · IATF 21/11" con las inseminadas, y el resto queda como **"sin inseminar"** (en el potrero que se elija). Así el lote de la app coincide con lo apartado en la manga.
- Los días siguientes se insemina desde el lote "sin inseminar".
- **"Terminar la inseminación"** pregunta qué pasa con las que quedaron sin inseminar:
  - **Repaso con toro:** siguen en el proceso. Cuentan como servidas desde ese día. Después viene el repaso y el fin del servicio, como en el entore.
  - **Salen del proceso:** vuelven a ser vacas libres, en el potrero que se diga.
- Si no quedan sin inseminar, "Terminar la inseminación" equivale al fin del servicio.
- Las servidas del embudo son las inseminadas (más las de repaso, si las hay).
- Cada grupo guarda su fecha real. El diagnóstico y la parición esperada se calculan desde la fecha de cada grupo.

### 4. Vacías: dos opciones

En el diagnóstico y en "Decidir", cada grupo de vacías tiene dos opciones (se pueden combinar, por ejemplo 12 y 8):
- **Volver a intentar:** a otro potrero, marcadas "para volver a servir". Salen de este proceso. En el próximo "+ Nuevo proceso" aparecen primero.
- **Solo moverlas:** al potrero que se diga y salen del proceso. Se puede cambiar la categoría ahí mismo (por ejemplo, a invernada).

La venta sale de acá: es una Salida común desde el "+". Lo ya guardado como VENTA o INVERNADA se sigue mostrando como está.

### 5. Textos más claros

- "Cabezas que se sirven" pasa a **"¿Cuántas entran al servicio?"** (con el lote y cuántas tiene), con "Dejalo vacío si entran todas" abajo.
- Debajo de la fecha: "Con esta fecha se calcula cuándo toca el diagnóstico y la parición".
- En la IATF: **"¿Cuántas se inseminaron hoy?"**.
- Se revisan los demás textos del camino con el mismo criterio: qué es y qué hace la app con eso.

## Enfoques considerados para la IATF por días

- **A (elegido): cada día es una carga aparte**, una etapa que se repite, más "Terminar la inseminación". Sigue a los días reales; cada día se puede anular solo.
- B: todos los días en un mismo formulario al crear. Obliga a esperar al último día para anotar, y no refleja la separación en la manga.
- C: una sola carga y después "corregir". Deja a la app desfasada del campo entre un día y el otro.

## Lo que no cambia

- El resto del ciclo: fin del servicio, diagnóstico, revisión, parición, fin de la parición y destete.
- Anular una carga: vuelve todo, incluidos los repartos y las partes de cada día, solo si no hubo cambios después.
- Registro por animal (caravanas): más adelante.

## Lo que queda para quien lo programe

- Los nombres internos de las etapas y roles nuevos ("sin inseminar").
- Cómo se ve la fila de reparto en el celular.
- Los mensajes de error, en voseo, con el mismo estilo que los actuales.
