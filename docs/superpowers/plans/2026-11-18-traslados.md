# Paso 5 del rediseño: mover entre campos, movimiento múltiple y eventos en el "+"

Fecha: 18/11/2026. Decisiones de Diego (charla del 18/11), en `docs/DECISIONES.md` §11.

## 1. Todos los eventos, solo en el "+"

- Registrar algo (mover, cambio de categoría, entrada, salida, corrección, mover entre campos, movimiento múltiple) se hace **solo desde el botón "+"** (o "+ Registrar" en la compu).
- Se sacan los botones Mover / Entrada / Salida de la ficha del potrero, de la ficha del lote y de arriba de la lista de Movimientos.
- Quedan en la ficha del potrero lo que es dato del potrero: editar stock, cambiar uso de suelo, hectáreas. Revertir sigue en cada movimiento de la lista.

## 2. El evento que agrupa movimientos

Un movimiento múltiple o un movimiento entre campos se guarda como **un evento padre con sus pasos**:

- Cada paso es un **movimiento normal** (el de siempre): queda en el historial de su potrero y de su lote, y los filtros y totales andan igual.
- El evento guarda quién, cuándo, el tipo (múltiple o entre campos) y una nota.
- En la lista de Movimientos el evento es **una fila** ("Movimiento múltiple · 3 pasos · 160 cabezas") que se despliega; en el historial de un potrero o lote, el paso dice "parte del movimiento múltiple #12".
- **Se revierte el evento entero**, nunca un paso suelto (y solo si después no hubo otros cambios en esos potreros). La reversión también es un evento.
- **Todo o nada:** si un paso falla, no se guarda ninguno.

## 3. Mover entre campos

- En el "+": **"Mover entre campos"**. Se puede hacer desde cualquier estancia elegida arriba (también "Todas").
- Pasos: **campo de origen** (viene marcado el de arriba; solo los campos asignados al usuario) → potrero, lote y cabezas (y peso de los que salen, opcional) → **campo y potrero de destino** (todos los campos activos menos el de origen, aunque no los tenga asignados) → **lote nuevo** (nombre y categoría) o **lote entero** → **guía (opcional)**, fecha, nota → vista previa → confirmar.
- No se suma a un lote del destino: el que registra puede no ver esa estancia. Del destino, la vista previa muestra solo "llegan N cabezas al potrero tal, lote tal".
- Queda en Movimientos de **los dos campos**. Revertirlo deshace los dos lados (el lote entero vuelve a su estancia). Lo revierte quien tiene la estancia de origen y el permiso de revertir.
- Tipo nuevo del libro del rodeo: "Movimiento entre campos" (lo crea el seed).

## 4. Movimiento múltiple

- En el "+": **"Movimiento múltiple"**, dentro de la estancia elegida (si está "Todas", pregunta cuál).
- Es una cadena de movimientos simples: A → B, y si en B hay otra cosa, **"Agregar otro movimiento"** (B → C, C → D...). El botón está **siempre**.
- Si en el destino hay **otra categoría**, la app **avisa** ("en B hay Vacas: los Terneros se mezclarían") y ofrece agregar el movimiento que libera ese potrero. **No bloquea.**
- Cada paso mueve **lo que había antes de empezar**: no se puede mover en un paso un lote que recibió animales en un paso anterior del mismo evento.
- Cada paso puede ser sumar a un lote, formar un lote nuevo (con su categoría: por ejemplo los terneros que pasan a novillos) o el lote entero.
- Vista previa de **todos los potreros que cambian** (antes y después) → confirmar todo junto.

## 5. Lista de Movimientos como tabla (pedido de Diego, 18/11, aprobado en la otra sesión)

- Una **tabla tipo Excel**, una fila por movimiento: Fecha | Tipo | Categoría | Cabezas | Peso | Origen (potrero · lote) | Destino (potrero · lote) | Usuario | Revertir.
- Encabezado fijo al bajar; ordenar tocando el título de la columna; fila de totales abajo con lo filtrado (cabezas movidas, entradas, salidas).
- Múltiple y entre campos: una fila que se despliega (▸) con sus pasos; Revertir en la fila del evento. Entre campos: "→ La Seda · potrero" en el origen, "← La Gateada · potrero" en el destino.
- En el celular, la tabla se desplaza de costado con la columna Fecha fija; la página no tiene scroll horizontal, solo la tabla.
- Después, los filtros (período hoy / 7 días / mes / desde-hasta; potrero; categoría; tipo) sin scroll, como en Potreros (grupos con flex-wrap, selectores con su etiqueta arriba).
- "Descargar Excel" con lo filtrado: más adelante.
- Tests del front (orden, despliegue de eventos, totales) y revisión a 375 px y en la compu.

## Fases

1. **Servidor:** modelo del evento (migración), mover entre campos, movimiento múltiple, revertir el evento, lista agrupable, alcance. Tests.
2. **Pantallas:** eventos solo en el "+", las dos pantallas nuevas, la lista con eventos que se despliegan y el link en el historial. Tests y revisión en el navegador.
3. Commit y publicar cuando Diego diga.
