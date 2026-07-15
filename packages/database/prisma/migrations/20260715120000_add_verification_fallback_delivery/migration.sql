-- Migration: add verification fallback delivery (thread/ticket when DM fails)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VerificationFallbackKind') THEN
    CREATE TYPE "VerificationFallbackKind" AS ENUM ('THREAD', 'TICKET');
  END IF;
END
$$;

ALTER TABLE "guilds" ADD COLUMN IF NOT EXISTS "verificationFallbackChannelId" TEXT;

ALTER TABLE "security_verifications" ADD COLUMN IF NOT EXISTS "fallbackChannelId" TEXT;
ALTER TABLE "security_verifications" ADD COLUMN IF NOT EXISTS "fallbackKind" "VerificationFallbackKind";
