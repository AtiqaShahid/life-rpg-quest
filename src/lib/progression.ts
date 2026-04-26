// Progression engine — client-side mirror of the server-side log_activity logic.
// Server is the source of truth; this is for live preview / UI display.

import type { StatKey } from "@/lib/rpg";

export type Difficulty = "easy" | "medium" | "hard";

export type SkillCatalog = {
  id: string;
  stat: StatKey;
  label: string;
  description: string;
  parent_id: string | null;
  max_level: number;
  cost_per_level: number;
  effect: SkillEffect;
  sort_order: number;
};

export type SkillEffect =
  | { kind: "none" }
  | { kind: "xp_multiplier"; target?: string; per_level: number }
  | { kind: "streak_multiplier"; per_level: number }
  | { kind: "penalty_reduction"; target: string; per_level: number };

export type SkillNode = { skill_id: string; level: number };

// ---- Constants (config object — no scattered magic numbers) ----
export const PROGRESSION_CONFIG = {
  baseLevelCoeff: 100,
  levelExponent: 1.5,
  skillPointsPerLevel: 3,

  streakBasePerDay: 0.1,
  streakCap: 2.0,

  difficulty: { easy: 1.0, medium: 1.5, hard: 2.0 } as Record<Difficulty, number>,

  timeBonus: {
    morning: { from: 5, to: 10, mult: 1.20 },
    night:   { from: 22, to: 2, mult: 1.10 },
  },

  softCap: { startLevel: 10, perLevel: 0.01, floor: 0.5 },
} as const;

export const xpForLevel = (level: number) =>
  Math.floor(PROGRESSION_CONFIG.baseLevelCoeff * Math.pow(level, PROGRESSION_CONFIG.levelExponent));

export const xpToNext = (level: number) => xpForLevel(level + 1);

export function streakSkillBonus(nodes: SkillNode[], catalog: SkillCatalog[]) {
  let bonus = 0;
  for (const n of nodes) {
    if (n.level <= 0) continue;
    const skill = catalog.find(s => s.id === n.skill_id);
    if (!skill || skill.effect.kind !== "streak_multiplier") continue;
    bonus += n.level * skill.effect.per_level;
  }
  return bonus;
}

export function statXpMultiplier(typeId: string, nodes: SkillNode[], catalog: SkillCatalog[]) {
  let bonus = 0;
  for (const n of nodes) {
    if (n.level <= 0) continue;
    const skill = catalog.find(s => s.id === n.skill_id);
    if (!skill || skill.effect.kind !== "xp_multiplier") continue;
    const target = skill.effect.target;
    const matches = !target || target === typeId || target.split(",").map(t => t.trim()).includes(typeId);
    if (matches) bonus += n.level * skill.effect.per_level;
  }
  return 1 + bonus;
}

export function timeOfDayBonus(date = new Date()) {
  const h = date.getHours();
  const { morning, night } = PROGRESSION_CONFIG.timeBonus;
  if (h >= morning.from && h < morning.to) return morning.mult;
  if (h >= night.from || h < night.to) return night.mult;
  return 1.0;
}

export function streakMultiplier(projectedStreakDays: number, skillBonus: number) {
  const days = Math.max(1, projectedStreakDays);
  return Math.min(
    PROGRESSION_CONFIG.streakCap,
    1 + (days - 1) * (PROGRESSION_CONFIG.streakBasePerDay + skillBonus),
  );
}

export function diminishingMultiplier(level: number) {
  const { startLevel, perLevel, floor } = PROGRESSION_CONFIG.softCap;
  if (level <= startLevel) return 1;
  return Math.max(floor, 1 - (level - startLevel) * perLevel);
}

export type XpBreakdown = {
  base: number;
  difficulty: number;
  streak: number;
  streak_days_projected: number;
  time_of_day: number;
  stat: number;
  diminish: number;
  final: number;
};

export type CalcInput = {
  baseXp: number;
  typeId: string;
  difficulty: Difficulty;
  level: number;
  streakDays: number; // already-projected (today counts)
  nodes: SkillNode[];
  catalog: SkillCatalog[];
  now?: Date;
};

export function calculateXp(input: CalcInput): XpBreakdown {
  const diff = PROGRESSION_CONFIG.difficulty[input.difficulty];
  const skillBonus = streakSkillBonus(input.nodes, input.catalog);
  const streak = streakMultiplier(input.streakDays, skillBonus);
  const time = timeOfDayBonus(input.now);
  const stat = statXpMultiplier(input.typeId, input.nodes, input.catalog);
  const dim = diminishingMultiplier(input.level);
  const final = Math.max(1, Math.round(input.baseXp * diff * streak * time * stat * dim));
  return {
    base: input.baseXp,
    difficulty: diff,
    streak,
    streak_days_projected: Math.max(1, input.streakDays),
    time_of_day: time,
    stat,
    diminish: dim,
    final,
  };
}

/** Project what the user's streak WILL be after logging today. */
export function projectStreakDays(currentStreak: number, lastDateISO: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (lastDateISO === today) return Math.max(1, currentStreak);
  if (lastDateISO === yesterday) return Math.max(1, currentStreak) + 1;
  return 1;
}

/** Apply XP and carry overflow forward. Returns new state + levels gained. */
export function applyXp(level: number, xp: number, gained: number) {
  let lvl = level, x = xp + gained, levels = 0;
  while (x >= xpToNext(lvl)) { x -= xpToNext(lvl); lvl += 1; levels += 1; }
  return { level: lvl, xp: x, leveledUp: levels > 0, levelsGained: levels };
}
