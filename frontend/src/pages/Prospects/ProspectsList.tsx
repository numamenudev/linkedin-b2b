import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Download, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAgents } from '@/hooks/useAgents';
import { useProspects, useExportProspects, type ProspectStatus } from '@/hooks/useProspects';
import { formatDate } from '@/lib/utils';
import ProspectDetail from './ProspectDetail';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function ProspectStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    new:          'bg-blue-100 text-blue-700',
    contacted:    'bg-yellow-100 text-yellow-700',
    accepted:     'bg-indigo-100 text-indigo-700',
    responded:    'bg-green-100 text-green-700',
    converted:    'bg-emerald-100 text-emerald-700',
    rejected:     'bg-red-100 text-red-600',
    opted_out:    'bg-red-100 text-red-600',
    blacklisted:  'bg-gray-200 text-gray-600',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        styles[status] ?? 'bg-gray-100 text-gray-500'
      }`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Score badge
// ---------------------------------------------------------------------------
function ScoreBadge({ score }: { score?: number | null }) {
  if (score === null || score === undefined) {
    return <span className="text-gray-400 text-xs">—</span>;
  }
  const color =
    score >= 70
      ? 'text-green-700 bg-green-50'
      : score >= 40
      ? 'text-yellow-700 bg-yellow-50'
      : 'text-red-700 bg-red-50';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${color}`}>
      {score}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
interface Filters {
  agentId: string;
  status: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  minScore: string;
}

const DEFAULT_FILTERS: Filters = {
  agentId: '',
  status: '',
  search: '',
  dateFrom: '',
  dateTo: '',
  minScore: '',
};

// ---------------------------------------------------------------------------
// ProspectsList Page
// ---------------------------------------------------------------------------
const PAGE_SIZE = 20;

export default function ProspectsList() {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<Filters>({
    ...DEFAULT_FILTERS,
    status: searchParams.get('status') ?? '',
  });
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const setFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const { data: agents = [] } = useAgents();

  const { data, isLoading } = useProspects({
    agentId: filters.agentId || undefined,
    status: (filters.status as ProspectStatus) || undefined,
    search: filters.search || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const exportProspects = useExportProspects({
    agentId: filters.agentId || undefined,
    status: (filters.status as ProspectStatus) || undefined,
  });

  const prospects = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-4 relative">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prospect</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} prospect totali</p>
        </div>
        <button
          onClick={() => exportProspects.mutate()}
          disabled={exportProspects.isPending}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {exportProspects.isPending ? 'Export...' : 'Export CSV'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Search */}
        <div className="col-span-2 sm:col-span-3 lg:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cerca nome..."
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Agent filter */}
        <select
          value={filters.agentId}
          onChange={e => setFilter('agentId', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Tutti gli agenti</option>
          {agents.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={filters.status}
          onChange={e => setFilter('status', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Tutti gli status</option>
          <option value="new">Nuovo</option>
          <option value="contacted">Contattato</option>
          <option value="accepted">Accettato</option>
          <option value="responded">Risposta</option>
          <option value="converted">Convertito</option>
          <option value="opted_out">Opt-out</option>
        </select>

        {/* Score min */}
        <input
          type="number"
          placeholder="Score min"
          min={0}
          max={100}
          value={filters.minScore}
          onChange={e => setFilter('minScore', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {/* Reset */}
        <button
          onClick={() => { setFilters(DEFAULT_FILTERS); setPage(1); }}
          className="flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>

      {/* Date filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Dal</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={e => setFilter('dateFrom', e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Al</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={e => setFilter('dateTo', e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Nome', 'Agente', 'Headline', 'Status', 'Connesso il', 'Ultimo agg.', 'Score'].map(h => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : prospects.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                      Nessun prospect trovato con i filtri selezionati.
                    </td>
                  </tr>
                )
                : prospects.map(p => (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`hover:bg-indigo-50 cursor-pointer transition-colors ${
                        selectedId === p.id ? 'bg-indigo-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {p.firstName} {p.lastName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {p.agentName ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                        {p.headline ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <ProspectStatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {p.acceptedAt ? formatDate(p.acceptedAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {p.updatedAt ? formatDate(p.updatedAt) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <ScoreBadge score={(p as any).score} />
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">
            {total > 0
              ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} di ${total}`
              : '0 risultati'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            </button>
            <span className="px-3 py-1 text-sm text-gray-700">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(p + 1, totalPages))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Prospect Detail Drawer */}
      {selectedId && (
        <ProspectDetail
          prospectId={selectedId}
          onClose={() => setSelectedId(null)}
          mode="drawer"
        />
      )}
    </div>
  );
}
