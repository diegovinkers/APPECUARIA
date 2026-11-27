# Idea: tandas de parición (cabeza, cuerpo y cola) para ubicar a los terneros grandes

> **Estado: IDEA, sin decidir.** Charlada entre Diego y Claude Code el 27/11/2026. Todavía no hay plan ni código. Antes de hacer nada, Diego tiene que contestar las preguntas de abajo; después se arma un plan por fases y se espera su OK.

---

## Lo que quiere Diego (en sus palabras)

> Tener bien identificados a los terneros. A medida que nacen, los primeros en nacer en promedio son los primeros en quedar grandes al año que viene; los segundos estarán en la media, y los últimos serán los chicos. Quiero poder poner una opción "ternero grande" y que figuren los potreros que tienen terneros grandes.

En el campo esto se llama **cabeza, cuerpo y cola de parición**:

| Tanda | Nacen | Al año siguiente |
|---|---|---|
| **Cabeza** | primero | los grandes |
| **Cuerpo** | en el medio | los medianos |
| **Cola** | al final | los chicos |

Sirve para cada situación que viene después. Por ejemplo, elegir las vaquillonas grandes para el primer entore, o armar lotes parejos de novillos.

## Lo que ya existe en la app

- **Parición dentro de un proceso:** los terneros van a un lote por mes de nacimiento ("Terneros/as sep-2027", "Terneros/as oct-2027"), en la categoría **Terneros/as**. Así que el mes de nacimiento ya queda anotado (`loteDelMes`, `procesos.service.js`).
- **Stock cargado desde la planilla:** no tiene fecha de nacimiento. Lo único parecido son las categorías **Terneros chicos** y **Terneras chicas** (vienen de CIGAM).
- **Familia de lotes:** cuando un lote se reparte en varios potreros, las partes saben que son el mismo lote (`lote.raiz_id`).
- **Filtros de Potreros y buscador del "+":** son el lugar natural para "mostrame dónde están los grandes".

## Cómo lo pensamos (propuesta inicial, para discutir)

1. **Una marca aparte de la categoría.** No crear categorías nuevas tipo "Terneros grandes": las categorías están atadas a CIGAM y se mezclaría todo. Cada lote tendría:
   - la **tanda**: Cabeza / Cuerpo / Cola (o "sin dato");
   - la **generación**: el año en que nacieron (2026, 2027…).
2. **La marca acompaña al animal, no a la categoría.** Cuando el ternero pasa a vaquillona o a novillo, sigue siendo "cabeza 2026".
3. **Al repartir un lote, cada parte se lleva la marca.** Al juntar lotes de distinta tanda, la app avisa (falta decidir qué pasa: ver pregunta 3).
4. **Se decide por fecha y se corrige a mano** (opción recomendada, falta que Diego la confirme): la app propone la tanda según la fecha de nacimiento y el encargado la corrige en un aparte.
   - Corte propuesto: ciclos de 21 días (un celo) desde que empieza la parición. Los primeros 21 días son cabeza, los 21 siguientes cuerpo, el resto cola.
   - La cabeza es lo que quedó preñado en el primer celo del entore.
   - Los días serían configurables, como los plazos de Procesos.
5. **Para encontrarlos:**
   - un filtro en Potreros ("Terneros: grandes / medianos / chicos");
   - que también se pueda buscar desde el "+" al elegir qué mover;
   - en la tabla, una etiqueta chica en cada potrero.

## Preguntas para Diego (antes de empezar)

1. **¿Cómo se decide quién es grande?**
   - a) Automático, por fecha de nacimiento.
   - b) A mano, en un aparte (a ojo o por peso).
   - c) Las dos: la app propone y el encargado corrige. Es la recomendada.
2. **¿Qué hacemos con los terneros que ya están cargados** (sin fecha)? ¿Se marcan a mano una vez? ¿Los "Terneros chicos" de la planilla pasan a ser "cola"?
3. **¿Se juntan en un mismo potrero o lote terneros de distinta tanda?** Si pasa, ¿la app solo avisa o el lote queda "mezclado"?
4. **¿Hasta cuándo importa la marca?** ¿Solo hasta el destete, hasta el primer entore de las vaquillonas, o hasta la venta?
5. **¿Dónde se quiere ver?** ¿Alcanza con el filtro en Potreros y en el "+", o también en el Resumen (cuántos grandes, medianos y chicos hay de cada categoría)?
6. **¿Tres grupos o dos?** Grande / mediano / chico, o solo grande / chico.
7. **Nombres en pantalla:** ¿"Cabeza / Cuerpo / Cola" (como se dice en el campo) o "Grandes / Medianos / Chicos"?

## Cuando se retome

1. Leer `CLAUDE.md` (sobre todo Procesos: parición y lotes por mes; familia de lotes) y esta nota.
2. Con las respuestas de Diego, escribir un diseño corto en `docs/superpowers/specs/` y un plan por fases en `docs/superpowers/plans/`.
3. Esperar el OK de Diego antes de escribir código.

Probablemente, las fases serían:
- modelo: la marca en el lote y que se herede al repartir;
- que la parición la proponga sola;
- marcar a mano lo ya cargado;
- el filtro en Potreros y en el "+";
- el Resumen, si Diego lo pide.

Solo datos ficticios en código, seed y tests (regla de confidencialidad).
