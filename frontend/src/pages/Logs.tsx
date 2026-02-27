/**
 * Logs page — terminal-style real-time log viewer.
 *
 * Features:
 *  - Filter by agent, job, level (info/warn/error)
 *  - Free-text search across message and action
 *  - "Live" toggle that opens/closes the WebSocket connection
 *  - Auto-scroll to bottom when new logs arrive (unless user has scrolled up)
 *  - Colour-coded level badges
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Wifi, WifiOff, Trash2, ChevronDown } from 'lucide-react';
import { useLiveLog, type LogEntry, type LogLevel } from '@/hooks/useLiveLog';
import { api } from '@/lib/api';
import { type Agent } from '@/hooks/useAgents';

// ---------------------------------------------------------------------------
// Level badge
// ---------------------------------------------------------------------------

const LEVEL_STYLES: Record<LogLevel | 'debug', string> = {
  debug: 'bg-gray-100 text-gray-500',
  info: 'bg-blue-100 text-blue-700',
  warn: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-700',
};

function LevelBadge({ level }: { level: LogLevel }) {
  return (
    <span
      className={clsx(
        'inline-block min-w-[44px] rounded px-1.5 py-0.5 text-center text-xs font-semibold uppercase tracking-wide',
        LEVEL_STYLES[level] ?? LEVEL_STYLES.info,
      )}
    >
      {level}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Single log row
// ---------------------------------------------------------------------------

function LogRow({ entry }: { entry: LogEntry }) {
  const ts = new Date(entry.timestamp).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="flex items-start gap-3 border-b border-gray-800 px-4 py-2 font-mono text-xs hover:bg-gray-800/40">
      {/* Timestamp */}
      <span className="shrink-0 text-gray-500">{ts}</span>

      {/* Level */}
      <span className="shrink-0">
        <LevelBadge level={entry.level} />
      </span>

      {/* Agent */}
      {entry.agentId && (
        <span className="shrink-0 rounded bg-indigo-900/60 px-1.5 py-0.5 text-indigo-300">
          {entry.agentId.slice(0, 8)}
        </span>
      )}

      {/* Action */}
      {entry.action && (
        <span className="shrink-0 text-gray-400">[{entry.action}]</span>
      )}

      {/* Message */}
      <span
        className={clsx(
          'break-all',
          entry.level === 'error' && 'text-red-400',
          entry.level === 'warn' && 'text-yellow-300',
          entry.level === 'info' && 'text-gray-200',
          entry.level === 'debug' && 'text-gray-500',
        )}
      >
        {entry.message}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logs page
// ---------------------------------------------------------------------------

export default function Logs() {
  // Filter state
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | ''>('');
  const [search, setSearch] = useState('');
  const [isLive, setIsLive] = useState(false);

  // Auto-scroll state
  const listRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const isScrollingRef = useRef(false);

  // WebSocket hook
  const { logs, isConnected, connect, disconnect, clear } = useLiveLog(
    {
      agentId: selectedAgentId || undefined,
      jobId: selectedJobId || undefined,
      level: (selectedLevel as LogLevel) || undefined,
    },
    false,
  );

  // Agent list for filter dropdown
  const { data: agents } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: () => api.get<Agent[]>('/agents'),
  });

  // Toggle live mode
  const handleLiveToggle = useCallback(() => {
    if (isLive) {
      disconnect();
      setIsLive(false);
    } else {
      connect();
      setIsLive(true);
    }
  }, [isLive, connect, disconnect]);

  // Reconnect when filters change while live
  useEffect(() => {
    if (isLive) {
      connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentId, selectedJobId, selectedLevel]);

  // Auto-scroll on new logs
  useEffect(() => {
    if (!autoScroll || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [logs, autoScroll]);

  // Detect manual scroll (disable auto-scroll)
  const handleScroll = () => {
    if (isScrollingRef.current || !listRef.current) return;
    const el = listRef.current;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(isAtBottom);
  };

  // Filtered logs
  const filteredLogs: LogEntry[] = logs.filter((entry) => {
    if (search) {
      const q = search.toLowerCase();
      const match =
        entry.message.toLowerCase().includes(q) ||
        (entry.action ?? '').toLowerCase().includes(q) ||
        (entry.agentId ?? '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="flex h-full flex-col bg-gray-950 text-gray-100">
      {/* ------------------------------------------------------------------ */}
      {/* Toolbar                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-800 bg-gray-900 px-4 py-3">
        {/* Live toggle */}
        <button
          onClick={handleLiveToggle}
          className={clsx(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            isConnected
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
          )}
        >
          {isConnected ? (
            <Wifi className="h-4 w-4" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )}
          {isConnected ? 'Live — Attivo' : 'Live — Off'}
        </button>

        {/* Agent filter */}
        <select
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Tutti gli agenti</option>
          {agents?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        {/* Job filter */}
        <input
          type="text"
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
          placeholder="Job ID..."
          className="w-36 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {/* Level filter */}
        <select
          value={selectedLevel}
          onChange={(e) => setSelectedLevel(e.target.value as LogLevel | '')}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Tutti i livelli</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca nei log..."
          className="flex-1 min-w-[180px] rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {/* Count */}
        <span className="text-xs text-gray-500 tabular-nums">
          {filteredLogs.length} / {logs.length}
        </span>

        {/* Clear */}
        <button
          onClick={clear}
          title="Svuota log"
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Log stream                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-600">
            {isConnected
              ? 'In attesa di log...'
              : 'Attiva la modalità Live per vedere i log in tempo reale.'}
          </div>
        ) : (
          filteredLogs.map((entry) => <LogRow key={entry.id} entry={entry} />)
        )}
      </div>

      {/* Auto-scroll hint */}
      {!autoScroll && filteredLogs.length > 0 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <button
            onClick={() => {
              setAutoScroll(true);
              if (listRef.current) {
                listRef.current.scrollTop = listRef.current.scrollHeight;
              }
            }}
            className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-indigo-700"
          >
            <ChevronDown className="h-3 w-3" />
            Torna in fondo
          </button>
        </div>
      )}

      {/* Connection status bar */}
      <div
        className={clsx(
          'flex items-center justify-between border-t px-4 py-1.5 text-xs',
          isConnected
            ? 'border-green-800 bg-green-950 text-green-400'
            : 'border-gray-800 bg-gray-900 text-gray-600',
        )}
      >
        <span>
          {isConnected ? 'Connessione WebSocket attiva' : 'WebSocket disconnesso'}
        </span>
        {isConnected && (
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Live
          </span>
        )}
      </div>
    </div>
  );
}
