import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, Pause, Play, Pencil, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { useAgents, type Agent } from '@/hooks/useAgents';

// ---------------------------------------------------------------------------
// Extended agent type (includes fields from actual API)
// ---------------------------------------------------------------------------
interface AgentWithStats extends Agent {
  description?: string;
  stats?: {
    acceptedConnections: number;
    sentConnections: number;
    repliedProspects: number;
    totalProspects: number;
  };
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:   'bg-green-100 text-green-800',
    paused:   'bg-yellow-100 text-yellow-800',
    archived: 'bg-gray-100 text-gray-500',
    error:    'bg-red-100 text-red-700',
    draft:    'bg-gray-100 text-gray-500',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        styles[status] ?? 'bg-gray-100 text-gray-500'
      }`}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Agent Card
// ---------------------------------------------------------------------------
function AgentCard({ agent }: { agent: AgentWithStats }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const acceptanceRate = agent.stats
    ? Math.round((agent.stats.acceptedConnections / Math.max(agent.stats.sentConnections, 1)) * 100)
    : 0;
  const responseRate = agent.stats
    ? Math.round((agent.stats.repliedProspects / Math.max(agent.stats.acceptedConnections, 1)) * 100)
    : 0;

  const toggleMutation = useMutation({
    mutationFn: () => {
      const action = agent.status === 'active' ? 'pause' : 'activate';
      return api.post(`/agents/${agent.id}/${action}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">{agent.name}</h3>
          {agent.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{agent.description}</p>
          )}
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="bg-gray-50 rounded-lg py-2">
          <p className="font-bold text-gray-900">{agent.stats?.totalProspects ?? 0}</p>
          <p className="text-xs text-gray-500">Prospect</p>
        </div>
        <div className="bg-gray-50 rounded-lg py-2">
          <p className="font-bold text-gray-900">{acceptanceRate}%</p>
          <p className="text-xs text-gray-500">Accettazione</p>
        </div>
        <div className="bg-gray-50 rounded-lg py-2">
          <p className="font-bold text-gray-900">{responseRate}%</p>
          <p className="text-xs text-gray-500">Risposta</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending || agent.status === 'archived'}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            agent.status === 'active'
              ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
              : 'bg-green-50 text-green-700 hover:bg-green-100'
          } disabled:opacity-50`}
          title={agent.status === 'active' ? 'Metti in pausa' : 'Attiva'}
        >
          {agent.status === 'active' ? (
            <><Pause className="h-3.5 w-3.5" />Pausa</>
          ) : (
            <><Play className="h-3.5 w-3.5" />Attiva</>
          )}
        </button>
        <button
          onClick={() => navigate(`/agents/${agent.id}/edit`)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors font-medium"
        >
          <Pencil className="h-3.5 w-3.5" />
          Modifica
        </button>
        <button
          onClick={() => navigate(`/agents/${agent.id}`)}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors font-medium"
        >
          <Eye className="h-3.5 w-3.5" />
          Dettaglio
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentsList Page
// ---------------------------------------------------------------------------
type StatusFilter = 'all' | 'active' | 'paused' | 'archived' | 'draft';

export default function AgentsList() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: agents = [], isLoading } = useAgents();

  const filtered: AgentWithStats[] = (statusFilter === 'all'
    ? agents
    : agents.filter(a => a.status === statusFilter)) as AgentWithStats[];

  const filterButtons: { label: string; value: StatusFilter }[] = [
    { label: 'Tutti',      value: 'all' },
    { label: 'Attivi',     value: 'active' },
    { label: 'In pausa',   value: 'paused' },
    { label: 'Archiviati', value: 'archived' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenti</h1>
          <p className="text-sm text-gray-500 mt-0.5">{agents.length} agenti configurati</p>
        </div>
        <button
          onClick={() => navigate('/agents/new')}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm shadow-sm"
        >
          <PlusCircle className="h-4 w-4" />
          Crea nuovo agente
        </button>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap">
        {filterButtons.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-gray-100 rounded-xl h-48 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <p className="text-gray-500 text-sm">
            {statusFilter === 'all'
              ? 'Nessun agente trovato. Creane uno!'
              : `Nessun agente con status "${statusFilter}".`}
          </p>
          {statusFilter === 'all' && (
            <button
              onClick={() => navigate('/agents/new')}
              className="mt-3 text-indigo-600 text-sm hover:underline"
            >
              Crea il primo agente
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
