/**
 * backend/src/utils/helpers.ts
 * Generic utility functions used across the application.
 */

// ---------------------------------------------------------------------------
// Sleep / delay
// ---------------------------------------------------------------------------

/**
 * Promise-based sleep.
 * @param ms Milliseconds to wait
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a random delay between `min` and `max` seconds.
 * Used to simulate human-like behaviour between LinkedIn actions.
 *
 * @param min Minimum delay in seconds (default 10)
 * @param max Maximum delay in seconds (default 30)
 */
export async function randomDelay(min = 10, max = 30): Promise<void> {
  const seconds = min + Math.random() * (max - min);
  await sleep(Math.round(seconds * 1_000));
}

// ---------------------------------------------------------------------------
// Integer random
// ---------------------------------------------------------------------------

/**
 * Return a random integer in [min, max] (inclusive).
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

/**
 * Format a Date in Italian locale: dd/MM/yyyy HH:mm
 * Example: "27/02/2026 14:30"
 */
export function formatDate(date: Date): string {
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());

  return `${d}/${m}/${y} ${h}:${min}`;
}

/**
 * Return today's date string in ISO format (YYYY-MM-DD), used as Redis key suffix.
 */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Return the ISO week number string in format YYYY-WNN, e.g. "2026-W09".
 * Used as Redis key suffix for weekly counters.
 */
export function currentWeekISO(): string {
  const now = new Date();
  const year = now.getFullYear();

  // ISO week: week starts on Monday
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86_400_000);
  // Day of week: 0=Sun … 6=Sat; convert to Mon=0
  const dow = (now.getDay() + 6) % 7;
  const weekNum = Math.floor((dayOfYear + dow) / 7) + 1;

  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// API key masking
// ---------------------------------------------------------------------------

/**
 * Mask an API key, showing only the last 4 characters.
 * Example: "sk-abc123xyz789" -> "**********789"
 * Returns empty string if key is too short or falsy.
 */
export function maskApiKey(key: string): string {
  if (!key || key.length <= 4) return '****';
  const visible = key.slice(-4);
  const masked = '*'.repeat(Math.max(key.length - 4, 4));
  return `${masked}${visible}`;
}

// ---------------------------------------------------------------------------
// Job time randomisation
// ---------------------------------------------------------------------------

/**
 * Add a random offset of ±15 minutes to a base Date.
 * Used by the scheduler to make job execution times less predictable,
 * simulating natural human variation.
 *
 * @param baseTime  The intended fire time
 * @returns         A new Date shifted by a random ±15 minutes
 */
export function randomizeJobTime(baseTime: Date): Date {
  const offsetMs = (randomInt(-15, 15)) * 60 * 1_000;
  return new Date(baseTime.getTime() + offsetMs);
}

/**
 * Parse a "HH:MM" string into a Date for today with that time.
 */
export function parseTimeToday(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// LinkedIn anonymous profile detection
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate a LinkedIn anonymous / private profile.
 *
 * LinkedIn returns placeholder text for users who have enabled private-mode
 * profile viewing. These profiles cannot be contacted, so we skip them.
 *
 * Patterns cover:
 *  - "LinkedIn Member" (English default anonymous name)
 *  - "Membro LinkedIn" (Italian)
 *  - "Membre LinkedIn" (French)
 *  - "Mitglied von LinkedIn" (German)
 *  - "Miembro de LinkedIn" (Spanish)
 *  - Missing or placeholder linkedinId (empty, "UNKNOWN", "private")
 *  - firstName/lastName both absent or set to placeholder strings
 */
const ANONYMOUS_NAME_PATTERNS: RegExp[] = [
  /^LinkedIn\s+Member$/i,
  /^Membro\s+LinkedIn$/i,
  /^Membre\s+LinkedIn$/i,
  /^Mitglied\s+von\s+LinkedIn$/i,
  /^Miembro\s+de\s+LinkedIn$/i,
  /^LinkedIn\s+Nutzer$/i,
  /^LinkedIn\s+Kullan.c.s.$/i,    // Turkish
  /^Utilisateur\s+LinkedIn$/i,
  /^unknown$/i,
  /^private$/i,
];

const ANONYMOUS_ID_PATTERNS: RegExp[] = [
  /^$/,
  /^unknown$/i,
  /^private$/i,
  /^PRIVATE_PROFILE$/,
];

interface MinimalProfile {
  linkedinId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  headline?: string | null;
}

/**
 * Returns `true` if the given LinkedIn profile appears to be anonymous
 * (i.e. the user has enabled private profile viewing or LinkedIn returned
 * a placeholder record).
 */
export function isAnonymousProfile(profile: MinimalProfile): boolean {
  // Check ID
  if (!profile.linkedinId || ANONYMOUS_ID_PATTERNS.some((re) => re.test(profile.linkedinId!.trim()))) {
    return true;
  }

  // Build a display name to check
  const displayName = (
    profile.fullName ||
    [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  ).trim();

  if (!displayName) return true;

  if (ANONYMOUS_NAME_PATTERNS.some((re) => re.test(displayName))) {
    return true;
  }

  return false;
}
