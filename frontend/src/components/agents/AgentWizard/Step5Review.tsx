/**
 * Step 5 — Review & confirm.
 *
 * Displays a read-only summary of all wizard values before the user submits.
 * Renders a "Crea e attiva" button that triggers the parent form's onSubmit.
 *
 * Layout:
 *   - Identity section
 *   - Target section (job titles, locations, industries, exclusions, min score)
 *   - Messaging section (cold messages 1-3, warm message, CTA)
 *   - Budget section (weekly connections, daily messages, priority, LinkedIn mode)
 */

import { useFormContext, useWatch } from 'react-hook-form';
import { clsx } from 'clsx';
import { CheckCircle2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Full wizard form shape
// ---------------------------------------------------------------------------

interface WizardFormValues {
  // Step 1
  identityId: string;
  identityName?: string;
  // Step 2
  jobTitles: string[];
  locations: string[];
  industries: string[];
  exclusions: string[];
  minScore: number;
  // Step 3
  coldMessage1: string;
  coldMessage2: string;
  coldMessage3: string;
  warmMessage: string;
  ctaType: 'meeting' | 'demo' | 'call' | 'custom';
  ctaCustomText: string;
  // Step 4
  weeklyConnections: number;
  dailyMessages: number;
  priority: 1 | 2 | 3;
  linkedinMode: 'free' | 'sales_navigator';
  // Meta
  name: string;
}

// ---------------------------------------------------------------------------
// Review helpers
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </h3>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="w-40 shrink-0 text-xs font-medium text-gray-500">
        {label}
      </span>
      <span className="text-sm text-gray-900">{value || <em className="text-gray-400">—</em>}</span>
    </div>
  );
}

function ChipList({ values }: { values: string[] }) {
  if (!values || values.length === 0)
    return <em className="text-xs text-gray-400">Nessuno</em>;
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => (
        <span
          key={v}
          className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800"
        >
          {v}
        </span>
      ))}
    </div>
  );
}

function MessagePreview({ text }: { text: string }) {
  if (!text) return <em className="text-xs text-gray-400">Non impostato</em>;
  return (
    <span className="block max-h-24 overflow-hidden rounded bg-gray-50 p-2 text-xs text-gray-700 leading-relaxed line-clamp-4 border border-gray-200">
      {text}
    </span>
  );
}

const PRIORITY_LABEL: Record<number, string> = {
  1: 'Bassa',
  2: 'Media',
  3: 'Alta',
};

const CTA_LABEL: Record<string, string> = {
  meeting: 'Proponi riunione',
  demo: 'Invita a una demo',
  call: 'Proponi call',
  custom: 'Personalizzata',
};

// ---------------------------------------------------------------------------
// Step 5
// ---------------------------------------------------------------------------

export function Step5Review() {
  const {
    formState: { isSubmitting, errors },
  } = useFormContext<WizardFormValues>();

  // Watch all fields for the review
  const values = useWatch() as WizardFormValues;

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Riepilogo configurazione
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Verifica le impostazioni prima di creare l&apos;agente. Puoi tornare
          indietro per modificare qualsiasi sezione.
        </p>
      </div>

      {hasErrors && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Alcuni campi non sono stati compilati correttamente. Torna agli step
          precedenti per correggere gli errori.
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Identity                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeading>Identita</SectionHeading>
        <div className="divide-y divide-gray-100">
          <Field
            label="ID identita"
            value={
              values.identityId ? (
                <code className="rounded bg-gray-100 px-1 text-xs">
                  {values.identityId}
                </code>
              ) : null
            }
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Target                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeading>Target</SectionHeading>
        <div className="divide-y divide-gray-100">
          <div className="py-2">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Job title
            </span>
            <ChipList values={values.jobTitles} />
          </div>
          <div className="py-2">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Localizzazioni
            </span>
            <ChipList values={values.locations} />
          </div>
          <div className="py-2">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Settori
            </span>
            <ChipList values={values.industries} />
          </div>
          <div className="py-2">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Esclusioni
            </span>
            <ChipList values={values.exclusions} />
          </div>
          <Field label="Score minimo" value={values.minScore ?? 50} />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Messaging                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeading>Messaggi</SectionHeading>
        <div className="divide-y divide-gray-100">
          <div className="py-2">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Cold 1 (primo contatto)
            </span>
            <MessagePreview text={values.coldMessage1} />
          </div>
          <div className="py-2">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Cold 2 (follow-up)
            </span>
            <MessagePreview text={values.coldMessage2} />
          </div>
          <div className="py-2">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Cold 3 (ultimo follow-up)
            </span>
            <MessagePreview text={values.coldMessage3} />
          </div>
          <div className="py-2">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Warm (risposta ricevuta)
            </span>
            <MessagePreview text={values.warmMessage} />
          </div>
          <Field
            label="CTA"
            value={
              values.ctaType === 'custom'
                ? values.ctaCustomText || 'Personalizzata (testo mancante)'
                : CTA_LABEL[values.ctaType] ?? '—'
            }
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Budget                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeading>Budget e limiti</SectionHeading>
        <div className="divide-y divide-gray-100">
          <Field
            label="Inviti/settimana"
            value={`${values.weeklyConnections ?? 70} connessioni`}
          />
          <Field
            label="Messaggi/giorno"
            value={`${values.dailyMessages ?? 10} messaggi`}
          />
          <Field
            label="Priorita"
            value={PRIORITY_LABEL[values.priority ?? 2]}
          />
          <Field
            label="Modalita LinkedIn"
            value={
              values.linkedinMode === 'sales_navigator'
                ? 'Sales Navigator'
                : 'LinkedIn Free'
            }
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Submit                                                               */}
      {/* ------------------------------------------------------------------ */}
      <button
        type="submit"
        disabled={isSubmitting || hasErrors}
        className={clsx(
          'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors',
          isSubmitting || hasErrors
            ? 'cursor-not-allowed bg-gray-400'
            : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
        )}
      >
        {isSubmitting ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Creazione in corso...
          </>
        ) : (
          <>
            <CheckCircle2 className="h-5 w-5" />
            Crea e attiva
          </>
        )}
      </button>
    </div>
  );
}

export default Step5Review;
