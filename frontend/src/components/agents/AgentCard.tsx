/**
 * AgentCard — card component for displaying agent info on the dashboard
 * and agent list page.
 *
 * Visual design:
 *  - Left border coloured by status (green=active, yellow=paused, grey=archived/error/draft)
 *  - Status badge with animated dot for active
 *  - Key metrics: acceptance rate, response rate, total prospects
 *  - Action buttons: Pause/Activate toggle, Detail link
 */

import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Pause, Play, ArrowRight, Users } from 'lucide-react';
import { AgentStatusBadge } from './AgentStatusBadge';
import { useToggleAgent, type Agent, type AgentStats } from '@/hooks/useAgents';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentCardProps {
  agent: Agent;
  stats?: AgentStats;
  /** Show compact variant (fewer metrics) */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Border colour by status
// ---------------------------------------------------------------------------

function getBorderColor(status: Agent['status']): string {
  switch (status) {
    case 'active':
      return 'border-l-green-500';
    case 'paused':
      return 'border-l-yellow-400';
    case 'error':
      return 'border-l-red-500';
    default:
      // draft, archived
      return 'border-l-gray-300';
  }
}

// ---------------------------------------------------------------------------
// Metric pill
// ---------------------------------------------------------------------------

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-lg font-bold text-gray-900">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentCard
// ---------------------------------------------------------------------------

export function AgentCard({ agent, stats, compact = false }: AgentCardProps) {
  const navigate = useNavigate();
  const toggleMutation = useToggleAgent();

  const canToggle = agent.status === 'active' || agent.status === 'paused';

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canToggle) return;
    const action = agent.status === 'active' ? 'pause' : 'activate';
    toggleMutation.mutate({ id: agent.id, action });
  };

  const handleDetail = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/agents/${agent.id}`);
  };

  const acceptanceRate = stats
    ? `${Math.round(stats.acceptanceRate)}%`
    : '—';
  const responseRate = stats
    ? `${Math.round(stats.responseRate)}%`
    : '—';
  const totalProspects = stats ? stats.totalProspects.toLocaleString('it-IT') : '—';

  return (
    <div
      role="article"
      aria-label={`Agente ${agent.name}`}
      onClick={() => navigate(`/agents/${agent.id}`)}
      className={clsx(
        'relative cursor-pointer rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md',
        'border-l-4',
        getBorderColor(agent.status),
      )}
    >
      <div className="p-5">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-gray-900">
              {agent.name}
            </h3>
            {agent.identityName && (
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {agent.identityName}
              </p>
            )}
          </div>
          <AgentStatusBadge status={agent.status} className="shrink-0" />
        </div>

        {/* Metrics */}
        {!compact && (
          <div className="mb-5 grid grid-cols-3 divide-x divide-gray-100 rounded-lg bg-gray-50 py-3">
            <Metric label="Acceptance" value={acceptanceRate} />
            <Metric label="Response" value={responseRate} />
            <Metric label="Prospect" value={totalProspects} />
          </div>
        )}

        {/* Limit info */}
        {compact && (
          <div className="mb-4 flex items-center gap-1.5 text-xs text-gray-500">
            <Users className="h-3.5 w-3.5" />
            <span>{totalProspects} prospect</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {/* Toggle pause/activate */}
          {canToggle && (
            <button
              onClick={handleToggle}
              disabled={toggleMutation.isPending}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50',
                agent.status === 'active'
                  ? 'border-yellow-200 bg-yellow-50 text-yellow-800 hover:bg-yellow-100'
                  : 'border-green-200 bg-green-50 text-green-800 hover:bg-green-100',
              )}
            >
              {agent.status === 'active' ? (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  Pausa
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Attiva
                </>
              )}
            </button>
          )}

          {/* Detail */}
          <button
            onClick={handleDetail}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Dettaglio
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default AgentCard;
