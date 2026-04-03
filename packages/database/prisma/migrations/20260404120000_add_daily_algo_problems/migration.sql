-- CreateTable
CREATE TABLE "daily_algo_problems" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'moyen',
    "language" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_algo_problems_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "daily_algo_problems_language_idx" ON "daily_algo_problems"("language");
