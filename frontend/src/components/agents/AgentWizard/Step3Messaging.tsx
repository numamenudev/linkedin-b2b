/**
 * Step 3 — Message templates.
 *
 * Fields:
 *  - coldMessage1   string — First cold follow-up after connection accepted
 *  - coldMessage2   string — Second cold follow-up
 *  - coldMessage3   string — Third cold follow-up
 *  - warmMessage    string — Message after prospect responds
 *  - ctaType        'meeting' | 'demo' | 'call' | 'custom' — CTA selector
 *  - ctaCustomText  string — Shown only when ctaType === 'custom'
 *
 * Placeholders supported: {{firstName}}, {{company}}, {{headline}}
 */

import { useFormContext, useWatch } from 'react-hook-form';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Form shape (partial)
// ---------------------------------------------------------------------------

interface WizardFormValues {
  coldMessage1: string;
  coldMessage2: string;
  coldMessage3: string;
  warmMessage: string;
  ctaType: 'meeting' | 'demo' | 'call' | 'custom';
  ctaCustomText: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// MessageTextarea
// ---------------------------------------------------------------------------

interface MessageTextareaProps {
  name: keyof WizardFormValues;
  label: string;
  hint?: string;
  required?: boolean;
  maxLength?: number;
  rows?: number;
}

const PLACEHOLDER_HINT =
  'Variabili disponibili: {{firstName}}, {{company}}, {{headline}}';

function MessageTextarea({
  name,
  label,
  hint,
  required = false,
  maxLength = 300,
  rows = 4,
}: MessageTextareaProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<WizardFormValues>();

  const value = (useWatch({ name }) ?? '') as string;
  const error = errors[name];

  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between">
        <label className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
        <span
          className={clsx(
            'text-xs tabular-nums',
            value.length > maxLength ? 'text-red-500' : 'text-gray-400',
          )}
        >
          {value.length}/{maxLength}
        </span>
      </div>

      <textarea
        rows={rows}
        {...register(name, {
          ...(required && { required: `${label} è obbligatorio` }),
          maxLength: {
            value: maxLength,
            message: `Massimo ${maxLength} caratteri`,
          },
        })}
        className={clsx(
          'w-full resize-none rounded-lg border px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500',
          error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white',
        )}
        placeholder={`Scrivi il messaggio...\n\n${PLACEHOLDER_HINT}`}
      />

      {hint && !error && (
        <p className="mt-1 text-xs text-gray-500">{hint}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600">{error.message as string}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CTA selector
// ---------------------------------------------------------------------------

const CTA_OPTIONS: { value: WizardFormValues['ctaType']; label: string }[] = [
  { value: 'meeting', label: 'Proponi una riunione' },
  { value: 'demo', label: 'Invita a una demo' },
  { value: 'call', label: 'Proponi una call' },
  { value: 'custom', label: 'CTA personalizzata' },
];

function CtaSelector() {
  const { register, formState: { errors } } = useFormContext<WizardFormValues>();
  const ctaType = useWatch({ name: 'ctaType' }) as WizardFormValues['ctaType'];

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Call to action (CTA) *
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CTA_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              className={clsx(
                'flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors',
                ctaType === value
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
              )}
            >
              <input
                type="radio"
                value={value}
                {...register('ctaType', { required: 'Seleziona una CTA' })}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        {errors.ctaType && (
          <p className="mt-1 text-xs text-red-600">
            {errors.ctaType.message as string}
          </p>
        )}
      </div>

      {ctaType === 'custom' && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Testo CTA personalizzata *
          </label>
          <input
            type="text"
            {...register('ctaCustomText', {
              validate: (v) =>
                ctaType !== 'custom' || Boolean(v?.trim()) || 'Inserisci il testo CTA',
            })}
            placeholder="es. Scarica la nostra guida gratuita"
            className={clsx(
              'w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500',
              errors.ctaCustomText ? 'border-red-300' : 'border-gray-300',
            )}
          />
          {errors.ctaCustomText && (
            <p className="mt-1 text-xs text-red-600">
              {errors.ctaCustomText.message as string}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3
// ---------------------------------------------------------------------------

export function Step3Messaging() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Template messaggi
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Definisci la sequenza di messaggi che l&apos;agente invierà ai
          prospect dopo che la connessione viene accettata.
        </p>
      </div>

      <MessageTextarea
        name="coldMessage1"
        label="Messaggio cold 1 (primo contatto)"
        required
        hint="Inviato subito dopo che la connessione viene accettata."
      />

      <MessageTextarea
        name="coldMessage2"
        label="Messaggio cold 2 (follow-up)"
        hint="Inviato se non c'è risposta al primo messaggio."
      />

      <MessageTextarea
        name="coldMessage3"
        label="Messaggio cold 3 (ultimo follow-up)"
        hint="Inviato come ultimo tentativo prima di archiviare il prospect."
      />

      <MessageTextarea
        name="warmMessage"
        label="Messaggio warm (risposta ricevuta)"
        hint="Inviato automaticamente quando il prospect risponde. L'automazione si ferma dopo l'invio."
        rows={3}
      />

      <CtaSelector />
    </div>
  );
}

export default Step3Messaging;
