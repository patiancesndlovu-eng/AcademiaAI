-- Phase 3 hardening: PostgreSQL enums (spec §7.1), spec §8 indexes,
-- Source progress tracking, NotebookMember user relation.

-- CreateEnum
CREATE TYPE "NotebookVisibility" AS ENUM ('private', 'shared', 'public');

-- CreateEnum
CREATE TYPE "NotebookRole" AS ENUM ('owner', 'editor', 'viewer');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('upload', 'url', 'text', 'drive');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('queued', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "GenerationType" AS ENUM ('quiz', 'flashcards', 'summary', 'report', 'mindmap');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('queued', 'processing', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'system');

-- Source: new processing-tracking columns
ALTER TABLE "Source" ADD COLUMN "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0;

-- Convert string columns to enums, preserving existing data via USING casts.
-- Defaults are dropped first: a text default cannot be cast automatically.
ALTER TABLE "ChatMessage" ALTER COLUMN "role" SET DATA TYPE "MessageRole" USING "role"::text::"MessageRole";
ALTER TABLE "GenerationJob" ALTER COLUMN "type" SET DATA TYPE "GenerationType" USING "type"::text::"GenerationType";
ALTER TABLE "GenerationJob" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "GenerationJob" ALTER COLUMN "status" SET DATA TYPE "GenerationStatus" USING "status"::text::"GenerationStatus";
ALTER TABLE "Notebook" ALTER COLUMN "visibility" DROP DEFAULT;
ALTER TABLE "Notebook" ALTER COLUMN "visibility" SET DATA TYPE "NotebookVisibility" USING "visibility"::text::"NotebookVisibility";
ALTER TABLE "NotebookMember" ALTER COLUMN "role" SET DATA TYPE "NotebookRole" USING "role"::text::"NotebookRole";
ALTER TABLE "Output" ALTER COLUMN "type" SET DATA TYPE "GenerationType" USING "type"::text::"GenerationType";
ALTER TABLE "Source" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Source" ALTER COLUMN "type" SET DATA TYPE "SourceType" USING "type"::text::"SourceType";
ALTER TABLE "Source" ALTER COLUMN "status" SET DATA TYPE "SourceStatus" USING "status"::text::"SourceStatus";

-- Re-assert enum defaults after type change
ALTER TABLE "GenerationJob" ALTER COLUMN "status" SET DEFAULT 'queued';
ALTER TABLE "Notebook" ALTER COLUMN "visibility" SET DEFAULT 'private';
ALTER TABLE "Source" ALTER COLUMN "status" SET DEFAULT 'queued';

-- CreateIndex (spec §8)
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "Citation_messageId_idx" ON "Citation"("messageId");

-- CreateIndex
CREATE INDEX "Citation_sourceId_idx" ON "Citation"("sourceId");

-- CreateIndex
CREATE INDEX "GenerationJob_requestedBy_idx" ON "GenerationJob"("requestedBy");

-- CreateIndex
CREATE INDEX "GenerationJob_status_idx" ON "GenerationJob"("status");

-- CreateIndex
CREATE INDEX "Note_authorId_idx" ON "Note"("authorId");

-- CreateIndex
CREATE INDEX "Notebook_deletedAt_idx" ON "Notebook"("deletedAt");

-- CreateIndex
CREATE INDEX "NotebookMember_notebookId_idx" ON "NotebookMember"("notebookId");

-- CreateIndex
CREATE INDEX "NotebookMember_userId_idx" ON "NotebookMember"("userId");

-- CreateIndex
CREATE INDEX "Output_notebookId_idx" ON "Output"("notebookId");

-- CreateIndex
CREATE INDEX "Source_notebookId_deletedAt_idx" ON "Source"("notebookId", "deletedAt");

-- CreateIndex
CREATE INDEX "Source_deletedAt_idx" ON "Source"("deletedAt");

-- CreateIndex
CREATE INDEX "SourceChunk_sourceId_idx" ON "SourceChunk"("sourceId");

-- AddForeignKey (NotebookMember.user → User)
ALTER TABLE "NotebookMember" ADD CONSTRAINT "NotebookMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
