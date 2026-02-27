/**
 * backend/src/identity/document-processor.ts
 *
 * Text extraction from uploaded identity documents.
 *
 * Supported file types:
 *  - pdf  : pdf-parse
 *  - pptx : officeparser
 *  - txt  : fs.readFile (UTF-8)
 *
 * Main entry points:
 *  - processDocument(document)   : extract text from a single IdentityDocument and persist to DB
 *  - processAllPending()         : find all documents with extractionStatus='pending' and process them
 */

import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
// officeparser v4 uses a callback-based API exposed via parseOffice / parseOfficeAsync
import officeParser from 'officeparser';
import { db } from '../db/prisma.client';

// ---------------------------------------------------------------------------
// Types (inline — mirrors Prisma's IdentityDocument shape)
// ---------------------------------------------------------------------------

interface IdentityDocument {
  id: string;
  identityId: string;
  filename: string;
  originalName: string;
  fileType: string;
  filePath: string;
  extractionStatus: string;
  extractedText: string | null;
  extractedFacts: unknown;
  extractionSummary: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// extractFromPdf
// ---------------------------------------------------------------------------

/**
 * Extracts plain text from a PDF file using pdf-parse.
 *
 * @param filePath - Absolute path to the PDF file
 * @returns Extracted text string
 */
export async function extractFromPdf(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const result = await pdfParse(buffer);
  return result.text ?? '';
}

// ---------------------------------------------------------------------------
// extractFromPptx
// ---------------------------------------------------------------------------

/**
 * Extracts plain text from a PPTX (or other Office) file using officeparser.
 *
 * @param filePath - Absolute path to the PPTX file
 * @returns Extracted text string
 */
export async function extractFromPptx(filePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    officeParser.parseOffice(filePath, (data: string | null, err: Error | null) => {
      if (err) {
        reject(new Error(`[extractFromPptx] officeparser failed for "${filePath}": ${err.message}`));
        return;
      }
      resolve(data ?? '');
    });
  });
}

// ---------------------------------------------------------------------------
// extractFromTxt
// ---------------------------------------------------------------------------

/**
 * Reads a plain text file and returns its content as a string.
 *
 * @param filePath - Absolute path to the text file
 * @returns File contents as a UTF-8 string
 */
export async function extractFromTxt(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  return content;
}

// ---------------------------------------------------------------------------
// processDocument
// ---------------------------------------------------------------------------

/**
 * Extracts text from a single IdentityDocument based on its fileType and
 * persists the result (or failure) back to the database.
 *
 * - On success: sets extractionStatus='completed', extractedText=<text>
 * - On failure: sets extractionStatus='failed', extractionSummary=<error message>
 *
 * @param document - IdentityDocument record from Prisma
 */
export async function processDocument(document: IdentityDocument): Promise<void> {
  const { id, filePath, fileType, originalName } = document;

  // Resolve absolute path — filePath may be stored relative to the project root
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

  let extractedText = '';
  let errorMessage: string | null = null;

  try {
    const normalizedType = fileType.toLowerCase().replace(/^\./, '');

    if (normalizedType === 'pdf') {
      extractedText = await extractFromPdf(absolutePath);
    } else if (['pptx', 'ppt', 'docx', 'doc'].includes(normalizedType)) {
      extractedText = await extractFromPptx(absolutePath);
    } else if (['txt', 'text', 'md'].includes(normalizedType)) {
      extractedText = await extractFromTxt(absolutePath);
    } else {
      throw new Error(
        `[processDocument] Unsupported fileType "${fileType}" for document "${originalName}" (id: ${id})`,
      );
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  if (errorMessage) {
    await db.identityDocument.update({
      where: { id },
      data: {
        extractionStatus: 'failed',
        extractionSummary: errorMessage,
      },
    });
  } else {
    await db.identityDocument.update({
      where: { id },
      data: {
        extractionStatus: 'completed',
        extractedText,
        extractionSummary: null,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// processAllPending
// ---------------------------------------------------------------------------

/**
 * Finds all IdentityDocuments with extractionStatus='pending' and processes them
 * sequentially. Documents that fail are marked 'failed' and processing continues
 * for remaining documents.
 *
 * @returns Summary object with counts of processed, succeeded, and failed documents
 */
export async function processAllPending(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  const pendingDocs = await db.identityDocument.findMany({
    where: { extractionStatus: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  let succeeded = 0;
  let failed = 0;

  for (const doc of pendingDocs) {
    try {
      await processDocument(doc as IdentityDocument);
      // Check result to count outcome
      const updated = await db.identityDocument.findUnique({ where: { id: doc.id } });
      if (updated?.extractionStatus === 'completed') {
        succeeded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return {
    total: pendingDocs.length,
    succeeded,
    failed,
  };
}
