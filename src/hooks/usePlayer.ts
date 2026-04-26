import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { applyXp, ACHIEVEMENTS, STAT_GAIN_PER_ACTIVITY, StatKey, streakUpdate, xpToNext } from "@/lib/rpg";
import { toast } from "sonner";
import type { SkillCatalog, SkillNode, Difficulty } from "@/lib/progression";
import { QUEST_POOL, pickQuestForSlot, pickDynamicOptions, type PoolQuest } from "@/lib/questPool";

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
export type QuestStatus = "active" | "locked" | "candidate" | "discarded" | "completed" | "failed" | "paused";
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
    // Reset daily quests for today, ensure compulsory anchors exist, then load.
    (async () => {
      await supabase.rpc("reset_daily_quests", { p_user: user.id });
      await supabase.rpc("seed_compulsory_quests");
      await refresh();
    })();
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

  return {
    loading, profile, stats, streak, activityTypes, activities, quests, achievements,
    skillCatalog, skillNodes,
    questProgress,
    xpNeeded, xpFlash, levelUpFlash,
    refresh, logActivity, completeQuest, addQuest, addCustomQuest, removeQuest, updateProfile, awardXp,
    upgradeSkill, generateQuests, generateDynamicQuests,
    regenerateDailySlot, regenerateAllDailySlots,
    lockQuest, unlockQuest,
    generateWeeklyOptions, generateEpicOptions, selectQuestOption,
  };
}
