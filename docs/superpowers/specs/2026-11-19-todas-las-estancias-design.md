# "Todas las estancias" en Potreros y Movimientos: diseño corto

Aprobado por Diego el 19/11/2026.

## Por qué

Con "Todas las estancias" elegido arriba, Potreros y Movimientos muestran el cartel "¿De qué estancia?" y no listan nada. Diego quiere que ese selector sea **el único filtro** que decide qué se ve: con "Todas", se ve todo.

Además, hoy hay dos errores en ese caso:
- Debajo del cartel queda la tabla de la estancia elegida antes.
- En Movimientos sale "Campo no encontrado".

## Qué cambia (solo con "Todas las estancias")

- **Sin cartel**, en ninguna de las dos pantallas.
- **Potreros:**
  - Trae los potreros de todas las estancias del usuario.
  - Cada nombre lleva adelante la sigla de su estancia (`EG 8.1`, `ES 8.1`), porque hay nombres repetidos entre estancias.
  - El orden es por estancia y, dentro de cada una, el de la planilla.
  - El Total suma todo. Los filtros siguen iguales, y la búsqueda también encuentra "EG 8.1".
- **Movimientos:**
  - Trae los movimientos de todas las estancias del usuario.
  - Los potreros llevan la sigla, también en el filtro por potrero.
  - Un movimiento entre dos estancias aparece una sola vez: es un solo registro.
- **Con una estancia elegida:** queda como hoy, sin sigla.

## Cómo

- **Servidor:**
  - `GET /api/pecuaria/potreros` y `GET /api/pecuaria/movimientos`, con permiso VER. Solo traen las estancias del usuario (`filtroCampos`). Los filtros de movimientos son los mismos que por estancia.
  - Cada potrero trae `campo: { id, sigla, nombre, orden }`.
  - En los movimientos, el potrero de origen y el de destino traen `campo: { sigla }`.
- **Front:**
  - `usePotreros` pide una lista o la otra, y limpia lo viejo al cambiar.
  - `PotrerosLista` y `MovimientosLista` reciben `todas` y usan `nombreConSigla`.

## Decisiones mías (Claude)

- **La sigla, tal cual está en la base.** La Palma queda `LA PALMA 3`. Cambiar la sigla puede afectar la importación de la planilla.
- **"+ Corral" no se muestra con "Todas"**: un corral se crea en una estancia. El "+" de abajo no se toca en este paso.

## Fuera de este paso

El "+" con "Todas" y el área utilizable de los potreros.
