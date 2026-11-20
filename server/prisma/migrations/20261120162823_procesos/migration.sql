-- CreateEnum
CREATE TYPE "TipoProceso" AS ENUM ('REPRODUCTIVO');

-- CreateEnum
CREATE TYPE "EstadoProceso" AS ENUM ('ABIERTO', 'CERRADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "RolProceso" AS ENUM ('VIENTRES', 'PRENADAS', 'VACIAS', 'PARIDAS', 'CRIAS', 'LIBRES');

-- CreateEnum
CREATE TYPE "DestinoVacias" AS ENUM ('REENTORE', 'INVERNADA', 'VENTA');

-- AlterEnum
ALTER TYPE "TipoEvento" ADD VALUE 'PROCESO';

-- AlterTable
ALTER TABLE "evento_movimiento" ADD COLUMN     "grupo_id" VARCHAR(36),
ADD COLUMN     "proceso_id" INTEGER;

-- AlterTable
ALTER TABLE "evento_registro" ADD COLUMN     "etapa" VARCHAR(20),
ADD COLUMN     "proceso_id" INTEGER;

-- AlterTable
ALTER TABLE "movimiento" ADD COLUMN     "proceso_id" INTEGER,
ADD COLUMN     "registro_id" INTEGER;

-- CreateTable
CREATE TABLE "proceso" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoProceso" NOT NULL DEFAULT 'REPRODUCTIVO',
    "nombre" VARCHAR(120) NOT NULL,
    "campo_id" INTEGER NOT NULL,
    "campania" VARCHAR(7) NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "estado" "EstadoProceso" NOT NULL DEFAULT 'ABIERTO',
    "cerrado_en" TIMESTAMPTZ(3),
    "proceso_anterior_id" INTEGER,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "nota" VARCHAR(255),
    "usuario_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "proceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proceso_lote" (
    "id" SERIAL NOT NULL,
    "proceso_id" INTEGER NOT NULL,
    "lote_id" INTEGER NOT NULL,
    "rol" "RolProceso" NOT NULL,
    "mes" VARCHAR(7),
    "destino" "DestinoVacias",
    "desde" DATE NOT NULL,
    "hasta" DATE,
    "registro_id" INTEGER,

    CONSTRAINT "proceso_lote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proceso_campo_id_estado_idx" ON "proceso"("campo_id", "estado");

-- CreateIndex
CREATE INDEX "proceso_campania_idx" ON "proceso"("campania");

-- CreateIndex
CREATE UNIQUE INDEX "proceso_campo_id_nombre_key" ON "proceso"("campo_id", "nombre");

-- CreateIndex
CREATE INDEX "proceso_lote_lote_id_idx" ON "proceso_lote"("lote_id");

-- CreateIndex
CREATE UNIQUE INDEX "proceso_lote_proceso_id_lote_id_key" ON "proceso_lote"("proceso_id", "lote_id");

-- CreateIndex
CREATE INDEX "evento_movimiento_grupo_id_idx" ON "evento_movimiento"("grupo_id");

-- CreateIndex
CREATE INDEX "evento_registro_proceso_id_idx" ON "evento_registro"("proceso_id");

-- CreateIndex
CREATE INDEX "movimiento_proceso_id_idx" ON "movimiento"("proceso_id");

-- AddForeignKey
ALTER TABLE "evento_movimiento" ADD CONSTRAINT "evento_movimiento_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "proceso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "proceso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "evento_registro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_registro" ADD CONSTRAINT "evento_registro_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "proceso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso" ADD CONSTRAINT "proceso_campo_id_fkey" FOREIGN KEY ("campo_id") REFERENCES "campo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso" ADD CONSTRAINT "proceso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso" ADD CONSTRAINT "proceso_proceso_anterior_id_fkey" FOREIGN KEY ("proceso_anterior_id") REFERENCES "proceso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso_lote" ADD CONSTRAINT "proceso_lote_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "proceso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso_lote" ADD CONSTRAINT "proceso_lote_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso_lote" ADD CONSTRAINT "proceso_lote_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "evento_registro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Las etapas puntuales de un proceso van una sola vez por proceso y lote
-- (diseño de procesos, §6). Las anuladas no cuentan: se pueden volver a cargar.
CREATE UNIQUE INDEX "evento_registro_proceso_etapa_unica"
  ON "evento_registro" ("proceso_id", "etapa", "lote_id")
  WHERE NOT "anulado" AND "etapa" IN ('INICIO', 'REPASO', 'FIN_SERVICIO', 'DIAGNOSTICO', 'REVISION', 'FIN_PARICION', 'DESTETE');
