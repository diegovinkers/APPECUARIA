-- AlterTable
ALTER TABLE "movimiento" ADD COLUMN     "revierte_a_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_revierte_a_id_key" ON "movimiento"("revierte_a_id");

-- AddForeignKey
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_revierte_a_id_fkey" FOREIGN KEY ("revierte_a_id") REFERENCES "movimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

