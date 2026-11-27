-- CreateTable
CREATE TABLE "asistente_conversacion" (
    "id" UUID NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "mensajes" JSONB NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asistente_conversacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asistente_consulta" (
    "id" SERIAL NOT NULL,
    "conversacion_id" UUID,
    "usuario_id" INTEGER NOT NULL,
    "modelo" VARCHAR(60) NOT NULL,
    "pregunta" TEXT,
    "respuesta" TEXT,
    "herramientas" JSONB NOT NULL DEFAULT '[]',
    "idas" INTEGER NOT NULL DEFAULT 0,
    "tokens_entrada" INTEGER NOT NULL DEFAULT 0,
    "tokens_salida" INTEGER NOT NULL DEFAULT 0,
    "tokens_cache_leidos" INTEGER NOT NULL DEFAULT 0,
    "tokens_cache_escritos" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(255),
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asistente_consulta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asistente_conversacion_usuario_id_idx" ON "asistente_conversacion"("usuario_id");

-- CreateIndex
CREATE INDEX "asistente_conversacion_actualizada_en_idx" ON "asistente_conversacion"("actualizada_en");

-- CreateIndex
CREATE INDEX "asistente_consulta_usuario_id_creada_en_idx" ON "asistente_consulta"("usuario_id", "creada_en");

-- CreateIndex
CREATE INDEX "asistente_consulta_creada_en_idx" ON "asistente_consulta"("creada_en");

-- AddForeignKey
ALTER TABLE "asistente_conversacion" ADD CONSTRAINT "asistente_conversacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistente_consulta" ADD CONSTRAINT "asistente_consulta_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "asistente_conversacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistente_consulta" ADD CONSTRAINT "asistente_consulta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
