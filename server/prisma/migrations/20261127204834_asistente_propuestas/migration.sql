-- CreateEnum
CREATE TYPE "EstadoPropuesta" AS ENUM ('PENDIENTE', 'CONFIRMANDO', 'CONFIRMADA', 'CANCELADA', 'VENCIDA', 'ERROR');

-- CreateTable
CREATE TABLE "asistente_propuesta" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "conversacion_id" UUID,
    "consulta_id" INTEGER,
    "herramienta" VARCHAR(40) NOT NULL,
    "ruta" VARCHAR(120) NOT NULL,
    "cuerpo" JSONB NOT NULL,
    "tarjeta" JSONB NOT NULL,
    "estado" "EstadoPropuesta" NOT NULL DEFAULT 'PENDIENTE',
    "resultado" JSONB,
    "error" VARCHAR(500),
    "avisada" BOOLEAN NOT NULL DEFAULT false,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidida_en" TIMESTAMPTZ(3),

    CONSTRAINT "asistente_propuesta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asistente_propuesta_usuario_id_creada_en_idx" ON "asistente_propuesta"("usuario_id", "creada_en");

-- CreateIndex
CREATE INDEX "asistente_propuesta_conversacion_id_idx" ON "asistente_propuesta"("conversacion_id");

-- CreateIndex
CREATE INDEX "asistente_propuesta_consulta_id_idx" ON "asistente_propuesta"("consulta_id");

-- AddForeignKey
ALTER TABLE "asistente_propuesta" ADD CONSTRAINT "asistente_propuesta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistente_propuesta" ADD CONSTRAINT "asistente_propuesta_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "asistente_conversacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistente_propuesta" ADD CONSTRAINT "asistente_propuesta_consulta_id_fkey" FOREIGN KEY ("consulta_id") REFERENCES "asistente_consulta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
