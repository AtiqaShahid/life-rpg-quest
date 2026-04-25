// XP & leveling formulas + helpers shared across the app.

export const xpForLevel = (level: number) => Math.round(100 * Math.pow(level, 1.5));

/** Given a current level and total XP-into-that-level, returns the threshold for next level. */
export const xpToNext = (level: number) => xpForLevel(level + 1);

/** Apply XP gain — returns new {level, xp, leveledUp, levelsGained}. */
export function applyXp(level: number, xp: number, gained: number) {
  let newLevel = level;
  let newXp = xp + gained;
  let levelsGained = 0;
  while (newXp >= xpToNext(newLevel)) {
    newXp -= xpToNext(newLevel);
    newLevel += 1;
    levelsGained += 1;
  }
  return { level: newLevel, xp: newXp, leveledUp: levelsGained > 0, levelsGained };
}

export type StatKey = "intelligence" | "strength" | "discipline" | "charisma";

export const statMeta: Record<StatKey, { label: string; short: string; colorVar: string; icon: string }> = {
  intelligence: { label: "Intelligence", short: "INT", colorVar: "var(--stat-int)", icon: "Brain" },
  strength:     { label: "Strength",     short: "STR", colorVar: "var(--stat-str)", icon: "Dumbbell" },
  discipline:   { label: "Discipline",   short: "DIS", colorVar: "var(--stat-dis)", icon: "Shield" },
  charisma:     { label: "Charisma",     short: "CHA", colorVar: "var(--stat-cha)", icon: "Sparkles" },
};

/** Tiny stat bonus per activity completion (1 point) — keeps stats moving without inflation. */
export const STAT_GAIN_PER_ACTIVITY = 1;

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function streakUpdate(current: number, lastDate: string | null) {
  const today = todayISO();
  if (lastDate === today) return { current_streak: current, last_active_date: today, changed: false };
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const next = lastDate === yesterday ? current + 1 : 1;
  return { current_streak: next, last_active_date: today, changed: true };
}

/** Achievement rules — checked after each activity. */
export const ACHIEVEMENTS: Array<{
  code: string;
  title: string;
  description: string;
  check: (ctx: { level: number; totalActivities: number; streak: number }) => boolean;
}> = [
  { code: "first_step",  title: "First Step",       description: "Log your very first activity.",   check: c => c.totalActivities >= 1 },
  { code: "level_5",     title: "Adventurer",       description: "Reach level 5.",                  check: c => c.level >= 5 },
  { code: "level_10",    title: "Veteran",          description: "Reach level 10.",                 check: c => c.level >= 10 },
  { code: "level_25",    title: "Legend",           description: "Reach level 25.",                 check: c => c.level >= 25 },
  { code: "streak_3",    title: "On Fire",          description: "Maintain a 3-day streak.",        check: c => c.streak >= 3 },
  { code: "streak_7",    title: "Week Warrior",     description: "Maintain a 7-day streak.",        check: c => c.streak >= 7 },
  { code: "streak_30",   title: "Unstoppable",      description: "Maintain a 30-day streak.",       check: c => c.streak >= 30 },
  { code: "grind_50",    title: "The Grind",        description: "Log 50 activities.",              check: c => c.totalActivities >= 50 },
  { code: "grind_200",   title: "Mastery in Motion",description: "Log 200 activities.",             check: c => c.totalActivities >= 200 },
];
