-- Paso 2 del "libro del rodeo": entradas y salidas. Un movimiento puede tener
-- un solo lado (las entradas no tienen origen; las salidas, destino), así que
-- el campo pasa a ser una columna propia. Generado con `prisma migrate diff`
-- y completado a mano para llenar campo_id en los movimientos que ya existen.

-- AlterTable
ALTER TABLE "movimiento" ADD COLUMN     "campo_id" INTEGER,
ADD COLUMN     "campo_otro_id" INTEGER,
ADD COLUMN     "causa_id" INTEGER,
ADD COLUMN     "guia" VARCHAR(30),
ADD COLUMN     "lote_madres_id" INTEGER,
ALTER COLUMN "lote_origen_id" DROP NOT NULL,
ALTER COLUMN "lote_destino_id" DROP NOT NULL,
ALTER COLUMN "potrero_origen_id" DROP NOT NULL,
ALTER COLUMN "potrero_destino_id" DROP NOT NULL,
ALTER COLUMN "categoria_origen_id" DROP NOT NULL,
ALTER COLUMN "categoria_destino_id" DROP NOT NULL,
ALTER COLUMN "version_origen_id" DROP NOT NULL,
ALTER COLUMN "version_destino_id" DROP NOT NULL;

-- Hasta ahora todos los movimientos tenían origen: el campo es el de ese potrero.
UPDATE "movimiento" m SET "campo_id" = p."campo_id"
FROM "potrero" p WHERE p."id" = m."potrero_origen_id";

ALTER TABLE "movimiento" ALTER COLUMN "campo_id" SET NOT NULL;

-- Cada movimiento tiene al menos un lado.
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_algun_lado_check"
    CHECK ("potrero_origen_id" IS NOT NULL OR "potrero_destino_id" IS NOT NULL);

-- CreateIndex
CREATE INDEX "movimiento_campo_id_fecha_idx" ON "movimiento"("campo_id", "fecha");

-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_campo_id_fkey" FOREIGN KEY ("campo_id") REFERENCES "campo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_causa_id_fkey" FOREIGN KEY ("causa_id") REFERENCES "causa_movimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_campo_otro_id_fkey" FOREIGN KEY ("campo_otro_id") REFERENCES "campo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_lote_madres_id_fkey" FOREIGN KEY ("lote_madres_id") REFERENCES "lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
