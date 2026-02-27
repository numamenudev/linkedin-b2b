/**
 * ProspectStatusBadge — colour-coded status pill for prospects.
 *
 * Covers the full state machine defined in the design doc plus the statuses
 * from the existing useProspects hook, with graceful fallback for unmapped values.
 *
 * Status colour mapping:
 *   found              → grey
 *   queued / new       → blue
 *   connection_sent / contacted → indigo
 *   connection_accepted / accepted → green
 *   intro_sent         → violet
 *   responded          → bright green (emerald)
 *   converted          → teal
 *   archived / rejected → dark grey
 *   opted_out / blacklisted → red
 */

import { clsx } from 'clsx';

// Union of all possible prospect status values (design doc + existing hook)
export type AllProspectStatus =
  | 'found'
  | 'queued'
  | 'new'
  | 'connection_sent'
  | 'contacted'
  | 'connection_accepted'
  | 'accepted'
  | 'intro_sent'
  | 'responded'
  | 'converted'
  | 'archived'
  | 'rejected'
  | 'opted_out'
  | 'blacklisted';

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  dot: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  found: {
    label: 'Trovato',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    dot: 'bg-gray-400',
  },
  queued: {
    label: 'In coda',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
  new: {
    label: 'Nuovo',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
  connection_sent: {
    label: 'Invito inviato',
    bg: 'bg-indigo-100',
    text: 'text-indigo-700',
    dot: 'bg-indigo-500',
  },
  contacted: {
    label: 'Contattato',
    bg: 'bg-indigo-100',
    text: 'text-indigo-700',
    dot: 'bg-indigo-500',
  },
  connection_accepted: {
    label: 'Connesso',
    bg: 'bg-green-100',
    text: 'text-green-800',
    dot: 'bg-green-500',
  },
  accepted: {
    label: 'Connesso',
    bg: 'bg-green-100',
    text: 'text-green-800',
    dot: 'bg-green-500',
  },
  intro_sent: {
    label: 'Intro inviato',
    bg: 'bg-violet-100',
    text: 'text-violet-700',
    dot: 'bg-violet-500',
  },
  responded: {
    label: 'Risposto',
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    dot: 'bg-emerald-500',
  },
  converted: {
    label: 'Convertito',
    bg: 'bg-teal-100',
    text: 'text-teal-700',
    dot: 'bg-teal-500',
  },
  archived: {
    label: 'Archiviato',
    bg: 'bg-gray-200',
    text: 'text-gray-700',
    dot: 'bg-gray-500',
  },
  rejected: {
    label: 'Rifiutato',
    bg: 'bg-gray-200',
    text: 'text-gray-700',
    dot: 'bg-gray-500',
  },
  opted_out: {
    label: 'Opt-out',
    bg: 'bg-red-100',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
  blacklisted: {
    label: 'Blacklist',
    bg: 'bg-red-200',
    text: 'text-red-800',
    dot: 'bg-red-600',
  },
};

const FALLBACK: StatusConfig = {
  label: 'Sconosciuto',
  bg: 'bg-gray-100',
  text: 'text-gray-500',
  dot: 'bg-gray-400',
};

interface ProspectStatusBadgeProps {
  status: AllProspectStatus | string;
  className?: string;
  /** Show coloured dot */
  dot?: boolean;
}

export function ProspectStatusBadge({
  status,
  className,
  dot = true,
}: ProspectStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? FALLBACK;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        config.bg,
        config.text,
        className,
      )}
    >
      {dot && (
        <span
          className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', config.dot)}
        />
      )}
      {config.label}
    </span>
  );
}

export default ProspectStatusBadge;
