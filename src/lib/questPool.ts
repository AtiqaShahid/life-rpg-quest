// Static, deterministic quest bank used by the Regenerate flow.
// Strict rule: the regenerate system MUST pick from this list only.
// No AI generation, no paraphrasing, no duplicates within a cycle.

export type QuestCategory = "focus" | "health" | "learning" | "social" | "discipline";

export type PoolQuest = {
  title: string;
  category: QuestCategory;
  // Maps to public.activity_types.id so quest_progress can tick correctly.
  type_id: "study" | "workout" | "cardio" | "meditation" | "socializing" | "public_speaking";
  difficulty: number; // 1..10
  energy: "low" | "medium" | "high";
  linked_stats: ("intelligence" | "strength" | "discipline" | "charisma")[];
  min_duration?: number; // minutes, optional
};

const focus: PoolQuest[] = [
  "Complete one important task without delay",
  "Write today's to-do list",
  "Finish top 3 priorities",
  "Spend 30 min on focused work",
  "Avoid multitasking for 1 hour",
  "Clear one pending small task",
  "Organize your workspace for 10 min",
  "Plan your day in the morning",
  "Review yesterday's tasks",
  "Delete 5 unnecessary items/files",
  "Finish one thing you've been postponing",
  "Work without phone for 30 min",
  "Break a big task into smaller steps",
  "Follow a planned schedule for 2 hours",
  "Track how you spent your day",
  "Set 3 clear goals for today",
  "Complete one difficult task first",
  "Work in silence for 20 min",
  "Avoid distractions for 1 hour",
  "Keep your desk clean all day",
  "Write tomorrow's plan",
  "Focus on one task at a time",
  "Reduce screen distractions for 2 hours",
  "Finish unfinished task from yesterday",
  "Set a timer and work until it ends",
  "Declutter one small area",
  "Keep phone away during work",
  "Complete a backlog task",
  "Follow morning routine properly",
  "Follow night routine properly",
  "Track 3 completed tasks",
  "Avoid procrastination today",
  "Start something immediately",
  "Work 45 min without interruption",
  "Improve one daily habit",
  "Write 3 improvements for today",
  "Complete a task before its deadline",
  "Focus session with no social media",
  "Reduce wasted time today",
  "Stick to your schedule for half a day",
].map((title, i) => ({
  title,
  category: "focus" as const,
  type_id: "study" as const,
  difficulty: 3 + (i % 3),
  energy: i % 3 === 0 ? "low" : "medium",
  linked_stats: ["discipline", "intelligence"],
}));

const health: PoolQuest[] = [
  ["Walk 20–40 minutes", "cardio", 20],
  ["Drink 2–3 liters of water", "workout"],
  ["Do a 10-minute stretch", "workout", 10],
  ["Avoid junk food today", "workout"],
  ["Eat a healthy meal", "workout"],
  ["Sleep on time", "meditation"],
  ["Wake up at a fixed time", "meditation"],
  ["10–20 minutes of exercise", "workout", 10],
  ["Take the stairs today", "cardio"],
  ["Spend time outside", "cardio"],
  ["Maintain good posture", "workout"],
  ["Avoid sugary drinks", "workout"],
  ["Do breathing exercises", "meditation", 10],
  ["Eat slowly and mindfully", "meditation"],
  ["No late-night snacking", "workout"],
  ["Drink water before each meal", "workout"],
  ["Stand and move every hour", "cardio"],
  ["Take a 5-minute movement break", "cardio", 5],
  ["Limit screen time today", "meditation"],
  ["Walk 10 min after a meal", "cardio", 10],
  ["Stretch before sleep", "workout", 10],
  ["Eat fruits or vegetables", "workout"],
  ["Avoid overeating", "workout"],
  ["Track your meals today", "workout"],
  ["Light workout session", "workout", 15],
  ["Stay hydrated all day", "workout"],
  ["No fast food today", "workout"],
  ["Relax fully before sleep", "meditation"],
  ["Check your energy levels", "meditation"],
  ["Avoid sitting for too long", "cardio"],
  ["Get sunlight exposure", "cardio"],
  ["Do 10 push-ups", "workout"],
  ["Don't skip any meals", "workout"],
  ["Stay active throughout the day", "cardio"],
  ["Yoga or stretch session", "workout", 15],
  ["Reduce caffeine intake", "workout"],
  ["Eat balanced meals today", "workout"],
  ["No screens 30 min before sleep", "meditation"],
  ["Improve your sleep tonight", "meditation"],
  ["Maintain personal hygiene", "workout"],
].map(([title, type_id, min_duration], i) => ({
  title: title as string,
  category: "health" as const,
  type_id: type_id as PoolQuest["type_id"],
  difficulty: 2 + (i % 3),
  energy: (type_id === "cardio" || type_id === "workout") ? "medium" : "low",
  linked_stats: ["strength", "discipline"],
  min_duration: min_duration as number | undefined,
}));

const learning: PoolQuest[] = [
  "Learn something new today",
  "Read for 15–30 minutes",
  "Watch one educational video",
  "Practice a skill for 20 min",
  "Learn 5 new words",
  "Revise something you learned",
  "Write structured notes",
  "Solve one challenging problem",
  "Learn from a recent mistake",
  "Explore a new topic",
  "Research a question you have",
  "Do a memory practice exercise",
  "Teach a concept to someone",
  "Apply something from a tutorial",
  "Improve a current skill",
  "Read one full article",
  "Summarize today's learning",
  "Have a focused study session",
  "Practice consistency in learning",
  "Reflect on what you learned",
  "Try a new concept hands-on",
  "Review yesterday's lessons",
  "Step-by-step learning session",
  "Focus on a weak area",
  "Watch a documentary",
  "Improve your vocabulary",
  "Spend 10 min in deep thinking",
  "Write structured notes from a topic",
  "Relearn a forgotten concept",
  "Apply a lesson in real life",
  "Experiment with one idea",
  "Improve your understanding of a topic",
  "Study for 20–40 min",
  "Break down a complex idea",
  "Connect ideas across topics",
  "Observe and learn from others",
  "Practice active recall",
  "Self-test a concept",
  "Learn by doing",
  "Stay curious — ask 3 questions",
].map((title, i) => ({
  title,
  category: "learning" as const,
  type_id: "study" as const,
  difficulty: 3 + (i % 4),
  energy: "medium",
  linked_stats: ["intelligence"],
  min_duration: 20,
}));

const social: PoolQuest[] = [
  "Talk to a friend today",
  "Check in with family",
  "Help someone with a small thing",
  "Give a sincere compliment",
  "Express gratitude to someone",
  "Spend quality time with family",
  "Listen properly to someone",
  "Avoid one conflict today",
  "Apologize where needed",
  "Appreciate someone today",
  "Share helpful information",
  "Have one meaningful conversation",
  "Be polite in every interaction",
  "Meet someone new",
  "Support someone emotionally",
  "Spend time with a loved one",
  "Reduce arguments today",
  "Show kindness to a stranger",
  "Reconnect with someone",
  "Ask how someone is doing",
  "Avoid negativity today",
  "Encourage someone",
  "Respect someone's boundaries",
  "Spread positivity",
  "Be fully present in a chat",
  "Avoid gossip",
  "Smile more today",
  "Listen more than you speak",
  "Make someone's day better",
  "Build one relationship moment",
].map((title, i) => ({
  title,
  category: "social" as const,
  type_id: i % 4 === 0 ? "public_speaking" : "socializing",
  difficulty: 2 + (i % 3),
  energy: "low",
  linked_stats: ["charisma"],
}));

const discipline: PoolQuest[] = [
  "No social media for 2 hours",
  "Stay consistent today",
  "Avoid one laziness trigger",
  "Do the hardest task first",
  "Half-day disciplined run",
  "Control one impulse today",
  "Reflect on today's behavior",
  "Avoid distractions for an hour",
  "Keep a promise you made",
  "Stay calm under pressure",
  "Don't skip planned tasks",
  "Follow your structure today",
  "Reduce phone use intentionally",
  "Stay focused for one full hour",
  "Avoid an unnecessary purchase",
  "Practice patience today",
  "Track one habit",
  "Break one bad habit today",
  "Build one good habit today",
  "Avoid procrastination",
  "Show self-control today",
  "Think before reacting",
  "Stay consistent with effort",
  "Avoid emotional decisions",
  "Stay organized",
  "End-day reflection in writing",
  "Stay accountable today",
  "Improve your discipline",
  "Avoid wasting time",
  "Take intentional actions",
  "Keep your environment clean",
  "Reduce unnecessary distractions",
  "Stick to the plan today",
  "Mental focus exercise",
  "Avoid making excuses",
  "Do what you promised yourself",
  "Practice self-awareness",
  "Maintain emotional balance",
  "Avoid overthinking",
  "Stay productive today",
  "Keep a stable routine",
  "Resist one temptation",
  "Full self-discipline day",
  "Avoid random scrolling",
  "Be goal-oriented today",
  "Act immediately, no delay",
  "Practice self-respect habits",
].map((title, i) => ({
  title,
  category: "discipline" as const,
  type_id: i % 3 === 0 ? "meditation" : "study",
  difficulty: 3 + (i % 4),
  energy: i % 3 === 0 ? "low" : "medium",
  linked_stats: ["discipline"],
  min_duration: 10,
}));

export const QUEST_POOL: PoolQuest[] = [
  ...focus,
  ...health,
  ...learning,
  ...social,
  ...discipline,
];

/**
 * Slot composition rule:
 *   slot 1 → focus or discipline   (action, easy/medium)
 *   slot 2 → health                (body, medium)
 *   slot 3 → learning or discipline wildcard (medium/hard)
 */
export const SLOT_CATEGORIES: Record<number, QuestCategory[]> = {
  1: ["focus", "discipline"],
  2: ["health"],
  3: ["learning", "discipline", "social"],
};

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Pick a single random quest for a slot.
 * Excludes any titles that are currently active/locked or already used in this cycle.
 */
export function pickQuestForSlot(slot: number, blockedTitles: Set<string>): PoolQuest | null {
  const cats = SLOT_CATEGORIES[slot] ?? ["focus"];
  const candidates = QUEST_POOL.filter(
    (q) => cats.includes(q.category) && !blockedTitles.has(q.title.toLowerCase()),
  );
  if (candidates.length === 0) {
    // Fallback: any quest not currently blocked.
    const fallback = QUEST_POOL.filter((q) => !blockedTitles.has(q.title.toLowerCase()));
    if (fallback.length === 0) return null;
    return shuffle(fallback)[0];
  }
  return shuffle(candidates)[0];
}

/**
 * Pick N quests for the dynamic options pool with category balance:
 * 1× focus/discipline, 1× health, 1× learning (wildcard).
 */
export function pickDynamicOptions(blockedTitles: Set<string>, count = 3): PoolQuest[] {
  const used = new Set(blockedTitles);
  const result: PoolQuest[] = [];
  for (let slot = 1; slot <= count; slot += 1) {
    const next = pickQuestForSlot(slot, used);
    if (!next) break;
    used.add(next.title.toLowerCase());
    result.push(next);
  }
  return result;
}