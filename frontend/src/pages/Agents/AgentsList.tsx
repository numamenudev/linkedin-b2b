/**
 * AgentsList — dedicated page for listing and managing all agents.
 *
 * Route: /agents
 *
 * Features:
 *  - Header with title + "New agent" button
 *  - Status filters (all / active / paused / archived)
 *  - Grid of agent cards with basic info from the list endpoint
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, Pause, Play, ArrowRight } from 'lucide-react';
import { useAgents, useToggleAgent, type Agent } from '@/hooks/useAgents';
import { AgentStatusBadge } from '@/components/agents/AgentStatusBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | 'active' | 'paused' | 'archived';

// ---------------------------------------------------------------------------
// Simple Agent Card for the list — uses data already in the agents list
// ---------------------------------------------------------------------------

function AgentListCard({ agent }: { agent: Agent }) {
  const navigate = useNavigate();
  const toggleMutation = useToggleAgent();
  const canToggle = agent.status === 'active' || agent.status === 'paused';

  // The list endpoint returns _count.prospects
  const prospectCount = agent._count?.prospects ?? 0;

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => navigate(`/agents/${agent.id}`)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{agent.name}</h3>
          {agent.identityName && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{agent.identityName}</p>
          )}
          {!agent.identityName && agent.identity?.name && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{agent.identity.name}</p>
          )}
        </div>
        <AgentStatusBadge status={agent.status} className="shrink-0" />
      </div>

      {/* Metrics from list data */}
      <div className="grid grid-cols-2 gap-3 text-center text-sm">
        <div className="bg-gray-50 rounded-lg py-2">
          <p className="font-bold text-gray-900">{prospectCount}</p>
          <p className="text-xs text-gray-500">Prospect</p>
        </div>
        <div className="bg-gray-50 rounded-lg py-2">
          <p className="font-bold text-gray-900">{agent.dailyLimit ?? '—'}</p>
          <p className="text-xs text-gray-500">Limite/giorno</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        {canToggle && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleMutation.mutate({
                id: agent.id,
                action: agent.status === 'active' ? 'pause' : 'activate',
              });
            }}
            disabled={toggleMutation.isPending}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              agent.status === 'active'
                ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            } disabled:opacity-50`}
          >
            {agent.status === 'active' ? (
              <><Pause className="h-3.5 w-3.5" />Pausa</>
            ) : (
              <><Play className="h-3.5 w-3.5" />Attiva</>
            )}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/agents/${agent.id}`);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors font-medium"
        >
          Dettaglio
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentsList Page
// ---------------------------------------------------------------------------

export default function AgentsList() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: agents = [], isLoading } = useAgents();

  const filtered = statusFilter === 'all'
    ? agents
    : agents.filter((a) => (a.status as string) === statusFilter);

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
          <p className="text-sm text-gray-500 mt-0.5">
            Gestisci i tuoi agenti di outreach LinkedIn
          </p>
        </div>
        <button
          onClick={() => navigate('/agents/new')}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm shadow-sm"
        >
          <PlusCircle className="h-4 w-4" />
          Nuovo agente
        </button>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap">
        {filterButtons.map((f) => (
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
        <span className="ml-auto text-sm text-gray-400 self-center">
          {filtered.length} {filtered.length === 1 ? 'agente' : 'agenti'}
        </span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-100 rounded-xl h-48 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <p className="text-gray-500 text-sm">
            {statusFilter === 'all'
              ? 'Nessun agente configurato.'
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
          {filtered.map((agent) => (
            <AgentListCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
