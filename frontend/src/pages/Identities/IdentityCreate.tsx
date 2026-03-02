import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, FormProvider, useFormContext } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Upload,
  MessageSquare,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// IDENTITY_QUESTIONS — static copy from backend/src/identity/identity-prompts.ts
// ---------------------------------------------------------------------------

interface IdentityQuestion {
  id: string;
  question: string;
  placeholder: string;
  required: boolean;
}

const IDENTITY_QUESTIONS: IdentityQuestion[] = [
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
    question: 'Ci sono frasi, termini o approcci che vuoi assolutamente evitare nei messaggi?',
    placeholder: 'es. Niente "soluzioni innovative", niente pressione sul prezzo, evitare tecnicismi',
    required: false,
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CreationMode = 'documents' | 'questions';

interface IdentityFormValues {
  // Step 1 — base info
  name: string;
  personaName: string;
  role: string;
  company: string;
  mode: CreationMode;
  // Step 2A — documents
  agentContext: string;
  // Step 2B — questions (dynamic keys)
  answers: Record<string, string>;
}

// ---------------------------------------------------------------------------
// WizardStepper (2 steps)
// ---------------------------------------------------------------------------

const STEP_LABELS = ['Info base', 'Contenuto'];

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
                className={`h-0.5 w-20 sm:w-32 mx-2 mt-[-14px] ${
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
// Step 1 — Base info + mode selection
// ---------------------------------------------------------------------------

function Step1BaseInfo() {
  const { register, watch, setValue } = useFormContext<IdentityFormValues>();
  const mode = watch('mode');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Informazioni base</h2>
        <p className="text-sm text-gray-500 mt-1">
          Compila i dati principali e scegli come vuoi creare l'identità.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome interno <span className="text-red-500">*</span>
          </label>
          <input
            {...register('name', { required: 'Obbligatorio' })}
            placeholder="Es. Identità NUMA B2B"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome persona <span className="text-red-500">*</span>
          </label>
          <input
            {...register('personaName', { required: 'Obbligatorio' })}
            placeholder="Es. Mario Rossi"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ruolo <span className="text-red-500">*</span>
          </label>
          <input
            {...register('role', { required: 'Obbligatorio' })}
            placeholder="Es. Sales Manager"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Azienda <span className="text-red-500">*</span>
          </label>
          <input
            {...register('company', { required: 'Obbligatorio' })}
            placeholder="Es. NuMa Consulting S.r.l."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Mode selection */}
      <div className="border-t border-gray-100 pt-5">
        <p className="text-sm font-medium text-gray-700 mb-3">
          Come vuoi generare l'identità? <span className="text-red-500">*</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setValue('mode', 'documents')}
            className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors ${
              mode === 'documents'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Upload className="h-5 w-5 text-indigo-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Carica documenti</p>
              <p className="text-xs text-gray-500 mt-0.5">
                PDF, PPTX o TXT con info sull'azienda e sul profilo.
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setValue('mode', 'questions')}
            className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors ${
              mode === 'questions'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <MessageSquare className="h-5 w-5 text-indigo-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Rispondi alle domande</p>
              <p className="text-xs text-gray-500 mt-0.5">
                10 domande guidate per costruire il profilo.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2A — Document upload
// ---------------------------------------------------------------------------

function Step2Documents({
  files,
  onFilesChange,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
}) {
  const { register } = useFormContext<IdentityFormValues>();

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const dropped = Array.from(e.dataTransfer.files).filter((f) =>
        ['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain'].includes(f.type),
      );
      onFilesChange([...files, ...dropped].slice(0, 10));
    },
    [files, onFilesChange],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const selected = Array.from(e.target.files);
        onFilesChange([...files, ...selected].slice(0, 10));
      }
    },
    [files, onFilesChange],
  );

  const removeFile = useCallback(
    (index: number) => {
      onFilesChange(files.filter((_, i) => i !== index));
    },
    [files, onFilesChange],
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Carica documenti</h2>
        <p className="text-sm text-gray-500 mt-1">
          Carica fino a 10 file (PDF, PPTX, TXT) — max 10 MB ciascuno. L'AI estrarrà le informazioni per costruire l'identità.
        </p>
      </div>

      {/* Dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors"
      >
        <Upload className="h-8 w-8 text-gray-400 mx-auto mb-3" />
        <p className="text-sm text-gray-600">
          Trascina i file qui oppure{' '}
          <label className="text-indigo-600 font-medium cursor-pointer hover:underline">
            sfoglia
            <input
              type="file"
              multiple
              accept=".pdf,.pptx,.txt"
              onChange={handleFileInput}
              className="hidden"
            />
          </label>
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF, PPTX, TXT — max 10 file, 10 MB ciascuno</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
            >
              <span className="text-sm text-gray-700 truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Agent context */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Contesto aggiuntivo (opzionale)
        </label>
        <textarea
          {...register('agentContext')}
          rows={3}
          placeholder="Informazioni extra per guidare la generazione dell'identità..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2B — Guided questions
// ---------------------------------------------------------------------------

function Step2Questions() {
  const { register, formState: { errors } } = useFormContext<IdentityFormValues>();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Domande guidate</h2>
        <p className="text-sm text-gray-500 mt-1">
          Rispondi alle domande per costruire il profilo. I campi con * sono obbligatori.
        </p>
      </div>

      <div className="space-y-4">
        {IDENTITY_QUESTIONS.map((q) => (
          <div key={q.id}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {q.question} {q.required && <span className="text-red-500">*</span>}
            </label>
            <textarea
              {...register(`answers.${q.id}`, {
                required: q.required ? 'Questo campo è obbligatorio' : false,
              })}
              rows={2}
              placeholder={q.placeholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {errors.answers?.[q.id] && (
              <p className="text-xs text-red-500 mt-1">{errors.answers[q.id]?.message}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IdentityCreate Page
// ---------------------------------------------------------------------------

export default function IdentityCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState<File[]>([]);

  const methods = useForm<IdentityFormValues>({
    defaultValues: {
      name: '',
      personaName: '',
      role: '',
      company: '',
      mode: 'documents',
      agentContext: '',
      answers: {},
    },
  });

  const mode = methods.watch('mode');

  // Mutation — documents mode
  const fromDocsMutation = useMutation({
    mutationFn: (formData: FormData) =>
      api.post('/identities/from-documents', formData),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['identities'] });
      navigate('/identities');
    },
  });

  // Mutation — questions mode
  const fromQuestionsMutation = useMutation({
    mutationFn: (body: { answers: Record<string, string> }) =>
      api.post('/identities/from-questions', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['identities'] });
      navigate('/identities');
    },
  });

  const isSubmitting = fromDocsMutation.isPending || fromQuestionsMutation.isPending;
  const submitError = fromDocsMutation.error || fromQuestionsMutation.error;

  const handleNext = async () => {
    if (step === 1) {
      const valid = await methods.trigger(['name', 'personaName', 'role', 'company']);
      if (valid) setStep(2);
    }
  };

  const handleBack = () => {
    if (step === 2) setStep(1);
    else navigate('/identities');
  };

  const handleSubmit = methods.handleSubmit((data) => {
    if (data.mode === 'documents') {
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('personaName', data.personaName);
      formData.append('role', data.role);
      formData.append('company', data.company);
      if (data.agentContext) formData.append('agentContext', data.agentContext);
      for (const file of files) {
        formData.append('files', file);
      }
      fromDocsMutation.mutate(formData);
    } else {
      fromQuestionsMutation.mutate({ answers: data.answers });
    }
  });

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Crea nuova identità</h1>
        <p className="text-sm text-gray-500 mt-0.5">Wizard in 2 step</p>
      </div>

      {/* Stepper */}
      <div className="flex justify-center overflow-x-auto pb-2">
        <WizardStepper current={step} />
      </div>

      {/* Form */}
      <FormProvider {...methods}>
        <form onSubmit={(e) => e.preventDefault()}>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-h-[360px]">
            {step === 1 && <Step1BaseInfo />}
            {step === 2 && mode === 'documents' && (
              <Step2Documents files={files} onFilesChange={setFiles} />
            )}
            {step === 2 && mode === 'questions' && <Step2Questions />}
          </div>

          {submitError && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {submitError.message || "Errore nella creazione dell'identità. Riprova."}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between mt-4">
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              {step === 1 ? 'Annulla' : 'Indietro'}
            </button>

            {step === 1 ? (
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
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || (mode === 'documents' && files.length === 0)}
                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {isSubmitting ? 'Creazione...' : 'Genera identità'}
              </button>
            )}
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
