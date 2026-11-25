# Feedlot: qué mirar en los corrales

Propuesta del 25/11/2026. Fase 0: relevamiento, sin código.

## 1. El problema

En un feedlot (campo CONFINAMIENTO: FEG y FELS), la tabla de Potreros muestra lo mismo que en una estancia: ha, cab/ha, kg/ha y la barra de carga. En un corral eso no sirve. Las hectáreas son de relleno, y lo que importa es otra cosa:
- cuánto hace que entraron;
- cuánto engordan por día;
- si entran bien en el comedero;
- cuándo salen.

Casi todo eso **ya se calcula** en `feedlot.service.js` (`analisisFeedlot`), pero solo se ve en la tabla por corral del Resumen. La tabla de Potreros y la ficha del corral no lo usan.

## 2. Lo que ya hay

| Dato | Dónde está |
|---|---|
| Metros de comedero del corral | `potrero.metros_comedero` (columna "mts.com." de la hoja de corrales) |
| Fecha de entrada y peso de entrada | `lote.fecha_entrada`, `lote.peso_entrada_kg` |
| Pesadas | evento Pesada (`evento_registro`) |
| Salidas con causa (venta, muerte) y precio de venta | `movimiento` (tipo, causa, `precio_venta_usd`) |
| GMD esperada, ciclo y etapas | parámetros `GMD_FEEDLOT_KG` 1,5 · `CICLO_FEEDLOT_DIAS` 120 · adaptación 20 · engorde 90 |
| Precio por categoría | `categoria.precio_usd` / `precio_por` |

La hoja de corrales del encargado ya trae "Mt/cabeza", "kg inicio", "DIAS" y "salidas": eso es lo que miran hoy.

## 3. Catálogo de indicadores

### A. Se pueden mostrar ya, sin pedir ningún dato nuevo

| Indicador | Cuenta | Nota |
|---|---|---|
| **Días de encierre** | hoy − fecha de entrada | Ya se calcula |
| **Etapa** | Adaptación / Engorde / Terminación / Para salir | Ya se calcula |
| **Peso de entrada** | del lote | |
| **Peso de hoy** | última pesada + días × GMD; sin pesada, entrada + días × GMD | "≈" si es estimado |
| **GMD real** (kg/día) | entre la última pesada y la anterior (o la entrada) | Solo con pesadas |
| **GMD desde la entrada** | (peso de hoy − peso de entrada) ÷ días | Nuevo. Real si la última es una pesada |
| **Kilos ganados** por cabeza y por corral | peso de hoy − peso de entrada | Nuevo |
| **cm de comedero por cabeza** | metros × 100 ÷ cabezas del corral | Hoy está en metros; pasarlo a cm |
| **Salida probable / faltan N días / atrasado** | entrada + ciclo | Ya se calcula |
| **Cabezas por corral** | | |
| **Valor de hoy** | peso de hoy × precio de la categoría | Ya se calcula |
| **Valor ganado** | kilos ganados × precio | Nuevo: lo que produjo el corral |
| **Mortalidad del feedlot** (%) | muertes en los corrales ÷ cabezas que entraron, en el período | Nuevo. Las muertes ya se anotan como salida MUERTE |
| **Venta: peso real vs estimado** | | Ya está en "Últimas ventas" |

### B. Con un dato más por corral (se carga una sola vez)

| Dato nuevo | Indicador | Referencia (a confirmar) |
|---|---|---|
| Superficie del corral (m²) | **m² por cabeza** | 20 a 40 m²/cab (más en zonas lluviosas, por el barro) |
| Capacidad (cabezas) | **Ocupación %** | Lotes de hasta 200–250 cabezas |
| Frente de bebedero (m) | **cm de bebedero por cabeza** | ~3 cm/cab |
| Tipo de comedero (entrega diaria / autoconsumo) | Cambia el objetivo de cm/cab | Entrega diaria: 30 a 50 cm/cab (otras fuentes dicen 20 a 40) |

Con un **objetivo de cm/cab** (parámetro en Configuración), la columna se pinta en ámbar cuando un corral queda apretado.

### C. Con un dato más por lote

| Dato nuevo | Indicador |
|---|---|
| Peso objetivo de salida (o uno por categoría) | **Días para llegar al peso**: salida por peso, no solo por los 120 días |
| Costo de entrada (compra o valor de reposición) | **Margen** = valor de hoy − costo de entrada − alimentación |
| Origen (propio / comprado) | Separar el resultado |
| Edad o fecha de nacimiento | Control de edad para la **cuota 481** (ver §5) |

### D. Con registro diario: el corazón de un feedlot, para más adelante

| Dato | Indicador |
|---|---|
| Kilos de ración entregados por corral por día | **Consumo** kg/cab/día |
| % de materia seca de la dieta | **Consumo de MS** (kg y % del peso vivo) |
| Consumo + kilos ganados | **Conversión** (kg de MS por kg ganado; más bajo = mejor) |
| Precio de la ración | **Costo por cabeza por día** y **costo del kilo producido** |
| Lectura de comedero (escala) | Ajuste de la entrega. CIGAM tiene el catálogo TIPOLEITCOCHO (7 lecturas) |
| Dieta de cada corral | Qué come cada uno. CIGAM tiene TEA4DIETAESPECIE |
| Tratamientos sanitarios | **Morbilidad** % y tratamientos por corral |

La alimentación es cerca del 90 % del costo de un feedlot. Por eso la conversión y el costo del kilo producido son los números que más pesan en el negocio, pero piden que alguien anote todos los días lo que se entrega.

### E. Del frigorífico (más adelante)

Peso de carcasa, rendimiento y tipificación.

## 4. Propuesta: la tabla de corrales

Cuando la estancia elegida es un feedlot (o "Todos los feedlots"), Potreros pasa a ser **Corrales**, con otras columnas. Una fila por corral; si el corral tiene varios lotes, sus números se ponderan por cabezas.

**Celular** (5 columnas, sin scroll de costado):

| Corral | Cab. | Días | Peso hoy | cm/cab |
|---|---|---|---|---|
| C 3 · Novillos 1-2 · Engorde | 98 | 64 · faltan 56 d | ≈ 352 · 1,4 kg/d | 31 ▮▮▮ |

- Debajo del nombre: categoría · etapa.
- Debajo de los días: lo que falta para salir (ámbar si falta menos de una semana, ámbar fuerte si está atrasado).
- Debajo del peso: la GMD (real si hay pesadas, con "≈" si es la esperada).
- cm/cab con la barra contra el objetivo.

**Compu**, además: Entrada (fecha), Peso de entrada, Kilos ganados, Salida probable y Valor.

**Total**: cabezas, días promedio, GMD promedio, cm/cab del feedlot, valor.

**Filtros propios**: etapa, atrasados / salen en 30 días, categoría, sin pesar hace más de N días.

## 5. Cuota 481

La cuota 481 de la Unión Europea es un cupo de carne de animales terminados a corral, y Uruguay está entre los países que exportan con ella. Las notas que se encontraron hablan de **100 días mínimos de encierre**. Los requisitos exactos (días, edad, dieta) están en el Reglamento (UE) 481/2012 y el protocolo del MGAP, y no se pudieron confirmar.

Si SAPSA vende por ese cupo, la tabla podría marcar los días que le faltan a cada corral para llegar a los 100.

## 6. Plan por fases

1. **Tabla de corrales** (hecha el 25/11, esperando el OK), solo con lo de §3.A. El servidor suma a la lista de potreros de un confinamiento los datos de `analisisFeedlot` por corral. Parámetro nuevo: objetivo de cm/cab. Sin migración.
2. **Ficha del corral**: arriba días, peso, GMD y salida; el historial con las pesadas y la curva de peso (estimada vs real).
3. **Datos del corral** (§3.B): m², capacidad, bebedero, tipo de comedero. Migración chica.
4. **Peso objetivo de salida y cuota 481** (§3.C), si el jefe lo confirma.
5. **Ración y consumo** (§3.D). Primero hay que saber cómo se anota hoy.

## 7. Preguntas para el jefe

1. ¿Cómo se da la comida: mixer una o dos veces por día, o autoconsumo? (Define el objetivo de cm/cab.)
2. ¿Qué cm de comedero por cabeza consideran bien? ¿Y cuándo un corral está apretado?
3. ¿Venden por la cuota 481? Si es así, ¿cuántos días y qué edad controlan?
4. ¿Tienen un peso objetivo de salida por categoría, o salen por días?
5. ¿Anotan los kilos de ración que se entregan por corral? ¿En una planilla, en el mixer, en CIGAM?
6. ¿Saben los m² de cada corral y cuántas cabezas entran?
7. ¿Cada cuánto pesan?

## 8. Fuentes

- [Guía de buenas prácticas ambientales y sanitarias de establecimientos de engorde de bovinos a corral](https://www.gub.uy/ministerio-ambiente/sites/ministerio-ambiente/files/documentos/publicaciones/GUIA_DE_BUENAS_PRACTICAS_AMBIENTALES_Y_SANITARIAS_DE_ESTABLECIMIENTOS_DE_ENGORDE_DE_BOVINOS_A_CORRAL.pdf) (Ministerio de Ambiente, MGAP e INIA). Es la referencia oficial; los números de arriba hay que confirmarlos ahí.
- [La Mañana: engorde a corral](https://xn--lamaana-7za.uy/?p=9482): m² por cabeza, tamaño de los lotes, frente de comedero y de bebedero.
- [Revista Veterinaria (UNNE)](https://revistas.unne.edu.ar/index.php/vet/article/download/4138/3775): superficie por animal en zonas lluviosas.
- [Engormix: instalaciones, bebedero, comedero y aguada](https://www.engormix.com/ganaderia/instalaciones-ganado-carne-bebedero-comedero-aguada/).
- [Engormix: oportunidades en la alimentación del feedlot](https://www.engormix.com/ganaderia/nutricion-feedlot/oportunidades-manejo-alimentacion-bajar_a47832/): peso de la alimentación en el costo, conversión.
- [Bichos de Campo: cuota 481 y los feedlots](https://bichosdecampo.com/cuota-481-los-feed-lots-tambien-se-suben-a-la-ola-exportadora).
- [INIA, Serie Técnica 229 (2017)](https://inia.uy/sites/default/files/publications/2024-10/st-229-2017.p.35-40.pdf): novillos de corral y el acceso a la cuota 481.
