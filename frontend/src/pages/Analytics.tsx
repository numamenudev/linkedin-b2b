import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Users, MessageSquare, Reply } from 'lucide-react';
import { api } from '@/lib/api';
import { useAgents } from '@/hooks/useAgents';
import { buildQueryString } from '@/lib/utils';

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------
interface KpiCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  sublabel?: string;
}

function KpiCard({ label, value, icon, color, sublabel }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sublabel && <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pie chart colors
// ---------------------------------------------------------------------------
const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// ---------------------------------------------------------------------------
// Analytics types
// ---------------------------------------------------------------------------
interface AnalyticsKpis {
  totalProspects: number;
  acceptanceRate: number;
  acceptedConnections: number;
  sentConnections: number;
  totalMessages: number;
  responseRate: number;
  replies: number;
}

interface TrendPoint  { date: string; acceptanceRate: number }
interface ActivityPoint { date: string; connections: number; messages: number }
interface FunnelPoint   { stage: string; count: number }
interface StatusPoint   { status: string; count: number }
interface TopSearch {
  query: string;
  agentName: string;
  totalFound: number;
  acceptanceRate: number;
  responseRate: number;
}

// ---------------------------------------------------------------------------
// Analytics Page
// ---------------------------------------------------------------------------
type Period = 7 | 30 | 90;

export default function Analytics() {
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [period, setPeriod] = useState<Period>(30);

  const { data: agents = [] } = useAgents();

  const params = { agentId: selectedAgentId || undefined, period };
  const qs = buildQueryString(params as Record<string, unknown>);

  const { data: kpis } = useQuery<AnalyticsKpis>({
    queryKey: ['analytics', 'kpis', selectedAgentId, period],
    queryFn: () => api.get<AnalyticsKpis>(`/analytics/kpis${qs}`),
  });

  const { data: acceptanceTrend = [] } = useQuery<TrendPoint[]>({
    queryKey: ['analytics', 'acceptance-trend', selectedAgentId, period],
    queryFn: () => api.get<TrendPoint[]>(`/analytics/acceptance-trend${qs}`),
  });

  const { data: dailyActivity = [] } = useQuery<ActivityPoint[]>({
    queryKey: ['analytics', 'daily-activity', selectedAgentId, period],
    queryFn: () => api.get<ActivityPoint[]>(`/analytics/daily-activity${qs}`),
  });

  const { data: funnelData = [] } = useQuery<FunnelPoint[]>({
    queryKey: ['analytics', 'funnel', selectedAgentId, period],
    queryFn: () => api.get<FunnelPoint[]>(`/analytics/funnel${qs}`),
  });

  const { data: statusDistribution = [] } = useQuery<StatusPoint[]>({
    queryKey: ['analytics', 'status-distribution', selectedAgentId, period],
    queryFn: () => api.get<StatusPoint[]>(`/analytics/status-distribution${qs}`),
  });

  const { data: topSearches = [] } = useQuery<TopSearch[]>({
    queryKey: ['analytics', 'top-searches', selectedAgentId, period],
    queryFn: () => api.get<TopSearch[]>(`/analytics/top-searches${qs}`),
  });

  const periodLabels: Record<Period, string> = {
    7:  '7 giorni',
    30: '30 giorni',
    90: '90 giorni',
  };

  function EmptyChart() {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-gray-400">
        Nessun dato disponibile.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header + selectors */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Performance e statistiche di outreach</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Agent selector */}
          <select
            value={selectedAgentId}
            onChange={e => setSelectedAgentId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">Tutti gli agenti</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          {/* Period selector */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {([7, 30, 90] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  period === p
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Prospect totali"
          value={kpis?.totalProspects ?? 0}
          icon={<Users className="h-5 w-5 text-indigo-600" />}
          color="bg-indigo-50"
        />
        <KpiCard
          label="Acceptance rate"
          value={`${kpis?.acceptanceRate ?? 0}%`}
          icon={<TrendingUp className="h-5 w-5 text-green-600" />}
          color="bg-green-50"
          sublabel={`${kpis?.acceptedConnections ?? 0} / ${kpis?.sentConnections ?? 0}`}
        />
        <KpiCard
          label="Messaggi inviati"
          value={kpis?.totalMessages ?? 0}
          icon={<MessageSquare className="h-5 w-5 text-blue-600" />}
          color="bg-blue-50"
        />
        <KpiCard
          label="Response rate"
          value={`${kpis?.responseRate ?? 0}%`}
          icon={<Reply className="h-5 w-5 text-purple-600" />}
          color="bg-purple-50"
          sublabel={`${kpis?.replies ?? 0} risposte`}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line: Acceptance rate nel tempo */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Acceptance rate nel tempo</h3>
          {acceptanceTrend.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={acceptanceTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="%" />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Acceptance rate']} />
                <Line
                  type="monotone"
                  dataKey="acceptanceRate"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bar: Attività giornaliera */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Attività giornaliera</h3>
          {dailyActivity.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyActivity}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="connections" name="Connessioni" fill="#6366f1" radius={[2, 2, 0, 0]} />
                <Bar dataKey="messages" name="Messaggi" fill="#22c55e" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel — horizontal bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Funnel prospect</h3>
          {funnelData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 70 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="stage" type="category" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie: Status distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Distribuzione status</h3>
          {statusDistribution.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ status, percent }: { status: string; percent: number }) =>
                    `${status} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {statusDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top search structures */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Top strutture di ricerca</h3>
        {topSearches.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Nessun dato disponibile.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr>
                  {['Query', 'Agente', 'Prospect trovati', 'Acceptance %', 'Response %'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topSearches.map((s, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-sm text-gray-900">{s.query}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-500">{s.agentName}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-900 font-medium">{s.totalFound}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-medium text-green-700">{s.acceptanceRate}%</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-medium text-indigo-700">{s.responseRate}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
