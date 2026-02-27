/**
 * Step 2 — Target audience configuration.
 *
 * Fields:
 *  - jobTitles       string[]  — multi-chip input
 *  - locations       string[]  — multi-chip input
 *  - industries      string[]  — multi-chip input
 *  - exclusions      string[]  — multi-chip input (optional)
 *  - minScore        number    — 0–100 slider (minimum AI prospect score)
 */

import { useState, KeyboardEvent } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Wizard form shape (partial)
// ---------------------------------------------------------------------------

interface WizardFormValues {
  jobTitles: string[];
  locations: string[];
  industries: string[];
  exclusions: string[];
  minScore: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Chip input — allows adding/removing string tokens
// ---------------------------------------------------------------------------

interface ChipInputProps {
  name: keyof WizardFormValues;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}

function ChipInput({
  name,
  label,
  placeholder = 'Aggiungi e premi Invio',
  hint,
  required = false,
}: ChipInputProps) {
  const { setValue, formState: { errors } } = useFormContext<WizardFormValues>();
  const values = (useWatch({ name }) ?? []) as string[];
  const [inputValue, setInputValue] = useState('');

  const addChip = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || values.includes(trimmed)) return;
    setValue(name, [...values, trimmed], { shouldValidate: true });
    setInputValue('');
  };

  const removeChip = (chip: string) => {
    setValue(
      name,
      values.filter((v) => v !== chip),
      { shouldValidate: true },
    );
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addChip();
    } else if (e.key === 'Backspace' && !inputValue && values.length > 0) {
      removeChip(values[values.length - 1]);
    }
  };

  const error = errors[name];

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>

      {/* Chips + input area */}
      <div
        className={clsx(
          'min-h-[42px] flex flex-wrap gap-1.5 rounded-lg border bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500',
          error ? 'border-red-300' : 'border-gray-300',
        )}
      >
        {values.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800"
          >
            {chip}
            <button
              type="button"
              onClick={() => removeChip(chip)}
              className="rounded-full text-indigo-500 hover:text-indigo-700"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addChip}
          placeholder={values.length === 0 ? placeholder : ''}
          className="min-w-[160px] flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
        />
      </div>

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
// Score slider
// ---------------------------------------------------------------------------

function ScoreSlider() {
  const { register } = useFormContext<WizardFormValues>();
  const minScore = (useWatch({ name: 'minScore' }) ?? 50) as number;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          Score minimo prospect
        </label>
        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
          {minScore}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={5}
        {...register('minScore', { valueAsNumber: true })}
        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-indigo-600"
      />

      <div className="mt-1 flex justify-between text-xs text-gray-400">
        <span>0 — nessun filtro</span>
        <span>100 — solo i migliori</span>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        Solo i prospect con uno score AI &ge; {minScore} verranno inclusi nella
        coda di contatto.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2
// ---------------------------------------------------------------------------

export function Step2Target() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Configura il target
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Definisci le caratteristiche del pubblico che questo agente deve
          contattare. Premi <kbd className="rounded border border-gray-300 bg-gray-50 px-1 text-xs">Invio</kbd> o
          {' '}<kbd className="rounded border border-gray-300 bg-gray-50 px-1 text-xs">,</kbd> per
          aggiungere ogni elemento.
        </p>
      </div>

      <ChipInput
        name="jobTitles"
        label="Job title"
        placeholder="es. CTO, Head of Engineering..."
        hint="Inserisci i titoli professionali che vuoi targetizzare."
        required
      />

      <ChipInput
        name="locations"
        label="Localizzazioni"
        placeholder="es. Milano, Roma, Italia..."
        hint="Aree geografiche di interesse."
      />

      <ChipInput
        name="industries"
        label="Settori"
        placeholder="es. SaaS, Fintech, Manufacturing..."
        hint="Settori di riferimento."
      />

      <ChipInput
        name="exclusions"
        label="Esclusioni (opzionale)"
        placeholder="es. Studenti, Freelance..."
        hint="Keyword o qualifiche da escludere dal target."
      />

      <ScoreSlider />
    </div>
  );
}

export default Step2Target;
