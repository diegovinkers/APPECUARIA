-- Los pivots abajo (27/11, pedido de Diego): en cada estancia que tiene
-- pivots, van justo después del último "Frente" (en La Gateada: … P 55,
-- Frente A, Frente B, Pivot 1 … 7, Olivera, Pastoreo); sin "Frente", al
-- final. Los demás quedan en el orden que tenían y se renumera 1, 2, 3…
-- La misma regla está en src/pecuaria/orden.js (la usa la importación).
WITH con_pivots AS (
  SELECT DISTINCT campo_id FROM potrero WHERE nombre ~* '^\s*pivot\M'
), frente AS (
  SELECT campo_id, max(orden) AS hasta FROM potrero WHERE nombre ~* '^\s*frente\M' GROUP BY campo_id
), fin AS (
  SELECT campo_id, max(orden) AS hasta FROM potrero GROUP BY campo_id
), clave AS (
  SELECT p.id, p.campo_id,
    CASE WHEN p.nombre ~* '^\s*pivot\M'
      THEN COALESCE(f.hasta, fin.hasta) + 0.5 + p.orden / 1000000.0
      ELSE p.orden
    END AS k
  FROM potrero p
  JOIN con_pivots c ON c.campo_id = p.campo_id
  JOIN fin ON fin.campo_id = p.campo_id
  LEFT JOIN frente f ON f.campo_id = p.campo_id
), nuevo AS (
  SELECT id, row_number() OVER (PARTITION BY campo_id ORDER BY k, id) AS n FROM clave
)
UPDATE potrero AS po
SET orden = nuevo.n
FROM nuevo
WHERE po.id = nuevo.id AND po.orden <> nuevo.n;
