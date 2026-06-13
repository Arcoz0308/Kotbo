ALTER TABLE "sanctions"
ADD COLUMN "lastReportReminderAt" TIMESTAMP(3),
ADD COLUMN "managerReportEscalatedAt" TIMESTAMP(3);
