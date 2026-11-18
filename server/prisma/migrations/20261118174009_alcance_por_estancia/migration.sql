-- Paso 3 del rediseño (DECISIONES §11): alcance por estancia.
-- Cada usuario ve sus estancias (usuario_campo) o todas (todas_las_estancias).
-- Nadie queda con "todas" por defecto: se asigna desde Usuarios.

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "todas_las_estancias" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "usuario_campo" (
    "usuario_id" INTEGER NOT NULL,
    "campo_id" INTEGER NOT NULL,
    "asignado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_campo_pkey" PRIMARY KEY ("usuario_id","campo_id")
);

-- CreateIndex
CREATE INDEX "usuario_campo_campo_id_idx" ON "usuario_campo"("campo_id");

-- AddForeignKey
ALTER TABLE "usuario_campo" ADD CONSTRAINT "usuario_campo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_campo" ADD CONSTRAINT "usuario_campo_campo_id_fkey" FOREIGN KEY ("campo_id") REFERENCES "campo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
