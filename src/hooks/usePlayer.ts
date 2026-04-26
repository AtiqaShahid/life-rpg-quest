import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { applyXp, ACHIEVEMENTS, STAT_GAIN_PER_ACTIVITY, StatKey, streakUpdate, xpToNext } from "@/lib/rpg";
import { toast } from "sonner";
import type { SkillCatalog, SkillNode, Difficulty } from "@/lib/progression";

export type Profile = { id: string; user_id: string; username: string; avatar_url: string | null; level: number; xp: number; skill_points: number };
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
export type QuestStatus = "active" | "completed" | "failed" | "paused";
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

export function usePlayer() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [skillCatalog, setSkillCatalog] = useState<SkillCatalog[]>([]);
  const [skillNodes, setSkillNodes] = useState<SkillNode[]>([]);
  const [questProgress, setQuestProgress] = useState<QuestProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [xpFlash, setXpFlash] = useState<{ amount: number; key: number } | null>(null);
  const [levelUpFlash, setLevelUpFlash] = useState<{ to: number; key: number } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [p, s, sk, at, ac, q, ach, sc, sn, qp] = await Promise.all([
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
    ]);
    setProfile(p.data as Profile | null);
    setStats(s.data as Stats | null);
    setStreak(sk.data as Streak | null);
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
    setLoading(true);
    // Reset daily quests for today, then load.
    supabase.rpc("reset_daily_quests", { p_user: user.id }).then(refresh);
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
  const generateDynamicQuests = useCallback(async () => {
    if (!user) return { ok: false };
    const { data, error } = await supabase.functions.invoke("generate-dynamic-quests");
    if (error) {
      toast.error("Could not generate AI quests right now.");
      return { ok: false };
    }
    const r = data as { ok?: boolean; generated?: number; error?: string };
    if (r.error === "rate_limited") toast.error("AI rate-limited — try again soon.");
    else if (r.error === "credits_exhausted") toast.error("AI credits exhausted.");
    else if (r.generated && r.generated > 0) toast.success(`+${r.generated} AI quest${r.generated > 1 ? "s" : ""}`);
    else toast.info("No AI quests generated.");
    await refresh();
    return { ok: !!r.ok, generated: r.generated ?? 0 };
  }, [user, refresh]);

  const xpNeeded = useMemo(() => profile ? xpToNext(profile.level) : 100, [profile]);

  return {
    loading, profile, stats, streak, activityTypes, activities, quests, achievements,
    skillCatalog, skillNodes,
    questProgress,
    xpNeeded, xpFlash, levelUpFlash,
    refresh, logActivity, completeQuest, addQuest, removeQuest, updateProfile, awardXp,
    upgradeSkill, generateQuests, generateDynamicQuests,
  };
}
