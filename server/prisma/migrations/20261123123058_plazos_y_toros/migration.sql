-- CreateEnum
CREATE TYPE "UnidadPlazo" AS ENUM ('DIAS', 'MESES');

-- CreateTable
CREATE TABLE "etapa_plantilla" (
    "id" SERIAL NOT NULL,
    "tipo_proceso" "TipoProceso" NOT NULL DEFAULT 'REPRODUCTIVO',
    "clave" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "plazo" INTEGER NOT NULL,
    "unidad" "UnidadPlazo" NOT NULL DEFAULT 'DIAS',
    "desde" VARCHAR(20) NOT NULL,
    "aviso_dias" INTEGER NOT NULL DEFAULT 7,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etapa_plantilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estado_reproductivo" (
    "rol" "RolProceso" NOT NULL,
    "nombre" VARCHAR(40) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "estado_reproductivo_pkey" PRIMARY KEY ("rol")
);

-- CreateTable
CREATE TABLE "toro" (
    "id" SERIAL NOT NULL,
    "campo_id" INTEGER NOT NULL,
    "identificacion" VARCHAR(40) NOT NULL,
    "raza" VARCHAR(60),
    "genetica" VARCHAR(255),
    "lote_id" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "nota" VARCHAR(255),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "toro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proceso_toro" (
    "id" SERIAL NOT NULL,
    "proceso_id" INTEGER NOT NULL,
    "toro_id" INTEGER NOT NULL,
    "potrero_id" INTEGER NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE,
    "registro_id" INTEGER,
    "registro_salida_id" INTEGER,

    CONSTRAINT "proceso_toro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "etapa_plantilla_tipo_proceso_clave_key" ON "etapa_plantilla"("tipo_proceso", "clave");

-- CreateIndex
CREATE INDEX "toro_lote_id_idx" ON "toro"("lote_id");

-- CreateIndex
CREATE UNIQUE INDEX "toro_campo_id_identificacion_key" ON "toro"("campo_id", "identificacion");

-- CreateIndex
CREATE INDEX "proceso_toro_proceso_id_idx" ON "proceso_toro"("proceso_id");

-- CreateIndex
CREATE INDEX "proceso_toro_toro_id_idx" ON "proceso_toro"("toro_id");

-- AddForeignKey
ALTER TABLE "toro" ADD CONSTRAINT "toro_campo_id_fkey" FOREIGN KEY ("campo_id") REFERENCES "campo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toro" ADD CONSTRAINT "toro_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso_toro" ADD CONSTRAINT "proceso_toro_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "proceso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso_toro" ADD CONSTRAINT "proceso_toro_toro_id_fkey" FOREIGN KEY ("toro_id") REFERENCES "toro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso_toro" ADD CONSTRAINT "proceso_toro_potrero_id_fkey" FOREIGN KEY ("potrero_id") REFERENCES "potrero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso_toro" ADD CONSTRAINT "proceso_toro_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "evento_registro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso_toro" ADD CONSTRAINT "proceso_toro_registro_salida_id_fkey" FOREIGN KEY ("registro_salida_id") REFERENCES "evento_registro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Los plazos de cada etapa (docs/PECUARIA.md §9). La gestación sale del
-- parámetro que ya estaba (por si lo habían cambiado); la ecografía pasa a 30
-- días (antes 45) y el destete a 6 meses (antes 180 días), como aprobó Diego
-- el 23/11/2026.
INSERT INTO "etapa_plantilla" ("tipo_proceso", "clave", "nombre", "plazo", "unidad", "desde", "aviso_dias", "orden") VALUES
  ('REPRODUCTIVO', 'FIN_SERVICIO', 'Fin del entore', 90, 'DIAS', 'INICIO', 7, 10),
  ('REPRODUCTIVO', 'DIAGNOSTICO', 'Ecografía', 30, 'DIAS', 'FIN_SERVICIO', 7, 20),
  ('REPRODUCTIVO', 'PARICION', 'Parición',
    COALESCE((SELECT "valor"::int FROM "parametro" WHERE "clave" = 'GESTACION_DIAS'), 283), 'DIAS', 'SERVICIO', 7, 30),
  ('REPRODUCTIVO', 'NUEVO_ENTORE', 'Nuevo entore', 70, 'DIAS', 'PARTO', 7, 40),
  ('REPRODUCTIVO', 'DESTETE', 'Destete', 6, 'MESES', 'PARTO', 7, 50);

INSERT INTO "estado_reproductivo" ("rol", "nombre", "orden") VALUES
  ('SIN_SERVIR', 'Sin servir', 10),
  ('VIENTRES', 'Servida', 20),
  ('PRENADAS', 'Preñada', 30),
  ('VACIAS', 'Vacía', 40),
  ('PARIDAS', 'Parida con ternero al pie', 50),
  ('CRIAS', 'Ternero al pie', 60),
  ('LIBRES', 'Fuera del proceso', 70);

-- Los tres parámetros de procesos pasan a la tabla de arriba.
DELETE FROM "parametro" WHERE "clave" IN ('GESTACION_DIAS', 'DIAGNOSTICO_DESDE_DIAS', 'DESTETE_EDAD_DIAS');

-- La ecografía se puede hacer en varios días y por partes: el diagnóstico deja
-- de ir una sola vez por proceso y lote.
DROP INDEX "evento_registro_proceso_etapa_unica";
CREATE UNIQUE INDEX "evento_registro_proceso_etapa_unica"
  ON "evento_registro" ("proceso_id", "etapa", "lote_id")
  WHERE NOT "anulado" AND "etapa" IN ('INICIO', 'REPASO', 'FIN_SERVICIO', 'REVISION', 'FIN_PARICION', 'DESTETE');
