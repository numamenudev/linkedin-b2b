import { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ArrowLeft, Play, Pause, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAgent } from '@/hooks/useAgents';
import { useProspects } from '@/hooks/useProspects';
import { formatDate } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Extended types
// ---------------------------------------------------------------------------
interface AgentStats {
  acceptedConnections: number;
  sentConnections: number;
  repliedProspects: number;
  totalProspects: number;
  messagedProspects: number;
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------
type TabId = 'overview' | 'prospects' | 'searches' | 'config' | 'logs';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',   label: 'Panoramica' },
  { id: 'prospects',  label: 'Prospect' },
  { id: 'searches',   label: 'Strutture Ricerca' },
  { id: 'config',     label: 'Configurazione' },
  { id: 'logs',       label: 'Log' },
];

// ---------------------------------------------------------------------------
// Tab: Overview
// ---------------------------------------------------------------------------
function OverviewTab({ agentId, stats }: { agentId: string; stats?: AgentStats }) {
  const funnelData = [
    { name: 'Trovati',      value: stats?.totalProspects ?? 0 },
    { name: 'Contattati',  value: stats?.sentConnections ?? 0 },
    { name: 'Connessi',    value: stats?.acceptedConnections ?? 0 },
    { name: 'Messaggiati', value: stats?.messagedProspects ?? 0 },
    { name: 'Risposta',    value: stats?.repliedProspects ?? 0 },
  ];

  const { data: trend = [] } = useQuery<{ date: string; acceptanceRate: number }[]>({
    queryKey: ['agents', agentId, 'trend'],
    queryFn: () =>
      api.get<{ date: string; acceptanceRate: number }[]>(
        `/analytics/agents/${agentId}/trend?period=30`,
      ),
  });

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Prospect totali',  value: stats?.totalProspects ?? 0 },
          { label: 'Connessioni inv.',  value: stats?.sentConnections ?? 0 },
          { label: 'Accettate',         value: stats?.acceptedConnections ?? 0 },
          { label: 'Risposte',          value: stats?.repliedProspects ?? 0 },
        ].map(s => (
          <div key={s.label} className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Funnel prospect</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={funnelData} layout="vertical" margin={{ left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
            <Tooltip />
            <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Trend */}
      {trend.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Acceptance rate (30gg)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="acceptanceRate"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Prospects
// ---------------------------------------------------------------------------
function ProspectsTab({ agentId }: { agentId: string }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const navigate = useNavigate();

  const { data, isLoading } = useProspects({
    agentId,
    search: search || undefined,
    status: (statusFilter || undefined) as any,
  });

  const prospects = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Cerca prospect..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Tutti i status</option>
          <option value="new">Nuovo</option>
          <option value="contacted">Contattato</option>
          <option value="accepted">Connesso</option>
          <option value="responded">Risposta</option>
          <option value="converted">Convertito</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Nome', 'Headline', 'Status', 'Connesso il', 'Ultimo msg'].map(h => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {prospects.map(p => (
                <tr
                  key={p.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/prospects/${p.id}`)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {p.firstName} {p.lastName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{p.headline ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {p.acceptedAt ? formatDate(p.acceptedAt) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {p.updatedAt ? formatDate(p.updatedAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {prospects.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Nessun prospect trovato.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Search Structures
// ---------------------------------------------------------------------------
interface SearchStructure {
  id: string;
  query?: string;
  name?: string;
  location?: string;
  totalFound?: number;
}

function SearchesTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();

  const { data: searches = [], isLoading } = useQuery<SearchStructure[]>({
    queryKey: ['agents', agentId, 'searches'],
    queryFn: () => api.get<SearchStructure[]>(`/agents/${agentId}/searches`),
  });

  const runMutation = useMutation({
    mutationFn: (searchId: string) => api.post(`/agents/${agentId}/searches/${searchId}/run`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'searches'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (searchId: string) => api.del(`/agents/${agentId}/searches/${searchId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'searches'] }),
  });

  if (isLoading) return <div className="h-32 bg-gray-100 rounded animate-pulse" />;

  return (
    <div className="space-y-3">
      {searches.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">
          Nessuna struttura di ricerca configurata.
        </p>
      ) : (
        searches.map(s => (
          <div
            key={s.id}
            className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 text-sm">{s.query ?? s.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {s.location ?? ''}{s.location ? ' · ' : ''}{s.totalFound ?? 0} trovati
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => runMutation.mutate(s.id)}
                disabled={runMutation.isPending}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Esegui ora
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Eliminare questa struttura?')) deleteMutation.mutate(s.id);
                }}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Elimina
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Config
// ---------------------------------------------------------------------------
function ConfigTab({ agentId, agentName, agentDescription, agentDailyLimit }: {
  agentId: string;
  agentName: string;
  agentDescription?: string;
  agentDailyLimit?: number;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: agentName,
    description: agentDescription ?? '',
    dailyLimit: agentDailyLimit ?? 9,
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => api.put(`/agents/${agentId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4 max-w-lg">
      <h3 className="text-sm font-semibold text-gray-900">Configurazione agente</h3>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Nome</label>
        <input
          value={form.name}
          onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Descrizione</label>
        <textarea
          value={form.description}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Limite giornaliero richieste
        </label>
        <input
          type="number"
          min={1}
          max={21}
          value={form.dailyLimit}
          onChange={e => setForm(p => ({ ...p, dailyLimit: Number(e.target.value) }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <button
        onClick={() => updateMutation.mutate(form)}
        disabled={updateMutation.isPending}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors disabled:opacity-50"
      >
        {updateMutation.isPending ? 'Salvataggio...' : 'Salva modifiche'}
      </button>
      {updateMutation.isSuccess && (
        <p className="text-xs text-green-600">Configurazione aggiornata.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Logs
// ---------------------------------------------------------------------------
interface LogEntry {
  id: string;
  agentId?: string;
  level: string;
  job?: string;
  action: string;
  message: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

interface LogsResponse {
  data: LogEntry[];
  pagination: { limit: number; offset: number; total: number };
}

function LogsTab({ agentId }: { agentId: string }) {
  const [level, setLevel] = useState('');

  const { data, isLoading, isError } = useQuery<LogsResponse>({
    queryKey: ['logs', { agentId, level }],
    queryFn: () => {
      const qs = new URLSearchParams({ agentId, ...(level ? { level } : {}), limit: '100' }).toString();
      return api.get<LogsResponse>(`/logs?${qs}`);
    },
    refetchInterval: 10_000,
  });

  const logs = data?.data ?? [];

  const levelColors: Record<string, string> = {
    info:  'text-blue-400',
    warn:  'text-yellow-400',
    error: 'text-red-400',
    debug: 'text-gray-500',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <select
            value={level}
            onChange={e => setLevel(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Tutti i livelli</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
        </div>
        {data?.pagination && (
          <span className="text-xs text-gray-400">{data.pagination.total} log totali</span>
        )}
      </div>

      {isError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          Errore nel caricamento dei log.
        </div>
      )}

      <div className="bg-gray-900 rounded-xl p-4 h-96 overflow-y-auto font-mono text-xs space-y-1">
        {isLoading && <p className="text-gray-400">Caricamento log...</p>}
        {!isLoading && logs.length === 0 && (
          <p className="text-gray-400">Nessun log trovato.</p>
        )}
        {logs.map(log => (
          <div key={log.id} className="flex gap-3">
            <span className="text-gray-500 flex-shrink-0">{formatDate(log.createdAt)}</span>
            <span className={`${levelColors[log.level] ?? 'text-gray-300'} flex-shrink-0 uppercase w-12`}>
              [{log.level}]
            </span>
            {log.job && (
              <span className="text-indigo-400 flex-shrink-0">[{log.job}]</span>
            )}
            <span className="text-gray-300">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentDetail Page
// ---------------------------------------------------------------------------
export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const initialTab = (location.state as { tab?: TabId } | null)?.tab ?? 'overview';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const { data: agent, isLoading, isError } = useAgent(id ?? '');

  const toggleMutation = useMutation({
    mutationFn: () => {
      const action = agent?.status === 'active' ? 'pause' : 'activate';
      return api.post(`/agents/${id}/${action}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.del(`/agents/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
      navigate('/dashboard');
    },
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (isError || !agent) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 text-sm">Agente non trovato.</p>
        <button
          onClick={() => navigate('/agents')}
          className="mt-2 text-indigo-600 text-sm hover:underline"
        >
          Torna agli agenti
        </button>
      </div>
    );
  }

  const statusBadgeStyle =
    agent.status === 'active'
      ? 'bg-green-100 text-green-800'
      : agent.status === 'paused'
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-gray-100 text-gray-500';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/agents')}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{agent.name}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadgeStyle}`}>
                {agent.status}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending || agent.status === 'archived'}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              agent.status === 'active'
                ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            } disabled:opacity-50`}
          >
            {agent.status === 'active' ? (
              <><Pause className="h-4 w-4" />Pausa</>
            ) : (
              <><Play className="h-4 w-4" />Attiva</>
            )}
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Modifica
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Eliminare l'agente "${agent.name}"? Questa azione non è reversibile.`)) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Elimina
          </button>
        </div>
      </div>

      {/* Mutation errors */}
      {toggleMutation.isError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {toggleMutation.error?.message || "Errore nell'attivazione dell'agente."}
        </div>
      )}
      {deleteMutation.isError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {deleteMutation.error?.message || "Errore nell'eliminazione dell'agente."}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px">
          {TABS.map(tab => (
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
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview'  && <OverviewTab agentId={id!} stats={undefined} />}
        {activeTab === 'prospects' && <ProspectsTab agentId={id!} />}
        {activeTab === 'searches'  && <SearchesTab agentId={id!} />}
        {activeTab === 'config'    && (
          <ConfigTab agentId={id!} agentName={agent.name} agentDescription={(agent as any).description} agentDailyLimit={agent.dailyLimit} />
        )}
        {activeTab === 'logs'      && <LogsTab agentId={id!} />}
      </div>
    </div>
  );
}
