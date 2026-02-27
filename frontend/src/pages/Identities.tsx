import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldX, RefreshCw, Users, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface Identity {
  id: string;
  name: string;
  personaName: string;
  role: string;
  company: string;
  location?: string;
  version: number;
  approvedByUser: boolean;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
  _count?: { documents: number; agents: number };
}

export default function IdentitiesPage() {
  const queryClient = useQueryClient();

  const { data: identities = [], isLoading } = useQuery<Identity[]>({
    queryKey: ['identities'],
    queryFn: () => api.get<Identity[]>('/identities'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/identities/${id}/approve`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['identities'] });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/identities/${id}/regenerate`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['identities'] });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Identità</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gestisci le identità usate dagli agenti. Un'identità deve essere approvata prima di poter attivare l'agente associato.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : identities.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">Nessuna identità trovata.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {identities.map(identity => (
            <div
              key={identity.id}
              className="bg-white rounded-xl border border-gray-100 p-5 flex items-start justify-between gap-4"
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-semibold text-gray-900">{identity.name}</h3>
                  {identity.approvedByUser ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      <ShieldCheck className="h-3 w-3" />
                      Approvata
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                      <ShieldX className="h-3 w-3" />
                      Da approvare
                    </span>
                  )}
                  <span className="text-xs text-gray-400">v{identity.version}</span>
                </div>

                <p className="text-sm text-gray-600 mt-1">
                  {identity.personaName} — {identity.role} @ {identity.company}
                  {identity.location && <span className="text-gray-400"> · {identity.location}</span>}
                </p>

                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  {identity._count && (
                    <>
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {identity._count.documents} doc
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {identity._count.agents} agenti
                      </span>
                    </>
                  )}
                  <span>Creata {formatDate(identity.createdAt)}</span>
                  {identity.approvedAt && (
                    <span>Approvata {formatDate(identity.approvedAt)}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-shrink-0">
                {!identity.approvedByUser && (
                  <button
                    onClick={() => approveMutation.mutate(identity.id)}
                    disabled={approveMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors disabled:opacity-50"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Approva
                  </button>
                )}
                <button
                  onClick={() => {
                    if (window.confirm('Rigenerare questa identità? L\'approvazione verrà resettata.')) {
                      regenerateMutation.mutate(identity.id);
                    }
                  }}
                  disabled={regenerateMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 text-gray-700 text-sm font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Rigenera
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error display */}
      {approveMutation.isError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {approveMutation.error?.message || "Errore nell'approvazione."}
        </div>
      )}
    </div>
  );
}
