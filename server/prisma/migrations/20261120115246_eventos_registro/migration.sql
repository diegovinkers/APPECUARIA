-- AlterEnum
ALTER TYPE "OrigenStock" ADD VALUE 'EVENTO';

-- CreateTable
CREATE TABLE "evento_registro" (
    "id" SERIAL NOT NULL,
    "tipo_movimiento_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "campo_id" INTEGER NOT NULL,
    "potrero_id" INTEGER,
    "lote_id" INTEGER,
    "categoria_id" INTEGER,
    "nivel" "NivelMovimiento" NOT NULL DEFAULT 'LOTE',
    "cabezas" INTEGER NOT NULL,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "nota" VARCHAR(255),
    "grupo_id" VARCHAR(36) NOT NULL,
    "version_id" INTEGER,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "anulado_en" TIMESTAMPTZ(3),
    "anulado_por_id" INTEGER,
    "version_anulacion_id" INTEGER,
    "usuario_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_registro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_registro_campo_id_fecha_idx" ON "evento_registro"("campo_id", "fecha");

-- CreateIndex
CREATE INDEX "evento_registro_potrero_id_fecha_idx" ON "evento_registro"("potrero_id", "fecha");

-- CreateIndex
CREATE INDEX "evento_registro_lote_id_idx" ON "evento_registro"("lote_id");

-- CreateIndex
CREATE INDEX "evento_registro_grupo_id_idx" ON "evento_registro"("grupo_id");

-- CreateIndex
CREATE INDEX "evento_registro_tipo_movimiento_id_idx" ON "evento_registro"("tipo_movimiento_id");

-- CreateIndex
CREATE INDEX "evento_registro_version_id_idx" ON "evento_registro"("version_id");

-- AddForeignKey
ALTER TABLE "evento_registro" ADD CONSTRAINT "evento_registro_tipo_movimiento_id_fkey" FOREIGN KEY ("tipo_movimiento_id") REFERENCES "tipo_movimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_registro" ADD CONSTRAINT "evento_registro_campo_id_fkey" FOREIGN KEY ("campo_id") REFERENCES "campo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_registro" ADD CONSTRAINT "evento_registro_potrero_id_fkey" FOREIGN KEY ("potrero_id") REFERENCES "potrero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_registro" ADD CONSTRAINT "evento_registro_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_registro" ADD CONSTRAINT "evento_registro_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_registro" ADD CONSTRAINT "evento_registro_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "version_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_registro" ADD CONSTRAINT "evento_registro_version_anulacion_id_fkey" FOREIGN KEY ("version_anulacion_id") REFERENCES "version_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_registro" ADD CONSTRAINT "evento_registro_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_registro" ADD CONSTRAINT "evento_registro_anulado_por_id_fkey" FOREIGN KEY ("anulado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
