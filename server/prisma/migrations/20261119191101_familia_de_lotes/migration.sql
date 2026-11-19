-- AlterTable
ALTER TABLE "lote" ADD COLUMN     "raiz_id" INTEGER;

-- CreateIndex
CREATE INDEX "lote_raiz_id_idx" ON "lote"("raiz_id");

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_raiz_id_fkey" FOREIGN KEY ("raiz_id") REFERENCES "lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
