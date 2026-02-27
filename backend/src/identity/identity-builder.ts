/**
 * backend/src/identity/identity-builder.ts
 *
 * Builds and regenerates Identity packages by combining extracted document
 * texts (or guided question answers) with Claude Opus.
 *
 * Main entry points:
 *  - buildIdentityFromDocuments(identityId)  : reads extracted docs, calls Claude Opus,
 *                                              persists all identity fields to DB
 *  - buildIdentityFromQuestions(answers)     : builds identity from guided question answers
 *  - regenerateIdentity(identityId)          : rebuilds fullContextPrompt and increments version
 *
 * Claude integration:
 *  - Uses claudeClient.buildIdentity() (Opus model, max 4096 tokens)
 *  - System prompt: IDENTITY_BUILDER_SYSTEM_PROMPT (claude.prompts.ts)
 *  - User prompt:   buildIdentityBuilderUserPrompt (claude.prompts.ts)
 */

import { db } from '../db/prisma.client';
import { claudeClient } from '../integrations/claude/claude.client';
import {
  IDENTITY_BUILDER_SYSTEM_PROMPT,
  buildIdentityBuilderUserPrompt,
} from '../integrations/claude/claude.prompts';
import {
  IDENTITY_QUESTIONS,
  formatDocumentsForClaude,
  parseIdentityResponse,
  type IdentityPackage,
} from './identity-prompts';

// ---------------------------------------------------------------------------
// buildIdentityFromDocuments
// ---------------------------------------------------------------------------

/**
 * Builds (or rebuilds) the identity package for an existing Identity record by:
 *  1. Loading all 'completed' IdentityDocuments for the given identityId
 *  2. Calling Claude Opus with the extracted texts
 *  3. Persisting all derived fields (fullContextPrompt, toneProfile, companyContext,
 *     credibilityMarkers, doNotSay, personaName, role, company) back to the Identity row
 *
 * Throws if:
 *  - The Identity does not exist
 *  - No completed documents are found
 *  - Claude returns an unparseable response
 *
 * @param identityId - UUID of the Identity record in the database
 * @returns The parsed IdentityPackage returned by Claude
 */
export async function buildIdentityFromDocuments(identityId: string): Promise<IdentityPackage> {
  // 1. Load the Identity record (to get agentContext hints stored at creation time)
  const identity = await db.identity.findUnique({
    where: { id: identityId },
    include: {
      documents: {
        where: { extractionStatus: 'completed' },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!identity) {
    throw new Error(`[buildIdentityFromDocuments] Identity not found: ${identityId}`);
  }

  if (identity.documents.length === 0) {
    throw new Error(
      `[buildIdentityFromDocuments] No completed documents found for identity "${identityId}". ` +
        'Run document extraction first.',
    );
  }

  // 2. Format documents for Claude
  const documentTexts = identity.documents.map((doc) => ({
    filename: doc.originalName,
    content: doc.extractedText ?? '',
  }));

  const agentContext = {
    name: identity.personaName || undefined,
    role: identity.role || undefined,
    company: identity.company || undefined,
    targetDescription: undefined,
  };

  const systemPrompt = IDENTITY_BUILDER_SYSTEM_PROMPT();
  const userPrompt = buildIdentityBuilderUserPrompt({ documentTexts, agentContext });

  // 3. Call Claude Opus
  const rawResponse = await claudeClient.buildIdentity(systemPrompt, userPrompt);

  // 4. Parse and validate the response
  const pkg = parseIdentityResponse(rawResponse);

  // 5. Persist to DB
  await db.identity.update({
    where: { id: identityId },
    data: {
      personaName: pkg.name,
      role: pkg.role,
      company: pkg.company,
      fullContextPrompt: pkg.fullContextPrompt,
      toneProfile: pkg.toneProfile ?? {},
      companyContext: pkg.companyContext ?? {},
      credibilityMarkers: pkg.credibilityMarkers ?? [],
      doNotSay: pkg.doNotSay ?? [],
      approvedByUser: false,
    },
  });

  return pkg;
}

// ---------------------------------------------------------------------------
// buildIdentityFromQuestions
// ---------------------------------------------------------------------------

/**
 * Builds an identity package from guided question answers (no documents required).
 * Creates a new Identity record in the database with the generated package.
 *
 * @param answers - Map of question IDs to user-provided answer strings
 *                  (question IDs match IDENTITY_QUESTIONS[*].id)
 * @returns The newly created Identity record with the generated package applied
 */
export async function buildIdentityFromQuestions(
  answers: Record<string, string>,
): Promise<{ identityId: string; package: IdentityPackage }> {
  // Build a synthetic "document" from the Q&A pairs so we can reuse the
  // same Claude prompt infrastructure
  const questionLines = IDENTITY_QUESTIONS.map((q) => {
    const answer = (answers[q.id] ?? '').trim();
    if (!answer) return null;
    return `**${q.question}**\n${answer}`;
  }).filter(Boolean);

  if (questionLines.length === 0) {
    throw new Error('[buildIdentityFromQuestions] No answers provided');
  }

  const syntheticDocument = questionLines.join('\n\n');

  const documentTexts = [
    {
      filename: 'risposte-onboarding.txt',
      content: syntheticDocument,
    },
  ];

  // Extract lightweight agent context from the answers directly
  const agentContext = {
    name: answers['fullName'] || undefined,
    role: answers['role'] || undefined,
    company: answers['company'] || undefined,
    targetDescription: answers['targetAudience'] || undefined,
  };

  const systemPrompt = IDENTITY_BUILDER_SYSTEM_PROMPT();
  const userPrompt = buildIdentityBuilderUserPrompt({ documentTexts, agentContext });

  // Call Claude Opus
  const rawResponse = await claudeClient.buildIdentity(systemPrompt, userPrompt);

  // Parse and validate
  const pkg = parseIdentityResponse(rawResponse);

  // Handle doNotSay from question answers if not already populated by Claude
  if (answers['doNotSay'] && (!pkg.doNotSay || pkg.doNotSay.length === 0)) {
    pkg.doNotSay = answers['doNotSay']
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Persist to DB as a new Identity record
  const created = await db.identity.create({
    data: {
      name: pkg.name,
      personaName: pkg.name,
      role: pkg.role,
      company: pkg.company,
      fullContextPrompt: pkg.fullContextPrompt,
      toneProfile: pkg.toneProfile ?? {},
      companyContext: pkg.companyContext ?? {},
      credibilityMarkers: pkg.credibilityMarkers ?? [],
      doNotSay: pkg.doNotSay ?? [],
      approvedByUser: false,
      version: 1,
    },
  });

  return { identityId: created.id, package: pkg };
}

// ---------------------------------------------------------------------------
// regenerateIdentity
// ---------------------------------------------------------------------------

/**
 * Regenerates the fullContextPrompt for an existing Identity by re-running the
 * Claude Opus build step on all completed documents. Increments the version counter.
 *
 * This is used when the user wants a fresh generation without re-uploading documents
 * (e.g., after editing the Identity details or after document re-extraction).
 *
 * @param identityId - UUID of the Identity to regenerate
 * @returns The new IdentityPackage after regeneration
 */
export async function regenerateIdentity(identityId: string): Promise<IdentityPackage> {
  // Reset approvedByUser so the user must re-approve after regeneration
  await db.identity.update({
    where: { id: identityId },
    data: { approvedByUser: false },
  });

  // Rebuild from documents
  const pkg = await buildIdentityFromDocuments(identityId);

  // Increment version
  await db.identity.update({
    where: { id: identityId },
    data: {
      version: { increment: 1 },
    },
  });

  return pkg;
}

// Re-export types that callers may need
export type { IdentityPackage };
