// Contextual timer parser.
// Extracts an explicit duration ("15 min", "30 minutes") from a quest title
// and snaps it to one of the allowed buckets [10, 15, 20, 30].
// Returns null when the title does NOT mention a time → quest is instant-complete.

const ALLOWED = [10, 15, 20, 30] as const;
export type AllowedDuration = (typeof ALLOWED)[number];

export function parseQuestDuration(title: string | null | undefined): AllowedDuration | null {
  if (!title) return null;
  const m = title.match(/(\d+)\s?(?:min|minutes|mins)\b/i);
  if (!m) return null;
  const raw = parseInt(m[1], 10);
  if (!Number.isFinite(raw)) return null;
  if (raw >= 30) return 30;
  if (raw <= 10) return 10;
  // snap to nearest allowed value
  let best: AllowedDuration = 10;
  let bestDiff = Infinity;
  for (const v of ALLOWED) {
    const d = Math.abs(v - raw);
    if (d < bestDiff) { bestDiff = d; best = v; }
  }
  return best;
}

export function questHasTimer(title: string | null | undefined) {
  return parseQuestDuration(title) !== null;
}