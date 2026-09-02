-- CreateEnum
CREATE TYPE "CommunicationDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "CommunicationMessageType" AS ENUM ('OUTBOUND_EMAIL', 'INBOUND_EMAIL', 'OUTBOUND_CALL', 'INBOUND_CALL', 'CALL_NOTE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CommunicationMessageStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'RECEIVED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "CommunicationThreadStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CommunicationCallOutcome" AS ENUM ('CLIENT_REACHED', 'NO_ANSWER', 'VOICEMAIL', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'MEETING_ARRANGED', 'OTHER');

-- CreateTable
CREATE TABLE "CommunicationThread" (
    "id" TEXT NOT NULL,
    "threadNumber" TEXT NOT NULL,
    "publicLeadId" TEXT NOT NULL,
    "level2AssessmentId" TEXT,
    "subject" TEXT,
    "status" "CommunicationThreadStatus" NOT NULL DEFAULT 'OPEN',
    "correlationToken" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "unreadInboundCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "CommunicationThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT,
    "publicLeadId" TEXT NOT NULL,
    "type" "CommunicationMessageType" NOT NULL,
    "direction" "CommunicationDirection" NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SMTP',
    "providerMessageId" TEXT,
    "internetMessageId" TEXT,
    "inReplyTo" TEXT,
    "referencesHeader" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" TEXT[],
    "ccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT,
    "textBody" TEXT,
    "htmlBody" TEXT,
    "previewText" TEXT,
    "status" "CommunicationMessageStatus" NOT NULL DEFAULT 'DRAFT',
    "sentByUserId" TEXT,
    "errorMessage" TEXT,
    "telephoneNumber" TEXT,
    "contactedPerson" TEXT,
    "callOutcome" "CommunicationCallOutcome",
    "durationSeconds" INTEGER,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationMessageRead" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationMessageRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationThread_threadNumber_key" ON "CommunicationThread"("threadNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationThread_correlationToken_key" ON "CommunicationThread"("correlationToken");

-- CreateIndex
CREATE INDEX "CommunicationThread_publicLeadId_lastMessageAt_idx" ON "CommunicationThread"("publicLeadId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "CommunicationThread_level2AssessmentId_idx" ON "CommunicationThread"("level2AssessmentId");

-- CreateIndex
CREATE INDEX "CommunicationThread_lastMessageAt_idx" ON "CommunicationThread"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationMessage_providerMessageId_key" ON "CommunicationMessage"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationMessage_internetMessageId_key" ON "CommunicationMessage"("internetMessageId");

-- CreateIndex
CREATE INDEX "CommunicationMessage_publicLeadId_createdAt_idx" ON "CommunicationMessage"("publicLeadId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationMessage_threadId_createdAt_idx" ON "CommunicationMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationMessage_inReplyTo_idx" ON "CommunicationMessage"("inReplyTo");

-- CreateIndex
CREATE INDEX "CommunicationMessage_status_idx" ON "CommunicationMessage"("status");

-- CreateIndex
CREATE INDEX "CommunicationAttachment_messageId_idx" ON "CommunicationAttachment"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationMessageRead_messageId_userId_key" ON "CommunicationMessageRead"("messageId", "userId");

-- CreateIndex
CREATE INDEX "CommunicationMessageRead_userId_idx" ON "CommunicationMessageRead"("userId");

-- AddForeignKey
ALTER TABLE "CommunicationThread" ADD CONSTRAINT "CommunicationThread_publicLeadId_fkey" FOREIGN KEY ("publicLeadId") REFERENCES "PublicLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationThread" ADD CONSTRAINT "CommunicationThread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommunicationThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_publicLeadId_fkey" FOREIGN KEY ("publicLeadId") REFERENCES "PublicLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationAttachment" ADD CONSTRAINT "CommunicationAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CommunicationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationMessageRead" ADD CONSTRAINT "CommunicationMessageRead_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CommunicationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationMessageRead" ADD CONSTRAINT "CommunicationMessageRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
