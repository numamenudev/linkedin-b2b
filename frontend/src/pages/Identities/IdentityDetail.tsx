import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ShieldCheck,
  ShieldX,
  RefreshCw,
  Pencil,
  Save,
  X,
  Upload,
  Trash2,
  FileText,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IdentityDocument {
  id: string;
  identityId: string;
  filename: string;
  originalName: string;
  fileType: string;
  extractionStatus: string;
  createdAt: string;
}

interface LinkedAgent {
  id: string;
  name: string;
  status: string;
}

interface IdentityDetail {
  id: string;
  name: string;
  personaName: string;
  role: string;
  company: string;
  location?: string;
  fullContextPrompt: string;
  toneProfile: Record<string, unknown>;
  companyContext: Record<string, unknown>;
  credibilityMarkers: unknown;
  doNotSay: unknown;
  version: number;
  approvedByUser: boolean;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
  documents: IdentityDocument[];
  agents: LinkedAgent[];
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId = 'overview' | 'documents' | 'agents';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Panoramica' },
  { id: 'documents', label: 'Documenti' },
  { id: 'agents', label: 'Agenti' },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXTRACTION_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
};

const AGENT_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  draft: 'bg-gray-100 text-gray-500',
};

// ---------------------------------------------------------------------------
// Tab: Overview (with inline edit)
// ---------------------------------------------------------------------------

function OverviewTab({
  identity,
  onUpdated,
}: {
  identity: IdentityDetail;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: identity.name,
    personaName: identity.personaName,
    role: identity.role,
    company: identity.company,
    location: identity.location ?? '',
  });

  // Sync form state when identity data changes (e.g. after save + refetch)
  useEffect(() => {
    if (!editing) {
      setForm({
        name: identity.name,
        personaName: identity.personaName,
        role: identity.role,
        company: identity.company,
        location: identity.location ?? '',
      });
    }
  }, [identity, editing]);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.put(`/identities/${identity.id}`, data),
    onSuccess: () => {
      setEditing(false);
      onUpdated();
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      name: form.name,
      personaName: form.personaName,
      role: form.role,
      company: form.company,
      location: form.location || undefined,
    });
  };

  const handleCancel = () => {
    setForm({
      name: identity.name,
      personaName: identity.personaName,
      role: identity.role,
      company: identity.company,
      location: identity.location ?? '',
    });
    setEditing(false);
  };

  const fields: { key: keyof typeof form; label: string }[] = [
    { key: 'name', label: 'Nome interno' },
    { key: 'personaName', label: 'Nome persona' },
    { key: 'role', label: 'Ruolo' },
    { key: 'company', label: 'Azienda' },
    { key: 'location', label: 'Location' },
  ];

  const credibilityMarkers = Array.isArray(identity.credibilityMarkers)
    ? (identity.credibilityMarkers as string[])
    : [];
  const doNotSay = Array.isArray(identity.doNotSay)
    ? (identity.doNotSay as string[])
    : [];

  return (
    <div className="space-y-6">
      {/* Editable fields */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Informazioni</h3>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <Pencil className="h-3.5 w-3.5" />
              Modifica
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-medium"
              >
                <X className="h-3.5 w-3.5" />
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {updateMutation.isPending ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="grid grid-cols-2 gap-4">
            {fields.map((f) => (
              <div key={f.key} className={f.key === 'name' ? 'col-span-2' : ''}>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {f.label}
                </label>
                <input
                  value={form[f.key]}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ))}
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {fields.map((f) => (
              <div key={f.key} className={f.key === 'name' ? 'col-span-2' : ''}>
                <dt className="text-xs text-gray-500">{f.label}</dt>
                <dd className="text-sm font-medium text-gray-900 mt-0.5">
                  {identity[f.key] || '—'}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {updateMutation.isError && (
          <p className="text-xs text-red-600">
            {updateMutation.error?.message || "Errore nell'aggiornamento."}
          </p>
        )}
      </div>

      {/* Full context prompt */}
      {identity.fullContextPrompt && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Context prompt</h3>
          <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
            {identity.fullContextPrompt}
          </pre>
        </div>
      )}

      {/* Credibility markers + Do not say */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {credibilityMarkers.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Punti di forza</h3>
            <ul className="space-y-1">
              {credibilityMarkers.map((m, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">+</span>
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}
        {doNotSay.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Da evitare</h3>
            <ul className="space-y-1">
              {doNotSay.map((d, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">-</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span>Versione {identity.version}</span>
        <span>Creata {formatDate(identity.createdAt)}</span>
        <span>Aggiornata {formatDate(identity.updatedAt)}</span>
        {identity.approvedAt && <span>Approvata {formatDate(identity.approvedAt)}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Documents
// ---------------------------------------------------------------------------

function DocumentsTab({ identity, onUpdated }: { identity: IdentityDetail; onUpdated: () => void }) {
  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post(`/identities/${identity.id}/documents`, formData);
    },
    onSuccess: () => onUpdated(),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) =>
      api.del(`/identities/${identity.id}/documents/${docId}`),
    onSuccess: () => onUpdated(),
  });

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  return (
    <div className="space-y-4">
      {/* Upload button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {identity.documents.length} documento{identity.documents.length !== 1 ? 'i' : ''}
        </p>
        <label
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
            uploadMutation.isPending
              ? 'bg-gray-100 text-gray-400'
              : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
          }`}
        >
          <Upload className="h-4 w-4" />
          {uploadMutation.isPending ? 'Upload...' : 'Carica documento'}
          <input
            type="file"
            accept=".pdf,.pptx,.txt"
            onChange={handleFileInput}
            disabled={uploadMutation.isPending}
            className="hidden"
          />
        </label>
      </div>

      {/* Error display */}
      {uploadMutation.isError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {uploadMutation.error?.message || "Errore nell'upload."}
        </div>
      )}
      {deleteMutation.isError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {deleteMutation.error?.message || "Errore nell'eliminazione."}
        </div>
      )}

      {/* Document list */}
      {identity.documents.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Nessun documento caricato.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {identity.documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {doc.originalName}
                  </p>
                  <p className="text-xs text-gray-400">
                    {doc.fileType} · {formatDate(doc.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    EXTRACTION_COLORS[doc.extractionStatus] ?? 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {doc.extractionStatus}
                </span>
                <button
                  onClick={() => {
                    if (window.confirm(`Eliminare "${doc.originalName}"?`)) {
                      deleteMutation.mutate(doc.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Agents
// ---------------------------------------------------------------------------

function AgentsTab({ identity }: { identity: IdentityDetail }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      {identity.agents.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Nessun agente collegato a questa identità.</p>
        </div>
      ) : (
        identity.agents.map((agent) => (
          <div
            key={agent.id}
            onClick={() => navigate(`/agents/${agent.id}`)}
            className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <p className="text-sm font-medium text-gray-900">{agent.name}</p>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                AGENT_STATUS_COLORS[agent.status] ?? 'bg-gray-100 text-gray-500'
              }`}
            >
              {agent.status}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IdentityDetail Page
// ---------------------------------------------------------------------------

export default function IdentityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const {
    data: identity,
    isLoading,
    isError,
  } = useQuery<IdentityDetail>({
    queryKey: ['identities', id],
    queryFn: () => api.get<IdentityDetail>(`/identities/${id}`),
    enabled: !!id,
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/identities/${id}/approve`),
    onSuccess: () => invalidate(),
  });

  const regenerateMutation = useMutation({
    mutationFn: () => api.post(`/identities/${id}/regenerate`),
    onSuccess: () => invalidate(),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['identities', id] });
    void queryClient.invalidateQueries({ queryKey: ['identities'] });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (isError || !identity) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 text-sm">Identità non trovata.</p>
        <button
          onClick={() => navigate('/identities')}
          className="mt-2 text-indigo-600 text-sm hover:underline"
        >
          Torna alle identità
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/identities')}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{identity.name}</h1>
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
            <p className="text-sm text-gray-500 mt-0.5">
              {identity.personaName} — {identity.role} @ {identity.company}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {!identity.approvedByUser && (
            <button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              Approva
            </button>
          )}
          <button
            onClick={() => {
              if (
                window.confirm(
                  "Rigenerare questa identità? L'approvazione verrà resettata.",
                )
              ) {
                regenerateMutation.mutate();
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

      {/* Mutation errors */}
      {approveMutation.isError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {approveMutation.error?.message || "Errore nell'approvazione."}
        </div>
      )}
      {regenerateMutation.isError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {regenerateMutation.error?.message || 'Errore nella rigenerazione.'}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.id === 'documents' && (
                <span className="ml-1.5 text-xs text-gray-400">
                  ({identity.documents.length})
                </span>
              )}
              {tab.id === 'agents' && (
                <span className="ml-1.5 text-xs text-gray-400">
                  ({identity.agents.length})
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && (
          <OverviewTab identity={identity} onUpdated={invalidate} />
        )}
        {activeTab === 'documents' && (
          <DocumentsTab identity={identity} onUpdated={invalidate} />
        )}
        {activeTab === 'agents' && <AgentsTab identity={identity} />}
      </div>
    </div>
  );
}
