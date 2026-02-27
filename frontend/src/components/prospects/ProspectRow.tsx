/**
 * ProspectRow — table row for the prospect list page.
 *
 * Columns:
 *  1. Avatar (initial letter) + full name
 *  2. Agent badge
 *  3. Headline (truncated)
 *  4. Status badge
 *  5. Last activity date
 *  6. Score (colour-coded)
 *
 * Clicking anywhere on the row fires the onSelect callback so the parent
 * can open a detail drawer.
 */

import { clsx } from 'clsx';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { ProspectStatusBadge } from './ProspectStatusBadge';
import type { Prospect } from '@/hooks/useProspects';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function getAvatarColor(name: string): string {
  // Deterministic colour from name hash
  const colours = [
    'bg-indigo-500',
    'bg-violet-500',
    'bg-emerald-500',
    'bg-sky-500',
    'bg-rose-500',
    'bg-amber-500',
    'bg-teal-500',
    'bg-pink-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i)) % colours.length;
  }
  return colours[hash];
}

function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const color =
    score >= 80
      ? 'bg-emerald-100 text-emerald-800'
      : score >= 60
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-red-100 text-red-700';

  return (
    <span
      className={clsx(
        'inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        color,
      )}
    >
      {score}
    </span>
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'd MMM yyyy', { locale: it });
  } catch {
    return '—';
  }
}

// ---------------------------------------------------------------------------
// ProspectRow
// ---------------------------------------------------------------------------

interface ProspectRowProps {
  prospect: Prospect;
  onSelect: (prospect: Prospect) => void;
  /** Highlight this row (e.g. already selected) */
  isSelected?: boolean;
}

export function ProspectRow({
  prospect,
  onSelect,
  isSelected = false,
}: ProspectRowProps) {
  const fullName = `${prospect.firstName} ${prospect.lastName}`;
  const initials = getInitials(prospect.firstName, prospect.lastName);
  const avatarBg = getAvatarColor(fullName);

  // Pick the most relevant date to show
  const activityDate =
    prospect.respondedAt ??
    prospect.acceptedAt ??
    prospect.contactedAt ??
    prospect.createdAt;

  // score comes from rawProfileData or a top-level field added in future
  const score = (prospect as Prospect & { score?: number }).score;

  return (
    <tr
      role="row"
      aria-selected={isSelected}
      onClick={() => onSelect(prospect)}
      className={clsx(
        'cursor-pointer border-b border-gray-100 transition-colors',
        isSelected
          ? 'bg-indigo-50'
          : 'bg-white hover:bg-gray-50',
      )}
    >
      {/* Name + avatar */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white',
              avatarBg,
            )}
            aria-hidden
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">
              {fullName}
            </p>
            {prospect.company && (
              <p className="truncate text-xs text-gray-500">
                {prospect.company}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Agent badge */}
      <td className="hidden px-4 py-3 sm:table-cell">
        {prospect.agentName ? (
          <span className="inline-block max-w-[120px] truncate rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
            {prospect.agentName}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>

      {/* Headline */}
      <td className="hidden max-w-[200px] px-4 py-3 lg:table-cell">
        <p className="truncate text-xs text-gray-600">
          {prospect.headline ?? '—'}
        </p>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <ProspectStatusBadge status={prospect.status} />
      </td>

      {/* Date */}
      <td className="hidden px-4 py-3 text-xs text-gray-500 sm:table-cell">
        {formatDate(activityDate)}
      </td>

      {/* Score */}
      <td className="px-4 py-3 text-right">
        <ScoreBadge score={score} />
      </td>
    </tr>
  );
}

export default ProspectRow;
