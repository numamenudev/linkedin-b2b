-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "personaName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "fullContextPrompt" TEXT NOT NULL,
    "toneProfile" JSONB NOT NULL,
    "companyContext" JSONB NOT NULL,
    "credibilityMarkers" JSONB NOT NULL,
    "doNotSay" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "approvedByUser" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_documents" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "extractionStatus" TEXT NOT NULL DEFAULT 'pending',
    "extractedText" TEXT,
    "extractedFacts" JSONB,
    "extractionSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'paused',
    "identityId" TEXT NOT NULL,
    "targetConfig" JSONB NOT NULL,
    "messagingConfig" JSONB NOT NULL,
    "weeklyConnectionRequests" INTEGER NOT NULL DEFAULT 60,
    "dailyConnectionRequests" INTEGER NOT NULL DEFAULT 9,
    "dailyMessages" INTEGER NOT NULL DEFAULT 8,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "linkedinMode" TEXT NOT NULL DEFAULT 'free',
    "statsJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_structures" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "queryConfig" JSONB NOT NULL,
    "fullQueryString" TEXT NOT NULL,
    "linkedinMode" TEXT NOT NULL DEFAULT 'free',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastExecutedAt" TIMESTAMP(3),
    "timesExecuted" INTEGER NOT NULL DEFAULT 0,
    "totalResultsFound" INTEGER NOT NULL DEFAULT 0,
    "newResultsLastRun" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospects" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "linkedinId" TEXT NOT NULL,
    "linkedinUrl" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "headline" TEXT,
    "location" TEXT,
    "profilePictureUrl" TEXT,
    "rawProfileData" JSONB,
    "restaurantName" TEXT,
    "restaurantType" TEXT,
    "estimatedSize" TEXT,
    "companyName" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "scoreBreakdown" JSONB,
    "status" TEXT NOT NULL DEFAULT 'found',
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectionRequestSentAt" TIMESTAMP(3),
    "connectionAcceptedAt" TIMESTAMP(3),
    "connectionRejectedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "searchStructureId" TEXT,
    "discoveryMethod" TEXT NOT NULL DEFAULT 'search',
    "hasPriorConversation" BOOLEAN NOT NULL DEFAULT false,
    "priorConversationSummary" TEXT,
    "lastConversationDate" TIMESTAMP(3),
    "existingChatId" TEXT,
    "profileAnalysis" JSONB,
    "profileAnalyzedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "content" TEXT NOT NULL,
    "unipileMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "responded" BOOLEAN NOT NULL DEFAULT false,
    "responseReceivedAt" TIMESTAMP(3),
    "responseContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_logs" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "searchStructuresRun" INTEGER NOT NULL DEFAULT 0,
    "newProspectsFound" INTEGER NOT NULL DEFAULT 0,
    "connectionRequestsSent" INTEGER NOT NULL DEFAULT 0,
    "connectionsAccepted" INTEGER NOT NULL DEFAULT 0,
    "connectionsRejected" INTEGER NOT NULL DEFAULT 0,
    "profilesAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "messagesSent" INTEGER NOT NULL DEFAULT 0,
    "responsesReceived" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "rawLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_logs" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "level" TEXT NOT NULL,
    "job" TEXT,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "reportEmail" TEXT NOT NULL DEFAULT 'daniel.dallapalma@gmail.com',
    "reportEmailTime" TEXT NOT NULL DEFAULT '19:00',
    "linkedinMode" TEXT NOT NULL DEFAULT 'free',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
    "morningJobTime" TEXT NOT NULL DEFAULT '09:00',
    "middayJobTime" TEXT NOT NULL DEFAULT '11:30',
    "afternoonJobTime" TEXT NOT NULL DEFAULT '14:00',
    "eveningJobTime" TEXT NOT NULL DEFAULT '18:30',
    "globalWeeklyConnectionLimit" INTEGER NOT NULL DEFAULT 150,
    "globalDailyConnectionLimit" INTEGER NOT NULL DEFAULT 21,
    "globalDailyMessageLimit" INTEGER NOT NULL DEFAULT 25,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "prospects_agentId_status_idx" ON "prospects"("agentId", "status");

-- CreateIndex
CREATE INDEX "prospects_agentId_status_score_idx" ON "prospects"("agentId", "status", "score");

-- CreateIndex
CREATE INDEX "prospects_status_lastActivityAt_idx" ON "prospects"("status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "prospects_linkedinId_idx" ON "prospects"("linkedinId");

-- CreateIndex
CREATE UNIQUE INDEX "prospects_linkedinId_key" ON "prospects"("linkedinId");

-- CreateIndex
CREATE INDEX "messages_prospectId_createdAt_idx" ON "messages"("prospectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "daily_logs_agentId_date_key" ON "daily_logs"("agentId", "date");

-- CreateIndex
CREATE INDEX "operation_logs_agentId_createdAt_idx" ON "operation_logs"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "operation_logs_createdAt_idx" ON "operation_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "identities" ADD CONSTRAINT "identities_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_structures" ADD CONSTRAINT "search_structures_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
