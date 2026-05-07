// Intelligent quest timer classifier.
// Uses explicit durations + effort keywords while excluding small habit actions.

const ALLOWED = [10, 15, 20, 25, 30] as const;
export type AllowedDuration = (typeof ALLOWED)[number];

type TimerQuestLike = {
  title?: string | null;
  description?: string | null;
  duration_minutes?: number | null;
  criteria?: { type_id?: string | string[]; min_duration?: number | string | null } | null;
  status?: string | null;
};

const NON_TIMED_RE = /\b(water|hydrate|hydrated|gratitude|grateful|organize|organise|tidy|declutter|desk|workspace|call|message|reach out|compliment|hygiene|brush|shower|meal|food|junk food|snack|caffeine|sleep on time|wake up|posture|screen time|no screens|reflection|reflect|journal|plan tomorrow|to-do list|todo list)\b/i;

const TIMED_PATTERNS: Array<{ re: RegExp; duration: AllowedDuration }> = [
  { re: /\b(meditat|mindful|breath(?:ing|work)?|breathing session)\b/i, duration: 10 },
  { re: /\b(stretch|stretching)\b/i, duration: 10 },
  { re: /\b(yoga)\b/i, duration: 15 },
  { re: /\b(read|reading|chapter)\b/i, duration: 20 },
  { re: /\b(study|studying|deep work|focused work|focus session|focus block|work block|work sprint|single-task|skill builder|practice(?: session)?|learning block|learning session)\b/i, duration: 25 },
  { re: /\b(workout|exercise|cardio|walk|walking|train(?:ing)? session)\b/i, duration: 20 },
];

export function parseQuestDuration(title: string | null | undefined): AllowedDuration | null {
  if (!title) return null;
  const m = title.match(/(\d+)\s*(?:[–—-]\s*(\d+))?\s*(?:min|mins|minute|minutes)\b|(\d+)\s*[-‑]\s*minute\b/i);
  if (!m) return null;
  const low = parseInt(m[1] ?? m[3], 10);
  const high = m[2] ? parseInt(m[2], 10) : low;
  const raw = Number.isFinite(high) ? Math.round((low + high) / 2) : low;
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

function snapDuration(raw: number): AllowedDuration {
  if (raw >= 30) return 30;
  if (raw <= 10) return 10;
  let best: AllowedDuration = 10;
  let bestDiff = Infinity;
  for (const v of ALLOWED) {
    const d = Math.abs(v - raw);
    if (d < bestDiff) { bestDiff = d; best = v; }
  }
  return best;
}

export function getQuestTimerDuration(quest: TimerQuestLike): AllowedDuration | null {
  const title = quest.title ?? "";
  const description = quest.description ?? "";
  const text = `${title} ${description}`.trim();
  const isRunning = quest.status === "in_progress" || quest.status === "paused";

  if (isRunning && quest.duration_minutes && quest.duration_minutes > 0) {
    return snapDuration(Math.min(30, quest.duration_minutes));
  }
  if (NON_TIMED_RE.test(text)) return null;

  const explicit = parseQuestDuration(text);
  const matched = TIMED_PATTERNS.find(({ re }) => re.test(text));
  if (explicit && matched) return explicit;

  const minDuration = Number(quest.criteria?.min_duration ?? 0);
  if (matched) return minDuration > 0 ? snapDuration(Math.min(30, minDuration)) : matched.duration;

  return null;
}