import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, FormProvider, useFormContext } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Check, Rocket } from 'lucide-react';
import { api } from '@/lib/api';
import { useCreateAgent } from '@/hooks/useAgents';

// ---------------------------------------------------------------------------
// Identity type (from identities endpoint)
// ---------------------------------------------------------------------------
interface Identity {
  id: string;
  name: string;
  personaName?: string;
  role?: string;
  company?: string;
  approvedByUser?: boolean;
}

// ---------------------------------------------------------------------------
// Wizard form shape
// ---------------------------------------------------------------------------
interface AgentWizardFormValues {
  // Step 1
  identityId: string;
  name: string;
  description: string;
  // Step 2
  jobTitles: string;
  location: string;
  industry: string;
  exclusions: string;
  minScore: number;
  // Step 3
  connectionMessageTemplate: string;
  followUpTemplate: string;
  // Step 4
  weeklyConnectionRequests: number;
  dailyLimit: number;
  priority: number;
}

// ---------------------------------------------------------------------------
// WizardStepper
// ---------------------------------------------------------------------------
const STEP_LABELS = ['Identità', 'Target', 'Messaggi', 'Budget', 'Review'];

function WizardStepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEP_LABELS.map((label, idx) => {
        const step = idx + 1;
        const done = current > step;
        const active = current === step;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  done
                    ? 'bg-indigo-600 text-white'
                    : active
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : step}
              </div>
              <span
                className={`mt-1.5 text-xs font-medium ${
                  active ? 'text-indigo-600' : 'text-gray-400'
                }`}
              >
                {label}
              </span>
            </div>
            {idx < STEP_LABELS.length - 1 && (
              <div
                className={`h-0.5 w-12 sm:w-20 mx-1 mt-[-14px] ${
                  done ? 'bg-indigo-600' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 – Identity selection
// ---------------------------------------------------------------------------
function Step1Identity() {
  const { register, watch } = useFormContext<AgentWizardFormValues>();

  const { data: identities = [] } = useQuery<Identity[]>({
    queryKey: ['identities'],
    queryFn: () => api.get<Identity[]>('/identities'),
  });

  const selectedId = watch('identityId');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Seleziona identità</h2>
        <p className="text-sm text-gray-500 mt-1">
          Scegli un'identità esistente da cui questo agente opererà.
        </p>
      </div>

      {identities.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          Nessuna identità disponibile. Creane una prima dalla sezione Identità.
        </div>
      ) : (
        <div className="grid gap-3">
          {identities.map(identity => (
            <label
              key={identity.id}
              className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                selectedId === identity.id
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                value={identity.id}
                {...register('identityId', { required: "Seleziona un'identità" })}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <div className="flex-1">
                <p className="font-medium text-gray-900">{identity.name}</p>
                <p className="text-sm text-gray-500">
                  {identity.role} · {identity.company}
                </p>
                {identity.approvedByUser === false && (
                  <span className="text-xs text-yellow-600 mt-0.5 block">Non ancora approvata</span>
                )}
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Agent name & description */}
      <div className="border-t border-gray-100 pt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome agente <span className="text-red-500">*</span>
          </label>
          <input
            {...register('name', { required: 'Obbligatorio' })}
            placeholder="Es. NUMA-B2B"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
          <textarea
            {...register('description')}
            rows={2}
            placeholder="Breve descrizione dell'agente..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 – Target configuration
// ---------------------------------------------------------------------------
function Step2Target() {
  const { register } = useFormContext<AgentWizardFormValues>();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Configurazione target</h2>
        <p className="text-sm text-gray-500 mt-1">Definisci il profilo del prospect ideale.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Job titles <span className="text-red-500">*</span>
        </label>
        <input
          {...register('jobTitles', { required: 'Obbligatorio' })}
          placeholder="CEO, CTO, Direttore Operations (separati da virgola)"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <input
            {...register('location')}
            placeholder="Italia, Milano..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
          <input
            {...register('industry')}
            placeholder="Ristorazione, Food & Beverage..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Esclusioni</label>
        <input
          {...register('exclusions')}
          placeholder="Freelance, studenti... (separati da virgola)"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Score minimo</label>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          defaultValue={50}
          {...register('minScore', { valueAsNumber: true })}
          className="w-full accent-indigo-600"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0</span>
          <span>100</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 – Messaging configuration
// ---------------------------------------------------------------------------
function Step3Messaging() {
  const { register, watch } = useFormContext<AgentWizardFormValues>();
  const followUp = watch('followUpTemplate');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Template messaggi</h2>
        <p className="text-sm text-gray-500 mt-1">
          Usa {'{nome}'}, {'{azienda}'} come variabili. Lascia vuoto per generazione AI automatica.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Primo messaggio (dopo connessione)
        </label>
        <textarea
          {...register('connectionMessageTemplate')}
          rows={5}
          placeholder={`Ciao {nome},\n\nHo visto il tuo profilo...\n\n[Firma]`}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Follow-up (dopo 7 giorni senza risposta)
        </label>
        <textarea
          {...register('followUpTemplate')}
          rows={4}
          placeholder={`Ciao {nome}, ti scrivo nuovamente...\n\n[Firma]`}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {followUp && (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs font-medium text-gray-500 mb-2">Anteprima follow-up</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{followUp}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 – Budget
// ---------------------------------------------------------------------------
function Step4Budget() {
  const { register, watch } = useFormContext<AgentWizardFormValues>();
  const daily = watch('dailyLimit') ?? 9;
  const weekly = watch('weeklyConnectionRequests') ?? 60;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Budget e priorità</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configura i limiti (max 21/giorno, 150/settimana su LinkedIn Free).
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Richieste connessione / giorno:{' '}
          <span className="font-bold text-indigo-600">{daily}</span>
        </label>
        <input
          type="range"
          min={1}
          max={21}
          step={1}
          {...register('dailyLimit', { valueAsNumber: true })}
          className="w-full accent-indigo-600"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>1</span>
          <span>21 (max)</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Richieste connessione / settimana:{' '}
          <span className="font-bold text-indigo-600">{weekly}</span>
        </label>
        <input
          type="range"
          min={1}
          max={150}
          step={5}
          {...register('weeklyConnectionRequests', { valueAsNumber: true })}
          className="w-full accent-indigo-600"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>1</span>
          <span>150 (max)</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Priorità (1 = alta)</label>
        <select
          {...register('priority', { valueAsNumber: true })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value={1}>1 — Alta</option>
          <option value={2}>2 — Media</option>
          <option value={3}>3 — Bassa</option>
        </select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 – Review & Launch
// ---------------------------------------------------------------------------
function Step5Review() {
  const { getValues } = useFormContext<AgentWizardFormValues>();
  const values = getValues();

  const rows: { label: string; value: string | number }[] = [
    { label: 'Nome agente',          value: values.name },
    { label: 'Identity ID',          value: values.identityId },
    { label: 'Job titles',           value: values.jobTitles },
    { label: 'Location',             value: values.location || '—' },
    { label: 'Industry',             value: values.industry || '—' },
    { label: 'Score minimo',         value: values.minScore },
    { label: 'Connessioni / giorno', value: values.dailyLimit },
    { label: 'Connessioni / sett.',  value: values.weeklyConnectionRequests },
    { label: 'Priorità',             value: values.priority },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Review & Launch</h2>
        <p className="text-sm text-gray-500 mt-1">
          Controlla la configurazione prima di creare l'agente.
        </p>
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => (
              <tr key={r.label}>
                <td className="px-4 py-2.5 text-sm font-medium text-gray-500 w-48">{r.label}</td>
                <td className="px-4 py-2.5 text-sm text-gray-900">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
        <Rocket className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-indigo-900">Pronto per il lancio</p>
          <p className="text-xs text-indigo-700 mt-0.5">
            L'agente verrà creato in stato "Pausa". Attivalo dalla dashboard quando sei pronto.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentCreate Page
// ---------------------------------------------------------------------------
const TOTAL_STEPS = 5;

export default function AgentCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);

  const methods = useForm<AgentWizardFormValues>({
    defaultValues: {
      identityId: '',
      name: '',
      description: '',
      jobTitles: '',
      location: '',
      industry: '',
      exclusions: '',
      minScore: 50,
      connectionMessageTemplate: '',
      followUpTemplate: '',
      weeklyConnectionRequests: 60,
      dailyLimit: 9,
      priority: 1,
    },
  });

  const createAgent = useCreateAgent();

  const handleNext = async () => {
    const fieldsPerStep: (keyof AgentWizardFormValues)[][] = [
      ['identityId', 'name'],
      ['jobTitles'],
      [],
      [],
      [],
    ];
    const valid = await methods.trigger(fieldsPerStep[step - 1]);
    if (valid) setStep(s => Math.min(s + 1, TOTAL_STEPS));
  };

  const handleBack = () => setStep(s => Math.max(s - 1, 1));

  const onSubmit = methods.handleSubmit(data => {
    createAgent.mutate(
      {
        name: data.name,
        identityId: data.identityId,
        targetDescription: [
          data.jobTitles,
          data.location,
          data.industry,
        ].filter(Boolean).join(' | '),
        dailyLimit: data.dailyLimit,
        messageTemplate: data.connectionMessageTemplate || undefined,
      },
      {
        onSuccess: (created) => {
          void queryClient.invalidateQueries({ queryKey: ['agents'] });
          navigate(`/agents/${created.id}`);
        },
      },
    );
  });

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Crea nuovo agente</h1>
        <p className="text-sm text-gray-500 mt-0.5">Wizard in {TOTAL_STEPS} step</p>
      </div>

      {/* Stepper */}
      <div className="flex justify-center overflow-x-auto pb-2">
        <WizardStepper current={step} />
      </div>

      {/* Form */}
      <FormProvider {...methods}>
        <form onSubmit={onSubmit}>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-h-[360px]">
            {step === 1 && <Step1Identity />}
            {step === 2 && <Step2Target />}
            {step === 3 && <Step3Messaging />}
            {step === 4 && <Step4Budget />}
            {step === 5 && <Step5Review />}
          </div>

          {createAgent.isError && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
              Errore nella creazione dell'agente. Riprova.
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between mt-4">
            <button
              type="button"
              onClick={step === 1 ? () => navigate('/agents') : handleBack}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              {step === 1 ? 'Annulla' : 'Indietro'}
            </button>

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Avanti
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={createAgent.isPending}
                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <Rocket className="h-4 w-4" />
                {createAgent.isPending ? 'Creazione...' : 'Lancia agente'}
              </button>
            )}
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
