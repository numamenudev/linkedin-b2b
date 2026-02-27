/**
 * Step 4 — Budget & rate-limit configuration.
 *
 * Fields:
 *  - weeklyConnections  number  1–70  (LinkedIn Free hard limit: 150/week,
 *                                      default 70 for safety)
 *  - dailyMessages      number  1–25  (messages to accepted connections)
 *  - priority           1 | 2 | 3    (1=low, 2=medium, 3=high)
 *  - linkedinMode       'free' | 'sales_navigator'
 */

import { useFormContext, useWatch } from 'react-hook-form';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Form shape (partial)
// ---------------------------------------------------------------------------

interface WizardFormValues {
  weeklyConnections: number;
  dailyMessages: number;
  priority: 1 | 2 | 3;
  linkedinMode: 'free' | 'sales_navigator';
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Labelled slider
// ---------------------------------------------------------------------------

interface SliderFieldProps {
  name: keyof WizardFormValues;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
}

function SliderField({
  name,
  label,
  min,
  max,
  step = 1,
  unit = '',
  hint,
}: SliderFieldProps) {
  const { register } = useFormContext<WizardFormValues>();
  const value = (useWatch({ name }) ?? min) as number;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 tabular-nums">
          {value}
          {unit}
        </span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        {...register(name, { valueAsNumber: true })}
        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-indigo-600"
      />

      <div className="mt-1 flex justify-between text-xs text-gray-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>

      {hint && (
        <p className="mt-1.5 text-xs text-gray-500">{hint}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Priority radio
// ---------------------------------------------------------------------------

const PRIORITY_OPTIONS: { value: 1 | 2 | 3; label: string; description: string }[] =
  [
    { value: 1, label: 'Bassa', description: 'Usa le risorse residue' },
    { value: 2, label: 'Media', description: 'Bilanciamento standard' },
    { value: 3, label: 'Alta', description: 'Priorità sugli altri agenti' },
  ];

function PrioritySelector() {
  const { register } = useFormContext<WizardFormValues>();
  const priority = (useWatch({ name: 'priority' }) ?? 2) as 1 | 2 | 3;

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        Priorità agente
      </label>
      <div className="grid grid-cols-3 gap-2">
        {PRIORITY_OPTIONS.map(({ value, label, description }) => (
          <label
            key={value}
            className={clsx(
              'flex cursor-pointer flex-col rounded-lg border p-3 transition-colors',
              priority === value
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 bg-white hover:bg-gray-50',
            )}
          >
            <input
              type="radio"
              value={value}
              {...register('priority', { valueAsNumber: true })}
              className="sr-only"
            />
            <span
              className={clsx(
                'text-sm font-semibold',
                priority === value ? 'text-indigo-700' : 'text-gray-900',
              )}
            >
              {label}
            </span>
            <span className="mt-0.5 text-xs text-gray-500">{description}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkedIn mode radio
// ---------------------------------------------------------------------------

const LINKEDIN_MODES: { value: 'free' | 'sales_navigator'; label: string; badge?: string; description: string }[] =
  [
    {
      value: 'free',
      label: 'LinkedIn Free',
      description: 'Ricerca per keyword, ~10 risultati per query, 150 inviti/settimana.',
    },
    {
      value: 'sales_navigator',
      label: 'Sales Navigator',
      badge: 'coming soon',
      description: 'Ricerca avanzata con filtri granulari. Richiede abbonamento separato.',
    },
  ];

function LinkedInModeSelector() {
  const { register } = useFormContext<WizardFormValues>();
  const mode = (useWatch({ name: 'linkedinMode' }) ?? 'free') as string;

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        Modalità LinkedIn
      </label>
      <div className="space-y-2">
        {LINKEDIN_MODES.map(({ value, label, badge, description }) => (
          <label
            key={value}
            className={clsx(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
              mode === value
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 bg-white hover:bg-gray-50',
              value === 'sales_navigator' && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              value={value}
              disabled={value === 'sales_navigator'}
              {...register('linkedinMode')}
              className="mt-0.5 accent-indigo-600"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{label}</span>
                {badge && (
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {badge}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{description}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4
// ---------------------------------------------------------------------------

export function Step4Budget() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Budget e limiti
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Configura i limiti di invio per rispettare le policy di LinkedIn ed
          evitare penalizzazioni.
        </p>
      </div>

      <SliderField
        name="weeklyConnections"
        label="Inviti connessione / settimana"
        min={1}
        max={70}
        step={1}
        hint="Limite consigliato: max 70/settimana (LinkedIn Free consente ~150 ma limiti conservativi riducono il rischio ban)."
      />

      <SliderField
        name="dailyMessages"
        label="Messaggi / giorno"
        min={1}
        max={25}
        step={1}
        hint="Messaggi inviati ai prospect che hanno già accettato la connessione."
      />

      <PrioritySelector />

      <LinkedInModeSelector />

      {/* Anti-ban notice */}
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-800">
        <strong>Anti-ban:</strong> La piattaforma inserisce ritardi casuali di
        10–30 minuti tra ogni invito e 3–7 minuti tra i messaggi, indipendentemente
        dai limiti impostati qui.
      </div>
    </div>
  );
}

export default Step4Budget;
