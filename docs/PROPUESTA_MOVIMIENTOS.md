# Propuesta: tipos de movimiento y evento del ganado

Para revisar con el encargado antes de programar. 17/11/2026.

La idea es que **todo cambio en el ganado quede registrado como un movimiento o un evento**, con su tipo, su fecha y quién lo hizo. Así la app cuenta la historia completa de cada lote y potrero, y puede **sugerir** cambios (de categoría, de potrero, de lote) a partir de esos datos.

La lista sigue los eventos que ya están definidos en CIGAM (entre paréntesis, su número), para que más adelante se puedan unir los datos.

## 1. Cambios de lugar o de grupo (ya están en la app)

| Movimiento | Qué hace | En CIGAM |
|---|---|---|
| Sumar a otro lote | Una parte o todo un lote se suma a otro lote; toman su categoría | Transferencia de lote (5) |
| Formar un lote nuevo | Una parte o todo un lote forma un lote nuevo | Transferencia de lote (5) |
| Mover el lote entero | El lote cambia de potrero | Transferencia de área (4) |
| Cambiar la categoría | El lote cambia de categoría en su potrero | Lo permiten varios eventos |
| Revertir | Deshace el último movimiento, si después no hubo otros cambios | — |

## 2. Entradas (altas)

| Movimiento | Qué pide | En CIGAM |
|---|---|---|
| **Nacimiento / parto** | Fecha, cuántos terneros y cuántas terneras, a qué lote van, y de qué lote son las madres | Nacimiento / parto (12) |
| **Compra** | Fecha, cabezas, categoría, peso, lote de destino y **número de guía** | No es un evento; la compra de hacienda pasa por compras |
| **Traslado desde otro campo** | Fecha, cabezas, categoría, lote de destino y **número de guía** | — |

## 3. Salidas (bajas)

| Movimiento | Qué pide | En CIGAM |
|---|---|---|
| **Muerte** | Fecha, lote, cabezas y **causa** (obligatoria) | Muerte (6), pide causa |
| **Consumo** | Fecha, lote, cabezas y causa | Consumo (7), pide causa |
| **Venta o faena** | Fecha, lote, cabezas, peso y **número de guía** | No es un evento; la venta pasa por comercial |
| **Traslado a otro campo** | Fecha, lote, cabezas, campo de destino y **número de guía**. En el otro campo entra como "traslado desde otro campo" | — |
| **Pérdida o abigeato** | Fecha, lote, cabezas y comentario | — |

**Guías:** en Uruguay la hacienda se mueve con guía del MGAP. Registrar su número en compras, ventas y traslados ayuda a cerrar con el DICOSE.

**Causas** que hay hoy en CIGAM: cobra (víbora), mordida, "después de 3 días", "después de 7 días". Hay que completar la lista con el encargado: enfermedad, accidente, parto, desconocida…

## 4. Eventos que no cambian cuántos animales hay

| Evento | Qué registra | En CIGAM |
|---|---|---|
| **Pesada** | El peso nuevo de un lote (o de algunos animales). Actualiza el promedio | Pesada (3) |
| **Ecografía** | Cuántas preñadas y cuántas vacías. Puede separar el lote o cambiar la categoría (Vaquillonas → Vaquillonas preñadas) | Ecografía (11) |
| **Inseminación** | Fecha, lote, cuántas | Inseminación (2) |
| **Entore o servicio** | Toros con las vacas (monta natural): desde cuándo, con qué toros | — |
| **Aborto** | Fecha, lote, cuántas. La preñada vuelve a vacía | CIGAM tiene un campo para vincularlo al evento de origen |
| **Destete** | Separa los terneros de las madres: forma el lote de terneros destetados y las madres pasan de paridas a vacas de cría | En CIGAM, "Destete" es una finalidad de lote |
| **Castración** | Fecha, lote, cuántos. Puede cambiar la categoría | — |
| **Caravaneo o señalada** | Identificar animales que ya están (caravana, señal). No cambia cuántos hay | Identificación inicial (1) |
| **Vacunación** | Fecha, lote, cabezas, vacuna (aftosa, carbunclo…) | Vacuna carbunclo (8), vacuna aftosa (9) |
| **Otros tratamientos sanitarios** | Dosificación, antiparasitario, baño, curación: producto y dosis. Más adelante, conectado con el stock de insumos | — |
| **Alimentación** | Dieta o suplemento del lote, en corral o en el campo | Alimentación (13) |
| **Recuento** | Se contó el lote y dio otro número: registra la diferencia y el motivo | — |

**Ganado de terceros:** animales ajenos en pastoreo o capitalización. No son stock propio, pero ocupan potreros y cuentan en la carga. Habría que poder marcarlos aparte.

## 5. A quiénes se aplica cada movimiento o evento

Cada uno se puede registrar a distintos niveles, pero no todos tienen sentido. La app ofrece solo los que sí (✓ sí · ~ a veces · ✗ no). Los niveles grandes (todo el campo, un potrero, una categoría) son atajos: por dentro se registra lote por lote.

| Evento | Campo | Potrero / corral | Categoría | Lote | Parte de un lote | Individual (caravana) |
|---|---|---|---|---|---|---|
| Mover de potrero | ✗ | ✓ vaciar un potrero | ~ | ✓ | ✓ | ✓ |
| Cambio de categoría | ✗ | ~ | ✓ todas las terneras pasan a vaquillonas | ✓ | ✓ | ✓ |
| Muerte | ✗ | ✗ | ✗ | ~ | ✓ | ✓ |
| Consumo | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Venta o faena | ✗ | ~ | ✓ todos los novillos +3 | ✓ | ✓ | ✓ |
| Nacimiento | ✗ | ✗ | ✗ | ✓ el lote de las madres | ✓ | ~ |
| Compra | ✗ | ✗ | ✗ | ✓ lote nuevo | ✗ | ~ |
| Traslado a otro campo | ✗ | ✓ | ~ | ✓ | ✓ | ✓ |
| Destete | ✗ | ✓ | ✗ | ✓ el lote de las madres | ✓ | ~ |
| Pesada | ✗ | ✓ | ✓ | ✓ | ✓ muestreo | ✓ con bastón |
| Ecografía (solo hembras) | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Inseminación (solo hembras) | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Entore (hembras y toros) | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Aborto (solo hembras) | ✗ | ✗ | ✗ | ~ | ✓ | ✓ |
| Castración (solo machos) | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Caravaneo o señalada | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Vacunación | ✓ campaña de aftosa | ✓ | ✓ | ✓ | ✓ | ✓ |
| Otros tratamientos | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Alimentación | ✗ | ✓ corral o suplementación en el campo | ~ | ✓ | ✗ | ✗ |
| Recuento | ~ | ✓ | ✗ | ✓ | ✗ | ✗ |

- **Lo individual** necesita que la app conozca cada animal con su caravana. Llega con el bastón; mientras tanto, todo es por lote o por parte de un lote.
- **Pregunta para el encargado:** ¿cambiaría alguna casilla?

## 6. Reglas para sugerir cambios de categoría

La app crea **solicitudes** que el encargado confirma o rechaza.

**Por edad.** Necesita que cada lote tenga su fecha de nacimiento (o la parición de la que viene).
- Machos (están en CIGAM): Terneros hasta 12 meses → Novillos 1-2 (13 a 24) → Novillos 2-3 (25 a 36) → Novillos +3.
- Hembras (propuesta; en CIGAM está incompleta): Terneras hasta 12 meses → Vaquillonas 1-2 (13 a 24) → Vaquillonas +2 (desde los 25).

**Por evento.**
- Ecografía positiva → Vaquillonas preñadas.
- Parto → Vacas de cría (y sus terneros como lote nuevo).

**Por peso.** Por ejemplo, "Terneros de más de X kg → Novillos 1-2". El encargado define los valores.

## 7. Preguntas para el encargado

1. ¿Falta algún movimiento o evento que hagan hoy? ¿Sobra alguno?
2. ¿Qué causas de muerte y de consumo usan?
3. ¿Hacen destete, castración, entore? ¿Cuándo y cómo lo anotan hoy?
4. ¿Hay ganado de terceros en los campos (pastoreo, capitalización)?
5. ¿Dónde guardan hoy los números de guía?
6. ¿Cómo cambian hoy de categoría: por edad, por peso, en una fecha fija (por ejemplo, el 1/7 del DICOSE)?
7. ¿Las reglas de edad de arriba están bien? ¿Cómo es en las hembras?
8. ¿Cómo se registran hoy los nacimientos? ¿Se cuentan al parto o recién al destete?
9. ¿Se vacuna o se pesa por lote entero o animal por animal?
10. ¿Qué es lo más importante para empezar?

## 8. Orden propuesto para programar

1. **Bajas** (muerte con causa, consumo, venta), **nacimientos** y **compras**: con eso el stock queda siempre bien sin usar "Editar stock".
2. **Pesada** y **ecografía**: actualizan peso y categoría.
3. **Solicitudes** de cambio de categoría (por edad, por evento y por peso).
4. **Vacunación**, **inseminación** y **alimentación**.
