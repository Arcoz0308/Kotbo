-- Migration: add DC (double-account) detection score tracking to MemberProfile
ALTER TABLE "MemberProfile" ADD COLUMN IF NOT EXISTS "dcScore" INTEGER;
ALTER TABLE "MemberProfile" ADD COLUMN IF NOT EXISTS "lastDcAlertAt" TIMESTAMP(3);
