-- Orden de los potreros como en la planilla de Excel (27/11, pedido de Diego).
-- La importación no guardaba el orden (todos los potreros de las estancias
-- quedaban en 0 y la lista caía al orden por número). Se toma de la última
-- importación confirmada de cada estancia: importacion.datos.potreros viene
-- en el orden de las filas de la planilla.
WITH ult AS (
  SELECT DISTINCT ON (datos->'campo'->>'sigla') id, datos
  FROM importacion
  WHERE estado = 'CONFIRMADA' AND jsonb_typeof(datos->'potreros') = 'array'
  ORDER BY datos->'campo'->>'sigla', confirmada_en DESC NULLS LAST, id DESC
), filas AS (
  SELECT u.datos->'campo'->>'sigla' AS sigla, p.value->>'nombre' AS nombre, p.n
  FROM ult u, jsonb_array_elements(u.datos->'potreros') WITH ORDINALITY AS p(value, n)
)
UPDATE potrero AS po
SET orden = f.n
FROM filas f
JOIN campo c ON c.sigla = f.sigla
WHERE po.campo_id = c.id AND po.nombre = f.nombre;

-- Los que no están en la planilla (por ejemplo, un corral creado en la app)
-- van al final de su estancia.
UPDATE potrero AS po
SET orden = m.maximo + 1
FROM (SELECT campo_id, max(orden) AS maximo FROM potrero GROUP BY campo_id) m
WHERE po.campo_id = m.campo_id AND po.orden = 0 AND m.maximo > 0;
