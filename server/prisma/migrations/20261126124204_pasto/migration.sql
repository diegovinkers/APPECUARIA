-- CreateEnum
CREATE TYPE "AlturaPasto" AS ENUM ('BAJO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "MomentoPasto" AS ENUM ('ENTRADA', 'SALIDA', 'RECORRIDA');

-- CreateTable
CREATE TABLE "lectura_pasto" (
    "id" SERIAL NOT NULL,
    "potrero_id" INTEGER NOT NULL,
    "campo_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "altura" "AlturaPasto" NOT NULL,
    "momento" "MomentoPasto" NOT NULL,
    "movimiento_id" INTEGER,
    "grupo_id" VARCHAR(36),
    "nota" VARCHAR(255),
    "usuario_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "anulada_en" TIMESTAMPTZ(3),
    "anulada_por_id" INTEGER,

    CONSTRAINT "lectura_pasto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lectura_pasto_potrero_id_fecha_idx" ON "lectura_pasto"("potrero_id", "fecha");

-- CreateIndex
CREATE INDEX "lectura_pasto_movimiento_id_idx" ON "lectura_pasto"("movimiento_id");

-- CreateIndex
CREATE INDEX "lectura_pasto_grupo_id_idx" ON "lectura_pasto"("grupo_id");

-- AddForeignKey
ALTER TABLE "lectura_pasto" ADD CONSTRAINT "lectura_pasto_potrero_id_fkey" FOREIGN KEY ("potrero_id") REFERENCES "potrero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectura_pasto" ADD CONSTRAINT "lectura_pasto_campo_id_fkey" FOREIGN KEY ("campo_id") REFERENCES "campo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectura_pasto" ADD CONSTRAINT "lectura_pasto_movimiento_id_fkey" FOREIGN KEY ("movimiento_id") REFERENCES "movimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectura_pasto" ADD CONSTRAINT "lectura_pasto_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectura_pasto" ADD CONSTRAINT "lectura_pasto_anulada_por_id_fkey" FOREIGN KEY ("anulada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
