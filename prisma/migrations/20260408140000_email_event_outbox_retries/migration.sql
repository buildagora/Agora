-- Retryable outbox fields for EmailEvent
ALTER TABLE "EmailEvent" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EmailEvent" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "EmailEvent" ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
