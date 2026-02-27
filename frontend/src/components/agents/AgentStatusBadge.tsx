/**
 * AgentStatusBadge — colour-coded status pill for agents.
 *
 * Status map:
 *   active   → green, animated dot
 *   paused   → yellow
 *   archived → grey
 *   error    → red (extra state from existing AgentStatus type)
 *   draft    → grey-blue (extra state from existing AgentStatus type)
 */

import { clsx } from 'clsx';
import type { AgentStatus } from '@/hooks/useAgents';

interface AgentStatusBadgeProps {
  status: AgentStatus;
  className?: string;
}

const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; bg: string; text: string; dot: string; animated: boolean }
> = {
  active: {
    label: 'Attivo',
    bg: 'bg-green-100',
    text: 'text-green-800',
    dot: 'bg-green-500',
    animated: true,
  },
  paused: {
    label: 'In pausa',
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    dot: 'bg-yellow-500',
    animated: false,
  },
  error: {
    label: 'Errore',
    bg: 'bg-red-100',
    text: 'text-red-800',
    dot: 'bg-red-500',
    animated: false,
  },
  draft: {
    label: 'Bozza',
    bg: 'bg-indigo-100',
    text: 'text-indigo-800',
    dot: 'bg-indigo-400',
    animated: false,
  },
};

// "archived" is not in the existing AgentStatus union but is referenced in the
// design doc, so we handle it gracefully as a fallback.
const ARCHIVED_CONFIG = {
  label: 'Archiviato',
  bg: 'bg-gray-100',
  text: 'text-gray-600',
  dot: 'bg-gray-400',
  animated: false,
};

export function AgentStatusBadge({ status, className }: AgentStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? ARCHIVED_CONFIG;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.bg,
        config.text,
        className,
      )}
    >
      {/* Status dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        {config.animated && (
          <span
            className={clsx(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
              config.dot,
            )}
          />
        )}
        <span
          className={clsx(
            'relative inline-flex h-2 w-2 rounded-full',
            config.dot,
          )}
        />
      </span>
      {config.label}
    </span>
  );
}

export default AgentStatusBadge;
