/**
 * backend/src/identity/identity-prompts.ts
 *
 * Prompt utilities and constants specific to the Identity Builder flow.
 *
 * Responsibilities:
 *  - IDENTITY_QUESTIONS: guided onboarding questions for document-less setup
 *  - formatDocumentsForClaude(): formats extracted document texts for the user prompt
 *  - parseIdentityResponse(): parses and validates Claude's JSON identity response
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IdentityQuestion {
  id: string;
  question: string;
  placeholder: string;
  required: boolean;
}

/**
 * The validated shape returned by parseIdentityResponse().
 * Mirrors the JSON schema in IDENTITY_BUILDER_SYSTEM_PROMPT (claude.prompts.ts).
 */
export interface IdentityPackage {
  name: string;
  role: string;
  company: string;
  valueProposition: string;
  uniqueStrengths: string[];
  targetPersonas: Array<{
    title: string;
    painPoint: string;
    value: string;
  }>;
  communicationStyle: string;
  keyTopics: string[];
  fullContextPrompt: string;
  suggestedTone: string;
  language: string;
  approvedByUser: boolean;
  // Identity DB fields derived from the package
  toneProfile?: Record<string, unknown>;
  companyContext?: Record<string, unknown>;
  credibilityMarkers?: string[];
  doNotSay?: string[];
}

// ---------------------------------------------------------------------------
// IDENTITY_QUESTIONS
// ---------------------------------------------------------------------------

/**
 * Guided onboarding questions used when the user has no documents to upload.
 * Answers are collected in the frontend and passed to buildIdentityFromQuestions().
 */
export const IDENTITY_QUESTIONS: IdentityQuestion[] = [
  {
    id: 'fullName',
    question: 'Qual è il tuo nome e cognome?',
    placeholder: 'es. Mario Rossi',
    required: true,
  },
  {
    id: 'role',
    question: 'Qual è il tuo ruolo professionale attuale?',
    placeholder: 'es. Sales Manager, Consulente B2B, Fondatore',
    required: true,
  },
  {
    id: 'company',
    question: 'Per quale azienda lavori (o che hai fondato)?',
    placeholder: 'es. NuMa Consulting S.r.l.',
    required: true,
  },
  {
    id: 'valueProposition',
    question: 'In una frase, qual è il valore unico che offri ai tuoi clienti?',
    placeholder: 'es. Aiuto i ristoratori a ridurre i costi del 30% con un software gestionale su misura',
    required: true,
  },
  {
    id: 'targetAudience',
    question: 'Chi sono i tuoi clienti ideali? Descrivi ruolo, settore e dimensione aziendale.',
    placeholder: 'es. Proprietari di ristoranti con 1-5 locali nel nord Italia',
    required: true,
  },
  {
    id: 'mainProblems',
    question: 'Quali problemi specifici risolvi per i tuoi clienti?',
    placeholder: 'es. Gestione del personale caotica, food cost non monitorato, zero visibilità sui margini',
    required: true,
  },
  {
    id: 'differentiators',
    question: 'Cosa ti distingue dalla concorrenza? Quali sono i tuoi 3 punti di forza principali?',
    placeholder: 'es. Esperienza diretta nel settore F&B, implementazione rapida (2 settimane), supporto in italiano',
    required: true,
  },
  {
    id: 'successStories',
    question: 'Hai casi di successo o risultati concreti che puoi condividere?',
    placeholder: 'es. Ho aiutato 50+ ristoranti a risparmiare in media 800€/mese nei primi 3 mesi',
    required: false,
  },
  {
    id: 'communicationStyle',
    question: 'Come descriveresti il tuo stile di comunicazione?',
    placeholder: 'es. Diretto e concreto, senza giri di parole. Preferisco dati a promesse vaghe.',
    required: false,
  },
  {
    id: 'doNotSay',
    question: "Ci sono frasi, termini o approcci che vuoi assolutamente evitare nei messaggi?",
    placeholder: 'es. Niente "soluzioni innovative", niente pressione sul prezzo, evitare tecnicismi',
    required: false,
  },
];

// ---------------------------------------------------------------------------
// formatDocumentsForClaude
// ---------------------------------------------------------------------------

/**
 * Formats an array of extracted document texts into a structured string
 * suitable for inclusion in a Claude user prompt.
 *
 * @param documents - Array of objects with filename and extracted text content
 * @returns Formatted multi-document string for the user prompt
 */
export function formatDocumentsForClaude(
  documents: Array<{ filename: string; content: string }>,
): string {
  if (documents.length === 0) {
    return 'Nessun documento fornito.';
  }

  const sections = documents.map((doc, index) => {
    const trimmedContent = doc.content.trim();
    const preview = trimmedContent.length > 10_000
      ? trimmedContent.slice(0, 10_000) + '\n\n[... contenuto troncato per lunghezza ...]'
      : trimmedContent;

    return `### Documento ${index + 1}: ${doc.filename}\n${'─'.repeat(60)}\n${preview}\n${'─'.repeat(60)}`;
  });

  return `## Documenti caricati (${documents.length} file)\n\n${sections.join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// parseIdentityResponse
// ---------------------------------------------------------------------------

/**
 * Parses and validates the raw JSON string returned by Claude's buildIdentity call.
 * Strips markdown code fences if present (Claude sometimes wraps JSON in ```json ... ```).
 * Throws an error with a descriptive message if parsing or validation fails.
 *
 * @param response - Raw text response from ClaudeClient.buildIdentity()
 * @returns Validated IdentityPackage object
 */
export function parseIdentityResponse(response: string): IdentityPackage {
  // Strip markdown code fences if present
  let cleaned = response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `[parseIdentityResponse] Invalid JSON from Claude: ${err instanceof Error ? err.message : String(err)}\n` +
        `Raw response (first 500 chars): ${response.slice(0, 500)}`,
    );
  }

  // --- Required field validation ---
  const requiredStrings: Array<keyof IdentityPackage> = [
    'name',
    'role',
    'company',
    'valueProposition',
    'communicationStyle',
    'fullContextPrompt',
    'suggestedTone',
    'language',
  ];

  for (const field of requiredStrings) {
    if (typeof parsed[field] !== 'string' || !(parsed[field] as string).trim()) {
      throw new Error(
        `[parseIdentityResponse] Missing or empty required field: "${field}"`,
      );
    }
  }

  // --- Array field validation ---
  if (!Array.isArray(parsed.uniqueStrengths) || parsed.uniqueStrengths.length === 0) {
    throw new Error('[parseIdentityResponse] "uniqueStrengths" must be a non-empty array');
  }
  if (!Array.isArray(parsed.keyTopics) || parsed.keyTopics.length === 0) {
    throw new Error('[parseIdentityResponse] "keyTopics" must be a non-empty array');
  }
  if (!Array.isArray(parsed.targetPersonas) || parsed.targetPersonas.length === 0) {
    throw new Error('[parseIdentityResponse] "targetPersonas" must be a non-empty array');
  }

  // Validate each targetPersona entry
  for (const [i, persona] of (parsed.targetPersonas as unknown[]).entries()) {
    const p = persona as Record<string, unknown>;
    if (typeof p.title !== 'string' || typeof p.painPoint !== 'string' || typeof p.value !== 'string') {
      throw new Error(
        `[parseIdentityResponse] targetPersonas[${i}] must have string fields: title, painPoint, value`,
      );
    }
  }

  // Build the validated package — derive toneProfile, companyContext, credibilityMarkers, doNotSay
  const pkg: IdentityPackage = {
    name: parsed.name as string,
    role: parsed.role as string,
    company: parsed.company as string,
    valueProposition: parsed.valueProposition as string,
    uniqueStrengths: parsed.uniqueStrengths as string[],
    targetPersonas: parsed.targetPersonas as IdentityPackage['targetPersonas'],
    communicationStyle: parsed.communicationStyle as string,
    keyTopics: parsed.keyTopics as string[],
    fullContextPrompt: parsed.fullContextPrompt as string,
    suggestedTone: parsed.suggestedTone as string,
    language: parsed.language as string,
    approvedByUser: false,

    // Derive structured DB fields from the package
    toneProfile: {
      suggested: parsed.suggestedTone,
      communicationStyle: parsed.communicationStyle,
      keyTopics: parsed.keyTopics,
    },
    companyContext: {
      company: parsed.company,
      role: parsed.role,
      valueProposition: parsed.valueProposition,
      targetPersonas: parsed.targetPersonas,
    },
    credibilityMarkers: parsed.uniqueStrengths as string[],
    // doNotSay is not in the base prompt — default to empty, filled by question-based flow
    doNotSay: Array.isArray(parsed.doNotSay) ? (parsed.doNotSay as string[]) : [],
  };

  return pkg;
}
