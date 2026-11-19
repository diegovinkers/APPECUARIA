# Área utilizable de cada potrero: diseño corto

Pedido de Diego del 19/11/2026.

## Por qué

- El uso de suelo puede no ocupar todo el potrero. Ejemplo: un potrero de 50 ha con 40 ha sembradas de avena.
- La carga tiene que medirse sobre lo que el ganado usa de verdad: 200 terneros en 40 ha son 5 cab/ha, no 4.
- Hoy ese dato no existe: por defecto, el área utilizable es igual a las hectáreas, y se puede editar en cada potrero.

## Qué cambia

- **Dato nuevo en el potrero: `areaUtilizable` (ha), opcional.**
  - Vacío quiere decir "todas las hectáreas". Así, si después se corrigen las hectáreas, el área utilizable las sigue sola.
  - No puede ser mayor que las hectáreas, salvo que las hectáreas estén "a confirmar".
- **Las hectáreas para calcular la carga** (cab/ha, kg PV/ha, UG/ha, la barra de carga, la carga por grupo del Resumen y la vista previa de los movimientos) son:
  - el área utilizable, si está cargada;
  - si no, las hectáreas, como hoy (sin valores por hectárea si están "a confirmar").
- **Dónde se carga:**
  - **Al editar las hectáreas del potrero:** campo "Área utilizable".
  - **Al cambiar el uso de suelo:** campo "Área utilizable para este uso", que arranca con las hectáreas del potrero. Si no se manda, vuelve a "todas las hectáreas": un uso nuevo arranca con el valor por defecto.
  - **Al crear un potrero o corral:** opcional, por la API.
- **Dónde se ve:**
  - En la ficha del potrero: "40 de 50 ha utilizables".
  - En la tabla de Potreros, en la columna ha: "40 de 50".
  - El total de la tabla sigue mostrando las hectáreas totales. El cab/ha del total usa el área utilizable.
- **Auditoría:** el cambio queda en la edición del potrero (`POTRERO_EDITADO`) y en el cambio de uso (`USO_SUELO_CAMBIADO`).

## Decisiones mías (Claude)

- **Se guarda en el potrero, no en cada uso de suelo.** Es lo más simple, y la auditoría guarda los valores anteriores. Un historial de área por uso se puede agregar después, si hace falta.
- **Cambiar de uso sin mandar el área la vuelve a "todas las hectáreas".** Es el "por defecto" que pidió Diego.
- **En el Resumen, la fila de cada estancia sigue sumando las hectáreas totales.** Solo la carga por grupo usa el área utilizable.

## Fuera de esto

Un historial del área por cada uso de suelo, y cargar el área desde la planilla.
