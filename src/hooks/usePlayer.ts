import { useEffect, useMemo, useState, useCallback, createContext, createElement, useContext, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { applyXp, ACHIEVEMENTS, STAT_GAIN_PER_ACTIVITY, StatKey, streakUpdate, xpToNext } from "@/lib/rpg";
import { toast } from "sonner";
import type { SkillCatalog, SkillNode, Difficulty } from "@/lib/progression";
import { pickQuestForSlot, pickDynamicOptions, type PoolQuest } from "@/lib/questPool";
import { getQuestTimerDuration } from "@/lib/questTimer";

const missionBoardResetLocks = new Map<string, Promise<void>>();
const QUEST_STAT_BY_TYPE: Record<PoolQuest["type_id"], QuestRich["linked_stats"]> = {
  study: ["intelligence", "discipline"],
  workout: ["strength", "discipline"],
  cardio: ["strength"],
  meditation: ["discipline"],
  socializing: ["charisma"],
  public_speaking: ["charisma"],
};

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function rewardForDifficulty(difficulty: number) {
  // Mirrors the server's compute_quest_xp base curve for "daily" / "dynamic" weight.
  return Math.max(10, Math.round(15 * Math.pow(difficulty, 1.25)));
}

function buildQuestRow(
  userId: string,
  pick: PoolQuest,
  opts: { questType: "daily" | "dynamic" | "weekly"; status: "active" | "candidate"; slotIndex: number | null; cycleEnd?: string },
) {
  const criteria: Record<string, string | number> = { type_id: pick.type_id };
  if (pick.min_duration && pick.min_duration > 0) criteria.min_duration = pick.min_duration;
  const duration = getQuestTimerDuration({ title: pick.title, criteria });
  return {
    user_id: userId,
    title: pick.title,
    description: null,
    quest_type: opts.questType,
    difficulty: pick.difficulty,
    linked_stats: pick.linked_stats,
    energy: pick.energy,
    criteria: criteria as unknown as Record<string, never>,
    status: opts.status,
    reward_xp: rewardForDifficulty(pick.difficulty),
    is_daily: opts.questType === "daily",
    expires_at:
      opts.questType === "daily"
        ? tomorrowIso()
        : opts.questType === "weekly"
          ? opts.cycleEnd ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    generation_reason: `pool:${pick.category}`,
    template_key: opts.questType === "daily"
      ? `daily_pool_slot_${opts.slotIndex ?? 0}`
      : opts.questType === "weekly"
        ? `weekly_pool_slot_${opts.slotIndex ?? 0}`
        : "dynamic_pool",
    is_compulsory: false,
    slot_index: opts.slotIndex,
    duration_minutes: duration,
  };
}

function buildProgressRow(questId: string, userId: string, pick: PoolQuest) {
  return {
    quest_id: questId,
    user_id: userId,
    current: 0,
    target: 1,
    unit: "count" as const,
  };
}

function buildWeeklyFallbackPick(slot: number): PoolQuest {
  const weekly: PoolQuest[] = [
    { title: "Deep work marathon", category: "focus", type_id: "study", difficulty: 5, energy: "high", linked_stats: ["intelligence", "discipline"], min_duration: 30 },
    { title: "Train 4 sessions", category: "health", type_id: "workout", difficulty: 5, energy: "high", linked_stats: ["strength", "discipline"], min_duration: 30 },
    { title: "Read 3 sessions", category: "learning", type_id: "study", difficulty: 4, energy: "medium", linked_stats: ["intelligence"], min_duration: 20 },
  ];
  return weekly[(slot - 1) % weekly.length];
}

export type Profile = { id: string; user_id: string; username: string; avatar_url: string | null; level: number; xp: number; skill_points: number };
export type ProfileEconomy = Profile & {
  coins: number; tokens: number;
  exhaustion: number; exhaustion_updated_at: string;
  class_type: CharacterClass | null;
  class_changed_at: string | null;
};
export type CharacterClass = "scholar" | "warrior" | "creator" | "leader";
export type ClassConfig = {
  id: CharacterClass; name: string; tagline: string; description: string;
  strengths: string[]; weaknesses: string[]; icon: string; color: string;
  xp_modifiers: Record<string, number>; meta: Record<string, unknown>;
};
export type StatusEffectKind = "burnout" | "flow_state" | "fatigue";
export type StatusEffect = {
  id: string; kind: StatusEffectKind; multiplier: number; difficulty_modifier: number;
  reason: string | null; starts_at: string; expires_at: string; active: boolean;
};
export type ShopItem = {
  id: string; name: string; description: string; category: "boost" | "protection" | "recovery";
  effect_kind: "xp_multiplier" | "streak_shield" | "fatigue_clear" | "streak_freeze" | "recovery_card";
  effect_value: number; duration_min: number | null; cost: number; currency: "coins" | "tokens";
  cooldown_min: number; icon: string; sort_order: number;
};
export type InventoryItem = { id: string; item_id: string; quantity: number; last_used_at: string | null };
export type ActiveEffect = { id: string; item_id: string; effect_kind: string; effect_value: number; expires_at: string | null };
export type Stats = { user_id: string; intelligence: number; strength: number; discipline: number; charisma: number };
export type Streak = { user_id: string; current_streak: number; longest_streak: number; last_active_date: string | null };
export type ActivityType = { id: string; label: string; icon: string; stat: StatKey; xp: number; description: string | null };
export type Activity = {
  id: string;
  user_id: string;
  type_id: string;
  subtype: string | null;
  duration_minutes: number | null;
  activity_date: string;
  xp_gained: number;
  base_xp: number | null;
  difficulty: Difficulty;
  multiplier_breakdown: Record<string, number> | null;
  note: string | null;
  created_at: string;
};
export type Quest = { id: string; user_id: string; title: string; reward_xp: number; is_daily: boolean; completed: boolean; completed_at: string | null; created_at: string };

export type QuestType = "daily" | "weekly" | "epic" | "dynamic";
export type QuestEnergy = "low" | "medium" | "high";
export type QuestStatus = "active" | "locked" | "candidate" | "discarded" | "completed" | "failed" | "paused" | "in_progress";
export type QuestCriteria = { type_id?: string | string[]; min_duration?: number; min_difficulty?: string };

export type QuestRich = Quest & {
  description: string | null;
  quest_type: QuestType;
  difficulty: number;
  linked_stats: string[];
  energy: QuestEnergy;
  criteria: QuestCriteria;
  status: QuestStatus;
  expires_at: string | null;
  template_key: string | null;
  generation_reason: string | null;
  is_compulsory: boolean;
  slot_index: number | null;
  selection_group: string | null;
  duration_minutes: number | null;
  started_at: string | null;
  ends_at: string | null;
  paused_at: string | null;
  pauses_used: number;
  timer_penalty: number;
};

export type QuestProgress = {
  id: string;
  quest_id: string;
  user_id: string;
  current: number;
  target: number;
  unit: "count" | "minutes" | "xp";
};
export type Achievement = { id: string; code: string; title: string; description: string | null; unlocked_at: string };

function usePlayerInternal() {
  const { user } = useAuth();
  // Hydrate from localStorage cache for instant first paint on reload.
  const cacheRead = <T,>(key: string): T | null => {
    if (typeof window === "undefined" || !user) return null;
    try {
      const raw = window.localStorage.getItem(`${key}:${user.id}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
  };
  const cacheWrite = (key: string, value: unknown) => {
    if (typeof window === "undefined" || !user) return;
    try { window.localStorage.setItem(`${key}:${user.id}`, JSON.stringify(value)); } catch { /* ignore */ }
  };

  const [profile, setProfile] = useState<Profile | null>(() => cacheRead<Profile>("player_profile"));
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [activeEffects, setActiveEffects] = useState<ActiveEffect[]>([]);
  const [classCatalog, setClassCatalog] = useState<ClassConfig[]>([]);
  const [statusEffects, setStatusEffects] = useState<StatusEffect[]>([]);
  const [stats, setStats] = useState<Stats | null>(() => cacheRead<Stats>("player_stats"));
  const [streak, setStreak] = useState<Streak | null>(() => cacheRead<Streak>("player_streak"));
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [skillCatalog, setSkillCatalog] = useState<SkillCatalog[]>([]);
  const [skillNodes, setSkillNodes] = useState<SkillNode[]>([]);
  const [questProgress, setQuestProgress] = useState<QuestProgress[]>([]);
  // Start as not-loading if we have cached profile — UI can render immediately.
  const [loading, setLoading] = useState(true);
  const [xpFlash, setXpFlash] = useState<{ amount: number; key: number } | null>(null);
  const [levelUpFlash, setLevelUpFlash] = useState<{ to: number; key: number } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [p, s, sk, at, ac, q, ach, sc, sn, qp, si, inv, eff, cc, se] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("stats").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("streaks").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("activity_types").select("*").order("xp", { ascending: false }),
      supabase.from("activities").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("quests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("achievements").select("*").eq("user_id", user.id).order("unlocked_at", { ascending: false }),
      supabase.from("skill_catalog").select("*").order("sort_order", { ascending: true }),
      supabase.from("skill_nodes").select("skill_id, level").eq("user_id", user.id),
      supabase.from("quest_progress").select("*").eq("user_id", user.id),
      supabase.from("shop_items").select("*").eq("active", true).order("sort_order", { ascending: true }),
      supabase.from("user_inventory").select("id, item_id, quantity, last_used_at").eq("user_id", user.id),
      supabase.from("active_effects").select("id, item_id, effect_kind, effect_value, expires_at").eq("user_id", user.id),
      supabase.from("class_catalog").select("*"),
      supabase.from("user_status_effects").select("*").eq("user_id", user.id).eq("active", true).gt("expires_at", new Date().toISOString()),
    ]);
    const nextProfile = p.data as Profile | null;
    const nextStats = s.data as Stats | null;
    const nextStreak = sk.data as Streak | null;
    setProfile(nextProfile);
    if (nextProfile) cacheWrite("player_profile", nextProfile);
    setShopItems(((si.data ?? []) as unknown as ShopItem[]));
    setInventory(((inv.data ?? []) as unknown as InventoryItem[]));
    setActiveEffects(((eff.data ?? []) as unknown as ActiveEffect[]));
    setClassCatalog(((cc.data ?? []) as unknown as ClassConfig[]));
    setStatusEffects(((se.data ?? []) as unknown as StatusEffect[]));
    setStats(nextStats);
    if (nextStats) cacheWrite("player_stats", nextStats);
    setStreak(nextStreak);
    if (nextStreak) cacheWrite("player_streak", nextStreak);
    setActivityTypes((at.data ?? []) as ActivityType[]);
    setActivities((ac.data ?? []) as unknown as Activity[]);
    setQuests((q.data ?? []) as unknown as Quest[]);
    setAchievements((ach.data ?? []) as Achievement[]);
    setSkillCatalog(((sc.data ?? []) as unknown as SkillCatalog[]));
    setSkillNodes(((sn.data ?? []) as unknown as SkillNode[]));
    setQuestProgress(((qp.data ?? []) as unknown as QuestProgress[]));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const hasCache = !!profile;
    if (!hasCache) setLoading(true);

    // Local-date helpers (user timezone, not server timezone).
    const localDateISO = () => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const localWeekStartISO = () => {
      const d = new Date();
      const dow = d.getDay(); // 0 = Sun
      const diff = (dow + 6) % 7; // Monday-based week start
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    let lastSeenDate = localDateISO();
    let lastSeenWeek = localWeekStartISO();

    const runResets = async (force = false) => {
      const today = localDateISO();
      const week = localWeekStartISO();
      const dailyChanged = force || today !== lastSeenDate;
      const weeklyChanged = force || week !== lastSeenWeek;
      lastSeenDate = today;
      lastSeenWeek = week;
      const locked = missionBoardResetLocks.get(user.id);
      if (locked) return locked;

      const job = (async () => {
        try {
          const [daily, weekly] = await Promise.all([
            supabase.rpc("hard_daily_reset", { p_local_date: today }),
            supabase.rpc("hard_weekly_reset", { p_local_week_start: week }),
          ]);
          if (daily.error) throw daily.error;
          if (weekly.error) throw weekly.error;

          await Promise.allSettled([
            supabase.rpc("expire_active_effects"),
            supabase.rpc("recover_fatigue"),
            supabase.rpc("evaluate_status_effects", { p_user: user.id }),
          ]);
        } catch (error) {
          console.error("Mission board reset failed", error);
          toast.error("Mission board sync failed", { description: "Reload once — the backend repair is now in place." });
        } finally {
          missionBoardResetLocks.delete(user.id);
          await refresh();
        }
      })();

      missionBoardResetLocks.set(user.id, job);
      return job;
    };

    // Initial run on mount/login.
    runResets(true);

    // Poll every 60s — auto-detect midnight crossover in user's local timezone.
    const interval = window.setInterval(() => {
      const today = localDateISO();
      const week = localWeekStartISO();
      if (today !== lastSeenDate || week !== lastSeenWeek) {
        runResets(false);
      }
    }, 60_000);

    // Re-check when tab becomes visible again (laptop sleep / next-morning open).
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        const today = localDateISO();
        const week = localWeekStartISO();
        if (today !== lastSeenDate || week !== lastSeenWeek) runResets(false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refresh]);

  const checkAchievements = useCallback(async (ctx: { level: number; totalActivities: number; streak: number }) => {
    if (!user) return;
    const have = new Set(achievements.map(a => a.code));
    const newly = ACHIEVEMENTS.filter(a => !have.has(a.code) && a.check(ctx));
    if (!newly.length) return;
    const rows = newly.map(a => ({ user_id: user.id, code: a.code, title: a.title, description: a.description }));
    const { error } = await supabase.from("achievements").insert(rows);
    if (!error) {
      newly.forEach(a => toast.success(`🏆 Achievement unlocked: ${a.title}`, { description: a.description }));
    }
  }, [user, achievements]);

  const awardXp = useCallback(async (amount: number, statBoost?: StatKey) => {
    if (!user || !profile || !stats || !streak) return;

    setXpFlash({ amount, key: Date.now() });

    const result = applyXp(profile.level, profile.xp, amount);
    if (result.leveledUp) {
      setLevelUpFlash({ to: result.level, key: Date.now() });
      toast.success(`⚡ LEVEL UP! You reached level ${result.level}`);
    }

    const sUpdate = streakUpdate(streak.current_streak, streak.last_active_date);
    const newLongest = Math.max(streak.longest_streak, sUpdate.current_streak);

    await Promise.all([
      Promise.resolve(
        supabase.from("profiles").update({ level: result.level, xp: result.xp }).eq("user_id", user.id)
      ),
      Promise.resolve(
        supabase.from("streaks").update({
          current_streak: sUpdate.current_streak,
          last_active_date: sUpdate.last_active_date,
          longest_streak: newLongest,
        }).eq("user_id", user.id)
      ),
      statBoost
        ? Promise.resolve(
            supabase
              .from("stats")
              .update({
                intelligence: statBoost === "intelligence" ? stats.intelligence + STAT_GAIN_PER_ACTIVITY : stats.intelligence,
                strength:     statBoost === "strength"     ? stats.strength     + STAT_GAIN_PER_ACTIVITY : stats.strength,
                discipline:   statBoost === "discipline"   ? stats.discipline   + STAT_GAIN_PER_ACTIVITY : stats.discipline,
                charisma:     statBoost === "charisma"     ? stats.charisma     + STAT_GAIN_PER_ACTIVITY : stats.charisma,
              })
              .eq("user_id", user.id)
          )
        : Promise.resolve(null),
    ]);

    setProfile({ ...profile, level: result.level, xp: result.xp });
    setStreak({ ...streak, current_streak: sUpdate.current_streak, last_active_date: sUpdate.last_active_date, longest_streak: newLongest });
    if (statBoost) setStats({ ...stats, [statBoost]: stats[statBoost] + STAT_GAIN_PER_ACTIVITY });

    await checkAchievements({
      level: result.level,
      totalActivities: activities.length + 1,
      streak: sUpdate.current_streak,
    });
  }, [user, profile, stats, streak, activities, checkAchievements]);

  /**
   * Logs a structured activity via the secure `log_activity` RPC.
   * The server validates the user, computes XP from (type, subtype, duration),
   * and rejects duplicates for the same (user, type, subtype, day).
   */
  const logActivity = useCallback(async (
    typeId: string,
    subtype: string,
    duration: number,
    difficulty: Difficulty = "medium",
    note?: string,
  ): Promise<{ ok: boolean; reason?: string }> => {
    if (!user) return { ok: false, reason: "not_authenticated" };
    const t = activityTypes.find(a => a.id === typeId);
    if (!t) return { ok: false, reason: "invalid_activity_type" };

    const { data, error } = await supabase.rpc("log_activity", {
      p_type: typeId,
      p_subtype: subtype,
      p_duration: duration,
      p_note: note ?? null,
      p_difficulty: difficulty,
    });
    if (error) {
      toast.error(error.message);
      return { ok: false, reason: error.message };
    }

    const result = data as {
      ok: boolean;
      reason?: string;
      activity?: Activity;
      xp_gained?: number;
      levels_gained?: number;
      new_level?: number;
      new_xp?: number;
      skill_points_awarded?: number;
      breakdown?: Record<string, number>;
    };
    if (!result.ok) {
      if (result.reason === "already_completed_today") {
        toast.info("Already completed today", {
          description: `You've already logged ${t.label} today. Come back tomorrow!`,
        });
      } else {
        toast.error(result.reason ?? "Could not log activity");
      }
      return { ok: false, reason: result.reason };
    }

    const inserted = result.activity as Activity;
    const xp = result.xp_gained ?? inserted.xp_gained;
    setActivities(prev => [inserted, ...prev]);

    // Server already updated profile/streak/skill_points. Apply locally for instant UI.
    setXpFlash({ amount: xp, key: Date.now() });
    if ((result.levels_gained ?? 0) > 0 && result.new_level) {
      setLevelUpFlash({ to: result.new_level, key: Date.now() });
      toast.success(`⚡ LEVEL UP! Reached level ${result.new_level}`, {
        description: `+${result.skill_points_awarded ?? 0} skill points to spend.`,
      });
    }
    if (profile && result.new_level !== undefined && result.new_xp !== undefined) {
      setProfile({
        ...profile,
        level: result.new_level,
        xp: result.new_xp,
        skill_points: profile.skill_points + (result.skill_points_awarded ?? 0),
      });
    }
    // Stat point bump (the small 1-pt bonus per activity)
    if (stats) {
      const nextStats: Stats = { ...stats, [t.stat]: stats[t.stat] + STAT_GAIN_PER_ACTIVITY };
      setStats(nextStats);
      const patch: Partial<Pick<Stats, StatKey>> = { [t.stat]: nextStats[t.stat] } as Partial<Pick<Stats, StatKey>>;
      await supabase.from("stats").update(patch).eq("user_id", user.id);
    }
    // Refresh streak from server (RPC already updated it)
    const { data: freshStreak } = await supabase
      .from("streaks").select("*").eq("user_id", user.id).maybeSingle();
    if (freshStreak) setStreak(freshStreak as Streak);

    toast.success(`+${xp} XP — ${t.label}`);
    await checkAchievements({
      level: result.new_level ?? profile?.level ?? 1,
      totalActivities: activities.length + 1,
      streak: freshStreak?.current_streak ?? streak?.current_streak ?? 1,
    });
    return { ok: true };
  }, [user, activityTypes, profile, stats, streak, activities, checkAchievements]);

  const upgradeSkill = useCallback(async (skillId: string) => {
    if (!user) return { ok: false };
    const { data, error } = await supabase.rpc("upgrade_skill", { p_skill_id: skillId });
    if (error) { toast.error(error.message); return { ok: false }; }
    const r = data as { ok: boolean; reason?: string; new_level?: number; remaining_points?: number };
    if (!r.ok) {
      const msg =
        r.reason === "parent_locked" ? "Unlock the parent skill first." :
        r.reason === "max_level" ? "This skill is already maxed." :
        r.reason === "insufficient_points" ? "Not enough skill points." :
        r.reason ?? "Could not upgrade.";
      toast.error(msg);
      return { ok: false, reason: r.reason };
    }
    setSkillNodes(prev => {
      const exists = prev.find(n => n.skill_id === skillId);
      if (exists) return prev.map(n => n.skill_id === skillId ? { ...n, level: r.new_level! } : n);
      return [...prev, { skill_id: skillId, level: r.new_level! }];
    });
    if (profile && r.remaining_points !== undefined) {
      setProfile({ ...profile, skill_points: r.remaining_points });
    }
    toast.success(`Skill upgraded → Lv ${r.new_level}`);
    return { ok: true };
  }, [user, profile]);

  const completeQuest = useCallback(async (questId: string) => {
    if (!user) return;
    const q = quests.find(x => x.id === questId);
    if (!q || q.completed) return;
    const { data, error } = await supabase.rpc("complete_quest", { p_quest_id: questId });
    if (error) { toast.error(error.message); return; }
    const r = data as {
      ok: boolean; reason?: string; xp_gained?: number;
      levels_gained?: number; new_level?: number; new_xp?: number; skill_points_awarded?: number;
    };
    if (!r.ok) { toast.info(r.reason ?? "Could not complete quest"); return; }

    setQuests(prev => prev.map(x => x.id === questId
      ? { ...x, completed: true, completed_at: new Date().toISOString(), reward_xp: r.xp_gained ?? x.reward_xp }
      : x));
    setXpFlash({ amount: r.xp_gained ?? 0, key: Date.now() });
    if ((r.levels_gained ?? 0) > 0 && r.new_level) {
      setLevelUpFlash({ to: r.new_level, key: Date.now() });
      toast.success(`⚡ LEVEL UP! Reached level ${r.new_level}`, {
        description: `+${r.skill_points_awarded ?? 0} skill points to spend.`,
      });
    }
    if (profile && r.new_level !== undefined && r.new_xp !== undefined) {
      setProfile({
        ...profile, level: r.new_level, xp: r.new_xp,
        skill_points: profile.skill_points + (r.skill_points_awarded ?? 0),
      });
    }
    toast.success(`Quest complete! +${r.xp_gained ?? 0} XP`);
    await refresh();
  }, [user, quests, profile, refresh]);

  const addQuest = useCallback(async (title: string, reward_xp: number) => {
    if (!user) return;
    const { data, error } = await supabase.from("quests").insert({
      user_id: user.id, title, reward_xp, is_daily: false,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setQuests(prev => [data as Quest, ...prev]);
  }, [user]);

  /**
   * Create a custom quest after the user picks a category (daily/weekly/epic).
   * Server enforces: non-empty title, no duplicates within the same category,
   * weekly cap of 3, epic cap of 1, and assigns difficulty/XP defaults.
   */
  const addCustomQuest = useCallback(async (
    title: string,
    quest_type: "daily" | "weekly" | "epic",
    difficulty = 3,
  ): Promise<{ ok: boolean; reason?: string }> => {
    if (!user) return { ok: false, reason: "not_authenticated" };
    const clean = title.trim();
    if (!clean) { toast.error("Quest title can't be empty."); return { ok: false, reason: "empty_title" }; }
    const { data, error } = await supabase.rpc("add_custom_quest", {
      p_title: clean,
      p_quest_type: quest_type,
      p_difficulty: difficulty,
      p_description: null,
    });
    if (error) { toast.error(error.message); return { ok: false, reason: error.message }; }
    const r = data as { ok: boolean; reason?: string };
    if (!r.ok) {
      const msg =
        r.reason === "duplicate_title" ? "A quest with that title already exists in this category." :
        r.reason === "weekly_full"     ? "Weekly is full — max 3 active missions." :
        r.reason === "epic_full"       ? "You already have an active epic quest." :
        r.reason === "empty_title"     ? "Quest title can't be empty." :
        r.reason === "invalid_category"? "Pick Daily, Weekly, or Epic." :
        r.reason ?? "Could not create quest.";
      toast.error(msg);
      return { ok: false, reason: r.reason };
    }
    toast.success(`Added to ${quest_type}.`);
    await refresh();
    return { ok: true };
  }, [user, refresh]);

  const removeQuest = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("quests").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setQuests(prev => prev.filter(q => q.id !== id));
  }, [user]);

  const updateProfile = useCallback(async (patch: Partial<Pick<Profile, "username" | "avatar_url">>) => {
    if (!user || !profile) return;
    const { error } = await supabase.from("profiles").update(patch).eq("user_id", user.id);
    if (error) { toast.error(error.message); return; }
    setProfile({ ...profile, ...patch });
  }, [user, profile]);

  /** Generate template-driven quests (daily/weekly/epic) via RPC. */
  const generateQuests = useCallback(async (force = false) => {
    if (!user) return { ok: false };
    const { data, error } = await supabase.rpc("generate_quests", { p_force: force });
    if (error) { toast.error(error.message); return { ok: false }; }
    const r = data as { ok: boolean; generated: number; reason?: string };
    if (r.generated === 0) {
      toast.info(r.reason === "enough_active_quests" ? "You already have plenty of quests." : "No new quests right now.");
    } else {
      toast.success(`+${r.generated} new quest${r.generated > 1 ? "s" : ""}`);
    }
    await refresh();
    return { ok: true, generated: r.generated };
  }, [user, refresh]);

  /** Generate AI dynamic quests via the edge function. */
  /** Pick 3 dynamic quest options from the static pool. No AI, no duplicates. */
  const generateDynamicQuests = useCallback(async () => {
    if (!user) return { ok: false };

    // Block titles that are already active/locked anywhere, and previous dynamic candidates we're about to discard.
    const blocked = new Set<string>();
    quests.forEach((q) => {
      const qr = q as unknown as QuestRich;
      if (qr.status === "active" || qr.status === "locked") blocked.add(qr.title.toLowerCase());
    });

    const picks = pickDynamicOptions(blocked, 3);
    if (picks.length === 0) {
      toast.info("No quests available in the pool right now.");
      return { ok: false };
    }

    // Discard previous dynamic candidates so we don't accumulate.
    const prevDynamic = (quests as unknown as QuestRich[]).filter(
      (q) => q.quest_type === "dynamic" && (q.status === "candidate" || q.status === "active"),
    );
    if (prevDynamic.length > 0) {
      const ids = prevDynamic.map((q) => q.id);
      await supabase.from("quest_progress").delete().in("quest_id", ids);
      await supabase.from("quests").update({ status: "discarded" }).in("id", ids);
    }

    const inserts = picks.map((p) => buildQuestRow(user.id, p, { questType: "dynamic", status: "candidate", slotIndex: null }));
    const { data: rows, error } = await supabase.from("quests").insert(inserts).select("id");
    if (error || !rows) { toast.error("Could not generate quests right now."); return { ok: false }; }

    const progressRows = rows.map((r, idx) => buildProgressRow(r.id, user.id, picks[idx]));
    await supabase.from("quest_progress").insert(progressRows);

    toast.success(`+${rows.length} new option${rows.length > 1 ? "s" : ""} from the quest bank`);
    await refresh();
    return { ok: true, generated: rows.length };
  }, [user, quests, refresh]);

  /** Regenerate a single dynamic daily slot (1, 2, or 3). */
  /** Regenerate a single dynamic daily slot from the static pool. */
  const regenerateDailySlot = useCallback(async (slot: number) => {
    if (!user) return { ok: false };
    if (![1, 2, 3].includes(slot)) return { ok: false, reason: "invalid_slot" };

    const all = quests as unknown as QuestRich[];

    // Locked slot? bail out — never replace a locked quest.
    const lockedHere = all.find(
      (q) => q.quest_type === "daily" && !q.is_compulsory && q.slot_index === slot && q.status === "locked",
    );
    if (lockedHere) {
      toast.info("That slot is locked.");
      return { ok: false, reason: "slot_locked" };
    }

    // Block currently-active titles so we never duplicate.
    const blocked = new Set<string>();
    all.forEach((q) => {
      if (q.status === "active" || q.status === "locked") blocked.add(q.title.toLowerCase());
    });

    const pick = pickQuestForSlot(slot, blocked);
    if (!pick) { toast.info("No quests available in the pool."); return { ok: false }; }

    // Replace whatever was in this slot.
    const stale = all.filter(
      (q) => q.quest_type === "daily" && !q.is_compulsory && q.slot_index === slot
        && (q.status === "active" || q.status === "candidate"),
    );
    if (stale.length > 0) {
      const ids = stale.map((q) => q.id);
      await supabase.from("quest_progress").delete().in("quest_id", ids);
      await supabase.from("quests").update({ status: "discarded" }).in("id", ids);
    }

    const row = buildQuestRow(user.id, pick, { questType: "daily", status: "active", slotIndex: slot });
    const { data: questRow, error } = await supabase.from("quests").insert(row).select("id").single();
    if (error || !questRow) { toast.error("Could not regenerate this slot."); return { ok: false }; }

    await supabase.from("quest_progress").insert(buildProgressRow(questRow.id, user.id, pick));
    await refresh();
    return { ok: true };
  }, [user, quests, refresh]);

  /** Regenerate all 3 dynamic daily slots (skipping locked). */
  /** Regenerate every unlocked daily slot from the static pool, balanced by category. */
  const regenerateAllDailySlots = useCallback(async () => {
    if (!user) return { ok: false };
    const all = quests as unknown as QuestRich[];

    const lockedSlots = new Set(
      all
        .filter((q) => q.quest_type === "daily" && !q.is_compulsory && q.status === "locked" && q.slot_index)
        .map((q) => q.slot_index as number),
    );

    const slotsToFill = [1, 2, 3].filter((s) => !lockedSlots.has(s));
    if (slotsToFill.length === 0) { toast.info("All slots are locked."); return { ok: true }; }

    // Discard old quests in those slots first.
    const stale = all.filter(
      (q) => q.quest_type === "daily" && !q.is_compulsory && q.slot_index !== null
        && slotsToFill.includes(q.slot_index) && (q.status === "active" || q.status === "candidate"),
    );
    if (stale.length > 0) {
      const ids = stale.map((q) => q.id);
      await supabase.from("quest_progress").delete().in("quest_id", ids);
      await supabase.from("quests").update({ status: "discarded" }).in("id", ids);
    }

    // Block currently-locked titles + already-picked titles in this cycle.
    const blocked = new Set<string>();
    all.forEach((q) => { if (q.status === "locked") blocked.add(q.title.toLowerCase()); });

    const picks: { slot: number; pick: PoolQuest }[] = [];
    for (const slot of slotsToFill) {
      const pick = pickQuestForSlot(slot, blocked);
      if (!pick) continue;
      blocked.add(pick.title.toLowerCase());
      picks.push({ slot, pick });
    }
    if (picks.length === 0) { toast.info("No quests available in the pool."); return { ok: false }; }

    const rows = picks.map(({ slot, pick }) =>
      buildQuestRow(user.id, pick, { questType: "daily", status: "active", slotIndex: slot }),
    );
    const { data: inserted, error } = await supabase.from("quests").insert(rows).select("id");
    if (error || !inserted) { toast.error("Could not regenerate daily slots."); return { ok: false }; }

    const progress = inserted.map((r, idx) => buildProgressRow(r.id, user.id, picks[idx].pick));
    await supabase.from("quest_progress").insert(progress);

    toast.success("Daily slots refreshed from the quest bank");
    await refresh();
    return { ok: true };
  }, [user, quests, refresh]);

  const lockQuest = useCallback(async (questId: string) => {
    if (!user) return;
    const { error } = await supabase.rpc("lock_quest", { p_quest_id: questId });
    if (error) { toast.error(error.message); return; }
    toast.success("Quest locked");
    await refresh();
  }, [user, refresh]);

  const unlockQuest = useCallback(async (questId: string) => {
    if (!user) return;
    const { error } = await supabase.rpc("unlock_quest", { p_quest_id: questId });
    if (error) { toast.error(error.message); return; }
    toast.success("Quest unlocked");
    await refresh();
  }, [user, refresh]);

  const generateWeeklyOptions = useCallback(async () => {
    if (!user) return { ok: false };
    const { data, error } = await supabase.rpc("generate_weekly_options");
    if (error) { toast.error(error.message); return { ok: false }; }
    const r = data as { ok: boolean; reason?: string };
    if (!r.ok && r.reason === "weekly_already_selected") toast.info("You already have an active weekly mission.");
    else if (r.ok) toast.success("3 weekly options ready — pick one.");
    await refresh();
    return r;
  }, [user, refresh]);

  const generateEpicOptions = useCallback(async () => {
    if (!user) return { ok: false };
    const { data, error } = await supabase.rpc("generate_epic_options");
    if (error) { toast.error(error.message); return { ok: false }; }
    const r = data as { ok: boolean; reason?: string };
    if (!r.ok && r.reason === "epic_already_selected") toast.info("You already have an active epic quest.");
    else if (r.ok) toast.success("3 epic options ready — choose your path.");
    await refresh();
    return r;
  }, [user, refresh]);

  const selectQuestOption = useCallback(async (questId: string) => {
    if (!user) return;
    const { data, error } = await supabase.rpc("select_quest_option", { p_quest_id: questId });
    if (error) { toast.error(error.message); return; }
    const r = data as { ok: boolean; reason?: string };
    if (!r.ok) { toast.info(r.reason ?? "Could not select"); return; }
    toast.success("Mission locked in.");
    await refresh();
  }, [user, refresh]);

  const xpNeeded = useMemo(() => profile ? xpToNext(profile.level) : 100, [profile]);

  // ---- Timer-based quest actions ----
  const activeTimedQuest = useMemo(() => {
    const list = quests as unknown as QuestRich[];
    return list.find(q => q.status === "in_progress" || q.status === "paused") ?? null;
  }, [quests]);

  const startQuest = useCallback(async (questId: string, durationMinutes?: number) => {
    if (!user) return { ok: false };
    const { data, error } = await supabase.rpc("start_quest", {
      p_quest_id: questId,
      p_duration_minutes: durationMinutes ?? null,
    });
    if (error) { toast.error(error.message); return { ok: false }; }
    const r = data as { ok: boolean; reason?: string };
    if (!r.ok) {
      const msg =
        r.reason === "another_quest_active" ? "Finish or abandon your current quest first." :
        r.reason === "not_startable" ? "This quest can't be started right now." :
        r.reason === "invalid_duration" ? "Duration must be 1–240 minutes." :
        r.reason ?? "Could not start quest.";
      toast.error(msg); return r;
    }
    toast.success("Quest started — focus up.");
    await refresh();
    return r;
  }, [user, refresh]);

  const pauseQuest = useCallback(async (questId: string) => {
    if (!user) return { ok: false };
    const { data, error } = await supabase.rpc("pause_quest", { p_quest_id: questId });
    if (error) { toast.error(error.message); return { ok: false }; }
    const r = data as { ok: boolean; reason?: string };
    if (!r.ok) {
      toast.error(r.reason === "pause_limit" ? "Pause limit reached (2)." : (r.reason ?? "Could not pause."));
      return r;
    }
    await refresh();
    return r;
  }, [user, refresh]);

  const resumeQuest = useCallback(async (questId: string) => {
    if (!user) return { ok: false };
    const { data, error } = await supabase.rpc("resume_quest", { p_quest_id: questId });
    if (error) { toast.error(error.message); return { ok: false }; }
    await refresh();
    return data;
  }, [user, refresh]);

  const abandonQuest = useCallback(async (questId: string) => {
    if (!user) return { ok: false };
    const { data, error } = await supabase.rpc("abandon_quest", { p_quest_id: questId });
    if (error) { toast.error(error.message); return { ok: false }; }
    toast.info("Quest abandoned.");
    await refresh();
    return data;
  }, [user, refresh]);

  const selectClass = useCallback(async (cls: CharacterClass, payToSkip = false) => {
    if (!user) return { ok: false };
    const { data, error } = await supabase.rpc("select_character_class", {
      p_class: cls, p_pay_to_skip: payToSkip,
    });
    if (error) { toast.error(error.message); return { ok: false }; }
    const r = data as { ok: boolean; reason?: string; days_remaining?: number; cost?: number; skip_cost?: number };
    if (!r.ok) {
      const msg =
        r.reason === "cooldown" ? `Class change on cooldown — ${r.days_remaining?.toFixed(1)} day(s) left. Pay ${r.skip_cost} coins to bypass.` :
        r.reason === "insufficient_coins" ? `Need ${r.cost} coins to bypass cooldown.` :
        r.reason === "same_class" ? "You are already this class." :
        r.reason ?? "Could not change class.";
      toast.error(msg);
      return r;
    }
    toast.success(`Class set: ${cls.charAt(0).toUpperCase() + cls.slice(1)}`);
    await refresh();
    return r;
  }, [user, refresh]);

  const evaluateStatus = useCallback(async () => {
    if (!user) return { ok: false };
    const { data, error } = await supabase.rpc("evaluate_status_effects", { p_user: user.id });
    if (error) {
      toast.error("Could not re-evaluate status", { description: error.message });
      return { ok: false, reason: error.message };
    }
    await refresh();
    const result = data as { ok?: boolean; applied?: unknown[]; expired?: number } | null;
    const appliedCount = Array.isArray(result?.applied) ? result.applied.length : 0;
    toast.success(appliedCount > 0 ? "Status updated" : "Status is up to date", {
      description: appliedCount > 0
        ? `${appliedCount} status effect${appliedCount === 1 ? "" : "s"} applied.`
        : "No new status effects were needed right now.",
    });
    return result ?? { ok: true };
  }, [user, refresh]);

  const purchaseItem = useCallback(async (itemId: string, qty = 1) => {
    if (!user) return { ok: false };
    const { data, error } = await supabase.rpc("purchase_shop_item", { p_item_id: itemId, p_quantity: qty });
    if (error) { toast.error(error.message); return { ok: false }; }
    const r = data as { ok: boolean; reason?: string; spent?: number; currency?: string };
    if (!r.ok) {
      const msg =
        r.reason === "insufficient_coins" ? "Not enough Coins." :
        r.reason === "insufficient_tokens" ? "Not enough Tokens." :
        r.reason ?? "Could not purchase.";
      toast.error(msg); return r;
    }
    toast.success(`Purchased — ${r.spent} ${r.currency} spent`);
    await refresh();
    return r;
  }, [user, refresh]);

  const useItem = useCallback(async (itemId: string) => {
    if (!user) return { ok: false };
    const { data, error } = await supabase.rpc("use_inventory_item", { p_item_id: itemId });
    if (error) { toast.error(error.message); return { ok: false }; }
    const r = data as { ok: boolean; reason?: string; effect_kind?: string };
    if (!r.ok) {
      const msg =
        r.reason === "no_inventory" ? "You don't own this item." :
        r.reason === "on_cooldown" ? "This item is on cooldown." :
        r.reason ?? "Could not use item.";
      toast.error(msg); return r;
    }
    toast.success("Item activated ✨");
    await refresh();
    return r;
  }, [user, refresh]);

  return {
    loading, profile, stats, streak, activityTypes, activities, quests, achievements,
    skillCatalog, skillNodes,
    questProgress,
    xpNeeded, xpFlash, levelUpFlash,
    shopItems, inventory, activeEffects,
    purchaseItem, useItem,
    classCatalog, statusEffects, selectClass, evaluateStatus,
    refresh, logActivity, completeQuest, addQuest, addCustomQuest, removeQuest, updateProfile, awardXp,
    upgradeSkill, generateQuests, generateDynamicQuests,
    regenerateDailySlot, regenerateAllDailySlots,
    lockQuest, unlockQuest,
    generateWeeklyOptions, generateEpicOptions, selectQuestOption,
    activeTimedQuest, startQuest, pauseQuest, resumeQuest, abandonQuest,
  };
}

// ---------------------------------------------------------------------------
// Global single-source-of-truth provider.
// All screens consume the SAME state via context, so a quest completion on the
// Quests page instantly reflects on Dashboard / Profile / Stats / etc.
// ---------------------------------------------------------------------------
type PlayerContextValue = ReturnType<typeof usePlayerInternal>;
const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const value = usePlayerInternal();
  return createElement(PlayerContext.Provider, { value }, children);
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error("usePlayer must be used inside <PlayerProvider>. Wrap your app (or AppLayout) with <PlayerProvider>.");
  }
  return ctx;
}
