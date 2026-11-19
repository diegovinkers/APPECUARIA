# Fase 1: lote repartido entre potreros ("familia de lotes"): plan

> Diseño: `docs/LOGISTICA_MOVIMIENTOS.md` §2 y §8, fase 1. Diego lo aprobó el 19/11/2026 ("si eso quiero, dale hacelo"). Se ejecuta en esta sesión.

**Objetivo:** mover parte de un lote a otro potrero sin formar un lote nuevo con nombre y categoría. La parte sigue siendo del mismo lote: misma categoría y nombre automático, y la app sabe que es de la misma familia. Se ve repartido en la ficha del lote, y se puede volver a unir.

**Restricciones:**
- Los textos van en voseo.
- Los tests usan solo datos ficticios.
- No se cambian el Resumen ni los cálculos de carga.
- Sin commits hasta que Diego los pida.

## Puntos a revisar

1. Repartir una parte de una parte: la raíz sigue siendo la del lote original, y el nombre sale de la raíz, no de la parte (`A · 3`, no `A · 2 · 3`).
2. "Mismo lote" con todas las cabezas, o al mismo potrero: lo rechaza con un mensaje claro (para eso están "lote entero" y "cambiar categoría").
3. Revertir el movimiento cierra la parte y devuelve las cabezas al lote de origen.
4. La ficha de un lote no muestra partes de estancias que el usuario no tiene, solo cuántas hay.
5. Unir dos partes en el mismo potrero cierra la que se suma.

## Tarea 1: Servidor

**Datos**
- Migración `familia_de_lotes`: `lote.raiz_id`, opcional, apunta a otro lote, con índice.
- Prisma: `raizId`, `raiz` y `partes` (relación "LoteFamilia").

**Movimientos**
- `movimientoSchema` suma `mismoLote: boolean` (opcional). Vale para mover y para cada paso de un movimiento múltiple.
- `planificar()`, con `modo: 'NUEVO'` y `mismoLote: true`:
  - Exige que se muevan menos cabezas que las del lote y que el destino sea otro potrero.
  - Toma la categoría del lote.
  - Arma el nombre con `nombreLibre(campo destino, "<nombre de la raíz> · <potrero destino>")`.
  - Guarda `raizId = lote.raizId ?? lote.id`.
  - Ignora `nuevoLote`.
- `crearLote()` acepta `raizId`.

**Ficha del potrero**
- Cada línea de `detallePotrero()` trae `familiaId` (`lote.raizId ?? loteId`).

**Ficha del lote**
- `historialLote(id, { puede })` trae `familia` cuando hay 2 o más lotes activos con la misma raíz:
  - `raiz { id, nombre }`
  - `partes [{ id, nombre, potrero { id, nombre }, categoria, cabezas, pesoPromedioKg }]`
  - `cabezas` (el total)
  - `otrasEstancias` (cuántas partes hay en estancias que el usuario no ve)
- El controlador pasa `puede = (campoId) => puedeCampo(req.user, campoId)`.

**Unir:** no hace falta nada nuevo. Es "sumar a otro lote" dentro del mismo potrero, que ya funciona y cierra el lote que se suma.

**Tests:** `server/test/pecuaria-familia.test.js`, que cubre los cinco puntos a revisar y el `familiaId` de la ficha del potrero.

## Tarea 2: Front

**`components/pecuaria.jsx`**
- `familiasJuntas(lineas)` devuelve los grupos de 2 o más líneas con el mismo `familiaId`. La parte que se queda es la raíz, o si no está, la más vieja (id menor).

**`MoverPage.jsx`**
- Opción nueva **"Sigue siendo el mismo lote"** (en el cuerpo: `modo: 'NUEVO'`, `mismoLote: true`), cuando no van todas las cabezas y el destino es otro potrero. Muestra el nombre que va a tener, que sale de la vista previa.
- Qué se propone primero:
  - Si en el destino hay una parte de la misma familia: sumar a esa parte.
  - Si el destino no tiene lotes y es una parte: "Sigue siendo el mismo lote".
  - Si van todas: el lote entero.
  - Si el destino tiene otros lotes: como hoy.

**`LotePage.jsx`**
- Cuadro "Repartido en N potreros", con links a cada parte y el total. Más "y N en otras estancias", si las hay.

**`PotreroPage.jsx`**
- Si `familiasJuntas` encuentra algo, muestra el aviso "Están juntas: ¿las unís?" con el botón **Unirlas** (pide `pecuaria:CREAR` y confirmación). Une con un "sumar" de cada parte a la que se queda, una por una, y recarga.

**Tests:**
- `familiasJuntas`.
- `LotePage` con familia (con la API simulada).

## Tarea 3: Verificar

- Las dos suites completas, de a una.
- La migración en la base de desarrollo (`db:migrate`).
- `CLAUDE.md` actualizado.
