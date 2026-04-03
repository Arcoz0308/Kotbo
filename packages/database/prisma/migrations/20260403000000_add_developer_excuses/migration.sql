-- CreateTable
CREATE TABLE "developer_excuses" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "developer_excuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "developer_excuses_language_idx" ON "developer_excuses"("language");
