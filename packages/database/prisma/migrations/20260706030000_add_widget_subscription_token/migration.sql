-- Token secret (lecture seule) pour les widgets externes : Scriptable (iOS),
-- KWGT (Android) et le widget Windows 11/Edge de la PWA.

-- AlterTable
ALTER TABLE "widget_subscriptions" ADD COLUMN "token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "widget_subscriptions_token_key" ON "widget_subscriptions"("token");
