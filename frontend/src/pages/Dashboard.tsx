import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle, Users, CheckCircle2, MessageSquare, Reply } from 'lucide-react';
import { api } from '@/lib/api';
import { buildQueryString } from '@/lib/utils';
import { type Agent } from '@/hooks/useAgents';
import { type Prospect } from '@/hooks/useProspects';

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------
interface KpiCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

function KpiCard({ label, value, icon, color }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Status Badge (inline, self-contained)
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:   'bg-green-100 text-green-800',
    paused:   'bg-yellow-100 text-yellow-800',
    archived: 'bg-gray-100 text-gray-600',
    error:    'bg-red-100 text-red-700',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        map[status] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mini Agent Card
// ---------------------------------------------------------------------------
interface AgentStats {
  acceptedConnections: number;
  sentConnections: number;
  repliedProspects: number;
  totalProspects: number;
  messagedProspects: number;
  sentToday: number;
}

interface AgentWithStats extends Agent {
  description?: string;
  stats?: AgentStats;
  dailyConnectionRequests?: number;
}

function AgentCard({ agent }: { agent: AgentWithStats }) {
  const navigate = useNavigate();
  const acceptanceRate = agent.stats
    ? Math.round((agent.stats.acceptedConnections / Math.max(agent.stats.sentConnections, 1)) * 100)
    : 0;
  const responseRate = agent.stats
    ? Math.round((agent.stats.repliedProspects / Math.max(agent.stats.acceptedConnections, 1)) * 100)
    : 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 text-base">{agent.name}</h3>
        <StatusBadge status={agent.status} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
        <div>
          <span className="font-medium text-gray-900">{agent.stats?.totalProspects ?? 0}</span>
          <span className="ml-1">prospect</span>
        </div>
        <div>
          <span className="font-medium text-gray-900">{acceptanceRate}%</span>
          <span className="ml-1">accettazione</span>
        </div>
        <div>
          <span className="font-medium text-gray-900">{responseRate}%</span>
          <span className="ml-1">risposta</span>
        </div>
        <div>
          <span className="font-medium text-gray-900">{agent.stats?.sentToday ?? 0}</span>
          <span className="ml-1">oggi</span>
        </div>
      </div>
      <div className="flex gap-2 mt-1">
        <button
          onClick={() => navigate(`/agents/${agent.id}`)}
          className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors font-medium"
        >
          Dettaglio
        </button>
        <button
          onClick={() => navigate(`/agents/${agent.id}/edit`)}
          className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors font-medium"
        >
          Modifica
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Responses row
// ---------------------------------------------------------------------------
interface ProspectWithAgent extends Prospect {
  agentName?: string;
  messages?: { content?: string; id: string }[];
}

function ResponseRow({ prospect }: { prospect: ProspectWithAgent }) {
  const navigate = useNavigate();
  const lastMsg = prospect.messages?.[0];
  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-100 last:border-0">
      <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
        {prospect.firstName?.charAt(0) ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm truncate">
          {prospect.firstName} {prospect.lastName}
        </p>
        <p className="text-xs text-gray-500 truncate">{prospect.agentName ?? '—'}</p>
        {lastMsg && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{lastMsg.content?.slice(0, 80)}…</p>
        )}
      </div>
      <button
        onClick={() => navigate(`/prospects/${prospect.id}`)}
        className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors font-medium flex-shrink-0"
      >
        Apri
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------
interface DashboardKpis {
  sentToday: number;
  acceptedToday: number;
  messagesToday: number;
  repliesToday: number;
}

interface PaginatedProspects {
  data: ProspectWithAgent[];
  total: number;
}

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: agents = [], isLoading: agentsLoading } = useQuery<AgentWithStats[]>({
    queryKey: ['agents'],
    queryFn: () => api.get<AgentWithStats[]>('/agents'),
  });

  const { data: kpis } = useQuery<DashboardKpis>({
    queryKey: ['dashboard', 'kpis'],
    queryFn: () => api.get<DashboardKpis>('/analytics/kpis?period=today'),
  });

  const { data: responsesResult } = useQuery<PaginatedProspects>({
    queryKey: ['prospects', 'responses', 'recent'],
    queryFn: () =>
      api.get<PaginatedProspects>(`/prospects${buildQueryString({ status: 'responded', pageSize: 10 })}`),
  });

  const recentResponses: ProspectWithAgent[] = responsesResult?.data ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Panoramica della piattaforma di outreach</p>
        </div>
        <button
          onClick={() => navigate('/agents/new')}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm shadow-sm"
        >
          <PlusCircle className="h-4 w-4" />
          Nuovo agente
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Richieste inviate oggi"
          value={kpis?.sentToday ?? 0}
          icon={<Users className="h-5 w-5 text-indigo-600" />}
          color="bg-indigo-50"
        />
        <KpiCard
          label="Connessioni accettate"
          value={kpis?.acceptedToday ?? 0}
          icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
          color="bg-green-50"
        />
        <KpiCard
          label="Messaggi inviati"
          value={kpis?.messagesToday ?? 0}
          icon={<MessageSquare className="h-5 w-5 text-blue-600" />}
          color="bg-blue-50"
        />
        <KpiCard
          label="Risposte ricevute"
          value={kpis?.repliesToday ?? 0}
          icon={<Reply className="h-5 w-5 text-purple-600" />}
          color="bg-purple-50"
        />
      </div>

      {/* Agents Grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Agenti attivi</h2>
        {agentsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-100 rounded-xl h-40 animate-pulse" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
            <p className="text-gray-500 text-sm">Nessun agente configurato.</p>
            <button
              onClick={() => navigate('/agents/new')}
              className="mt-3 text-indigo-600 text-sm hover:underline"
            >
              Crea il primo agente
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map(agent => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>

      {/* Recent Responses */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Risposte ricevute</h2>
        <p className="text-xs text-gray-500 mb-4">Prospect che hanno risposto ai tuoi messaggi</p>
        {recentResponses.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            Nessuna risposta ricevuta di recente.
          </p>
        ) : (
          <div>
            {recentResponses.map(p => (
              <ResponseRow key={p.id} prospect={p} />
            ))}
            <button
              onClick={() => navigate('/prospects?status=responded')}
              className="mt-3 text-indigo-600 text-sm hover:underline"
            >
              Vedi tutte le risposte
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
