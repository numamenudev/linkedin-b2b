/**
 * Step 1 — Identity selection.
 *
 * The user picks which LinkedIn identity (account) the new agent will use.
 * If no identity exists yet, a link navigates to /identities/new.
 *
 * Form field: identityId (required)
 */

import { useFormContext } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle, User } from 'lucide-react';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Identity type (minimal)
// ---------------------------------------------------------------------------

interface Identity {
  id: string;
  name: string;
  linkedinEmail?: string;
  status?: string;
}

// ---------------------------------------------------------------------------
// Wizard form shape (partial — only fields relevant to this step)
// ---------------------------------------------------------------------------

interface WizardFormValues {
  identityId: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Step1Identity() {
  const {
    register,
    formState: { errors },
  } = useFormContext<WizardFormValues>();

  const { data: identities, isLoading } = useQuery<Identity[]>({
    queryKey: ['identities'],
    queryFn: () => api.get<Identity[]>('/identities'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Seleziona identità
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Scegli l&apos;account LinkedIn che questo agente utilizzerà per le
          operazioni di outreach.
        </p>
      </div>

      {/* Identity selector */}
      <div>
        <label
          htmlFor="identityId"
          className="mb-1.5 block text-sm font-medium text-gray-700"
        >
          Account LinkedIn *
        </label>

        {isLoading ? (
          <div className="h-10 w-full animate-pulse rounded-lg bg-gray-100" />
        ) : identities && identities.length > 0 ? (
          <select
            id="identityId"
            {...register('identityId', {
              required: 'Seleziona un&apos;identità',
            })}
            className={clsx(
              'w-full rounded-lg border px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500',
              errors.identityId
                ? 'border-red-300 bg-red-50'
                : 'border-gray-300 bg-white',
            )}
          >
            <option value="">— Seleziona identità —</option>
            {identities.map((identity) => (
              <option key={identity.id} value={identity.id}>
                {identity.name}
                {identity.linkedinEmail ? ` (${identity.linkedinEmail})` : ''}
                {identity.status === 'pending' ? ' — in attesa di approvazione' : ''}
              </option>
            ))}
          </select>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <User className="mx-auto mb-2 h-8 w-8 text-gray-400" />
            <p className="text-sm text-gray-600">
              Nessuna identità configurata.
            </p>
          </div>
        )}

        {errors.identityId && (
          <p className="mt-1 text-xs text-red-600">
            {errors.identityId.message as string}
          </p>
        )}
      </div>

      {/* Link to create identity */}
      <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-3">
        <PlusCircle className="h-4 w-4 shrink-0 text-indigo-600" />
        <p className="text-sm text-gray-700">
          Non hai ancora un&apos;identità?{' '}
          <Link
            to="/identities/new"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-600 underline hover:text-indigo-800"
          >
            Crea nuova identità
          </Link>{' '}
          (si aprirà in una nuova scheda).
        </p>
      </div>

      {/* Helper info */}
      <div className="rounded-lg bg-blue-50 px-4 py-3 text-xs text-blue-700">
        <strong>Nota:</strong> ogni identità corrisponde a un account LinkedIn
        separato. Un&apos;identità può essere assegnata a più agenti ma la
        piattaforma rispetta il limite combinato di 21 inviti/giorno per
        account.
      </div>
    </div>
  );
}

export default Step1Identity;
