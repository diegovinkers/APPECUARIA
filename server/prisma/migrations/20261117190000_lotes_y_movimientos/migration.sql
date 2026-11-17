-- AlterEnum
ALTER TYPE "OrigenStock" ADD VALUE 'MOVIMIENTO';
-- DropIndex
DROP INDEX "version_stock_linea_version_id_categoria_id_key";
-- AlterTable

-- CreateTable
CREATE TABLE "lote" (
    "id" SERIAL NOT NULL,
    "campo_id" INTEGER NOT NULL,
    "potrero_id" INTEGER NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "id_lote_cigam" VARCHAR(30),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "lote_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "movimiento" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "lote_origen_id" INTEGER NOT NULL,
    "lote_destino_id" INTEGER NOT NULL,
    "potrero_origen_id" INTEGER NOT NULL,
    "potrero_destino_id" INTEGER NOT NULL,
    "cabezas" INTEGER NOT NULL,
    "peso_promedio_kg" DECIMAL(7,2),
    "categoria_origen_id" INTEGER NOT NULL,
    "categoria_destino_id" INTEGER NOT NULL,
    "modo" VARCHAR(10) NOT NULL,
    "nota" VARCHAR(255),
    "version_origen_id" INTEGER NOT NULL,
    "version_destino_id" INTEGER NOT NULL,
    "usuario_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "movimiento_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- Lotes para lo que ya estaba cargado (DECISIONES §10): un lote por cada
-- potrero + categoría que aparece en el historial, con nombre automático
-- ("10.3 · Terneros"). Queda activo si está en la última versión del potrero.
-- ============================================================================
ALTER TABLE "version_stock_linea" ADD COLUMN "lote_id" INTEGER;

INSERT INTO "lote" ("campo_id", "potrero_id", "categoria_id", "nombre", "activo", "actualizado_en")
SELECT DISTINCT p."campo_id", v."potrero_id", l."categoria_id", LEFT(p."nombre" || ' · ' || c."nombre", 80), false, CURRENT_TIMESTAMP
FROM "version_stock_linea" l
JOIN "version_stock" v ON v."id" = l."version_id"
JOIN "potrero" p ON p."id" = v."potrero_id"
JOIN "categoria" c ON c."id" = l."categoria_id";

UPDATE "version_stock_linea" l
SET "lote_id" = lo."id"
FROM "version_stock" v, "lote" lo
WHERE v."id" = l."version_id" AND lo."potrero_id" = v."potrero_id" AND lo."categoria_id" = l."categoria_id";

UPDATE "lote" lo
SET "activo" = true
WHERE EXISTS (
  SELECT 1 FROM "version_stock_linea" l
  WHERE l."lote_id" = lo."id"
    AND l."version_id" = (
      SELECT v2."id" FROM "version_stock" v2
      WHERE v2."potrero_id" = lo."potrero_id"
      ORDER BY v2."fecha" DESC, v2."id" DESC
      LIMIT 1
    )
);

ALTER TABLE "version_stock_linea" ALTER COLUMN "lote_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "lote_potrero_id_idx" ON "lote"("potrero_id");
-- CreateIndex
CREATE UNIQUE INDEX "lote_campo_id_nombre_key" ON "lote"("campo_id", "nombre");
-- CreateIndex
CREATE INDEX "movimiento_lote_origen_id_idx" ON "movimiento"("lote_origen_id");
-- CreateIndex
CREATE INDEX "movimiento_lote_destino_id_idx" ON "movimiento"("lote_destino_id");
-- CreateIndex
CREATE INDEX "movimiento_potrero_origen_id_fecha_idx" ON "movimiento"("potrero_origen_id", "fecha");
-- CreateIndex
CREATE INDEX "movimiento_potrero_destino_id_fecha_idx" ON "movimiento"("potrero_destino_id", "fecha");
-- CreateIndex
CREATE INDEX "version_stock_linea_lote_id_idx" ON "version_stock_linea"("lote_id");
-- CreateIndex
CREATE UNIQUE INDEX "version_stock_linea_version_id_lote_id_key" ON "version_stock_linea"("version_id", "lote_id");
-- AddForeignKey
ALTER TABLE "version_stock_linea" ADD CONSTRAINT "version_stock_linea_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_campo_id_fkey" FOREIGN KEY ("campo_id") REFERENCES "campo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_potrero_id_fkey" FOREIGN KEY ("potrero_id") REFERENCES "potrero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_lote_origen_id_fkey" FOREIGN KEY ("lote_origen_id") REFERENCES "lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_lote_destino_id_fkey" FOREIGN KEY ("lote_destino_id") REFERENCES "lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_potrero_origen_id_fkey" FOREIGN KEY ("potrero_origen_id") REFERENCES "potrero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_potrero_destino_id_fkey" FOREIGN KEY ("potrero_destino_id") REFERENCES "potrero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_version_origen_id_fkey" FOREIGN KEY ("version_origen_id") REFERENCES "version_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_version_destino_id_fkey" FOREIGN KEY ("version_destino_id") REFERENCES "version_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
