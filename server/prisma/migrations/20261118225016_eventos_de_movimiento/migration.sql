-- Paso 5 del rediseño (docs/superpowers/plans/2026-11-18-traslados.md):
-- un evento agrupa los pasos de un movimiento múltiple o entre campos.

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('MULTIPLE', 'ENTRE_CAMPOS', 'REVERSION');

-- AlterTable
ALTER TABLE "movimiento" ADD COLUMN     "evento_id" INTEGER;

-- CreateTable
CREATE TABLE "evento_movimiento" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoEvento" NOT NULL,
    "campo_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "nota" VARCHAR(255),
    "revierte_a_id" INTEGER,
    "usuario_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_movimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evento_movimiento_revierte_a_id_key" ON "evento_movimiento"("revierte_a_id");

-- CreateIndex
CREATE INDEX "evento_movimiento_campo_id_fecha_idx" ON "evento_movimiento"("campo_id", "fecha");

-- CreateIndex
CREATE INDEX "movimiento_evento_id_idx" ON "movimiento"("evento_id");

-- AddForeignKey
ALTER TABLE "evento_movimiento" ADD CONSTRAINT "evento_movimiento_campo_id_fkey" FOREIGN KEY ("campo_id") REFERENCES "campo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_movimiento" ADD CONSTRAINT "evento_movimiento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_movimiento" ADD CONSTRAINT "evento_movimiento_revierte_a_id_fkey" FOREIGN KEY ("revierte_a_id") REFERENCES "evento_movimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento_movimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
