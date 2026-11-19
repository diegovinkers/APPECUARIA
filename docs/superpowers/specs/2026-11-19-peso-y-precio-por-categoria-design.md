# Peso promedio y precio por categoría: diseño corto

Aprobado por Diego el 19/11/2026: "perfecto hagamos eso y que se modifique en la parte de categorías en Configuración".

## Por qué

- La carga en UG/ha sale de los kilos: kilos ÷ 380, con el parámetro "kg por UG". Hoy, un lote sin peso cargado no suma kilos, y la carga queda "sin peso".
- Con un **peso promedio por categoría**, siempre hay un número.
- Con un **precio por categoría**, la app calcula el **valor del ganado**, que es lo que más le interesa al dueño.

## Qué cambia

**Categoría: tres datos nuevos, editables en Configuración → Categorías**
- `pesoPromedioKg`: el peso típico de un animal de la categoría.
- `precioUsd`: el precio en dólares.
- `precioPor`: si el precio es por **kilo** (`KG`, por defecto) o por **cabeza** (`CABEZA`). Así lo hace la hoja KG.$ del DICOSE.

Los tres son opcionales. Sin peso, la categoría se calcula como hoy. Sin precio, no suma al valor.

**Kilos de un lote**
- Si el lote tiene su peso cargado, se usa ese.
- Si no, se usa el peso promedio de su categoría, y el resultado se marca **estimado**.
- La UG sigue siendo kilos ÷ "kg por UG" (380).

**Valor de un lote**
- Precio por kilo: kilos × precio.
- Precio por cabeza: cabezas × precio.
- Sin precio en la categoría, ese lote no suma, y el valor queda "incompleto".

**Cálculos**
- `calcularPotrero` recibe los datos de las categorías. Devuelve, además de lo de hoy:
  - `kilosEstimados`: true si algún lote usó el peso de su categoría;
  - `valorUsd`;
  - `valorCompleto`.
- `kilosCompletos` pasa a significar "todos los lotes tienen peso, propio o de su categoría".
- Lo usan la ficha, la lista de potreros, la vista previa de los movimientos, las entradas y salidas, y el Resumen.

**Dónde se ve**
- **Configuración → Categorías:** peso promedio, precio y "por kg / por cabeza", en cada categoría.
- **Ficha del potrero:** "≈" en kg/ha y UG/ha cuando hay estimados, y el **valor** en USD.
- **Tabla de Potreros:** "≈" delante del peso, kg/ha y UG/ha estimados.
- **Resumen:** el **valor del ganado** total y el de cada grupo. Con "Todas las estancias", el valor de cada estancia.
- **Auditoría:** el cambio de una categoría ya se audita (`CATEGORIA_EDITADA` o lo que use el ABM).

## Decisiones mías (Claude)

- Los valores iniciales salen de la hoja KG.$ del DICOSE al 30/06 (`docs/info santi/`). La carga es aparte, con una receta fuera de git, y le muestro a Diego la correspondencia entre las categorías de la hoja y las de la app antes de cargar. **No es parte de este cambio de código.**
- El precio se guarda en dólares, con dos decimales. No se guarda un historial de precios: la auditoría guarda los cambios.
- El valor no aparece en cada fila de la tabla de Potreros, porque las columnas ya están justas en el celular. Está en la ficha y en el Resumen.

## Fuera de esto

- Historial de precios.
- Precios por fecha (por ejemplo, de INAC).
- Valor en la tabla de Movimientos.
