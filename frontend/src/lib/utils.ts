import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  format,
  formatDistanceToNow,
  isValid,
  parseISO,
} from 'date-fns';
import { it } from 'date-fns/locale';

// ---------------------------------------------------------------------------
// Class name merger
// ---------------------------------------------------------------------------

/**
 * Merge Tailwind CSS class names, resolving conflicts intelligently.
 * Uses clsx for conditional class logic + tailwind-merge for deduplication.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

/**
 * Format a date string or Date object as a human-readable date.
 * Falls back to '—' for invalid/missing values.
 */
export function formatDate(
  value: string | Date | null | undefined,
  fmt = 'dd/MM/yyyy',
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (!isValid(date)) return '—';
  return format(date, fmt, { locale: it });
}

/**
 * Format a date string or Date object as "X time ago / tra X".
 */
export function formatRelativeTime(
  value: string | Date | null | undefined,
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (!isValid(date)) return '—';
  return formatDistanceToNow(date, { addSuffix: true, locale: it });
}

/**
 * Format a date with both date and time parts.
 */
export function formatDateTime(
  value: string | Date | null | undefined,
): string {
  return formatDate(value, 'dd/MM/yyyy HH:mm');
}

// ---------------------------------------------------------------------------
// Number / Percentage formatting
// ---------------------------------------------------------------------------

/**
 * Format a decimal (0–1) or integer (0–100) as a percentage string.
 * @param value  The value to format (0.42 → "42%", 42 → "42%")
 * @param decimals  Number of decimal places (default 1)
 */
export function formatPercentage(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  // Normalise: if value looks like a fraction (≤ 1) convert to 0–100
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  return `${pct.toFixed(decimals)}%`;
}

/**
 * Format a large number with thousands separator.
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return new Intl.NumberFormat('it-IT').format(value);
}

// ---------------------------------------------------------------------------
// Status colour mapping
// ---------------------------------------------------------------------------

/** Tailwind badge classes per prospect/agent status */
export const STATUS_COLORS: Record<string, string> = {
  // Prospect statuses
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-green-100 text-green-800',
  responded: 'bg-purple-100 text-purple-800',
  converted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  opted_out: 'bg-gray-100 text-gray-600',
  blacklisted: 'bg-red-200 text-red-900',

  // Agent statuses
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  draft: 'bg-gray-100 text-gray-600',

  // Task/log levels
  info: 'bg-blue-100 text-blue-800',
  warn: 'bg-yellow-100 text-yellow-800',
  warning: 'bg-yellow-100 text-yellow-800',
  critical: 'bg-red-200 text-red-900',

  // Fallback
  default: 'bg-gray-100 text-gray-700',
};

// ---------------------------------------------------------------------------
// Status label mapping (Italian)
// ---------------------------------------------------------------------------

/** Italian labels per prospect/agent status */
export const STATUS_LABELS: Record<string, string> = {
  // Prospect statuses
  new: 'Nuovo',
  contacted: 'Contattato',
  accepted: 'Accettato',
  responded: 'Risposto',
  converted: 'Convertito',
  rejected: 'Rifiutato',
  opted_out: 'Opt-out',
  blacklisted: 'Blacklist',

  // Agent statuses
  active: 'Attivo',
  paused: 'In pausa',
  error: 'Errore',
  draft: 'Bozza',

  // Log levels
  info: 'Info',
  warn: 'Avviso',
  warning: 'Avviso',
  critical: 'Critico',
  debug: 'Debug',

  // Fallback
  default: 'Sconosciuto',
};

/**
 * Resolve a status to its Tailwind badge classes.
 * Returns default grey if the status is not found in the map.
 */
export function getStatusColor(status: string | null | undefined): string {
  if (!status) return STATUS_COLORS.default;
  return STATUS_COLORS[status.toLowerCase()] ?? STATUS_COLORS.default;
}

/**
 * Resolve a status to its Italian label.
 */
export function getStatusLabel(status: string | null | undefined): string {
  if (!status) return STATUS_LABELS.default;
  return STATUS_LABELS[status.toLowerCase()] ?? status;
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

/**
 * Truncate a string to a max length, appending '…' if needed.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * Safely parse a JSON string. Returns `null` on failure.
 */
export function safeJsonParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Build a URL query string from a plain object, omitting null/undefined values.
 */
export function buildQueryString(params: Record<string, unknown>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `?${qs}` : '';
}
