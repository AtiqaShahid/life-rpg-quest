import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { applyXp, ACHIEVEMENTS, STAT_GAIN_PER_ACTIVITY, StatKey, streakUpdate, xpToNext } from "@/lib/rpg";
import { toast } from "sonner";

export type Profile = { id: string; user_id: string; username: string; avatar_url: string | null; level: number; xp: number };
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
  note: string | null;
  created_at: string;
};
export type Quest = { id: string; user_id: string; title: string; reward_xp: number; is_daily: boolean; completed: boolean; completed_at: string | null; created_at: string };
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
  const [loading, setLoading] = useState(true);
  const [xpFlash, setXpFlash] = useState<{ amount: number; key: number } | null>(null);
  const [levelUpFlash, setLevelUpFlash] = useState<{ to: number; key: number } | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [p, s, sk, at, ac, q, ach] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("stats").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("streaks").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("activity_types").select("*").order("xp", { ascending: false }),
      supabase.from("activities").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("quests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("achievements").select("*").eq("user_id", user.id).order("unlocked_at", { ascending: false }),
    ]);
    setProfile(p.data as Profile | null);
    setStats(s.data as Stats | null);
    setStreak(sk.data as Streak | null);
    setActivityTypes((at.data ?? []) as ActivityType[]);
    setActivities((ac.data ?? []) as Activity[]);
    setQuests((q.data ?? []) as Quest[]);
    setAchievements((ach.data ?? []) as Achievement[]);
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
    });
    if (error) {
      toast.error(error.message);
      return { ok: false, reason: error.message };
    }

    const result = data as { ok: boolean; reason?: string; activity?: Activity; xp_gained?: number };
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
    await awardXp(xp, t.stat);
    toast.success(`+${xp} XP — ${t.label}`);
    return { ok: true };
  }, [user, activityTypes, awardXp]);

  const completeQuest = useCallback(async (questId: string) => {
    if (!user) return;
    const q = quests.find(x => x.id === questId);
    if (!q || q.completed) return;
    const { error } = await supabase.from("quests").update({
      completed: true, completed_at: new Date().toISOString(),
    }).eq("id", questId);
    if (error) { toast.error(error.message); return; }
    setQuests(prev => prev.map(x => x.id === questId ? { ...x, completed: true, completed_at: new Date().toISOString() } : x));
    await awardXp(q.reward_xp);
    toast.success(`Quest complete! +${q.reward_xp} XP`);
  }, [user, quests, awardXp]);

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

  const xpNeeded = useMemo(() => profile ? xpToNext(profile.level) : 100, [profile]);

  return {
    loading, profile, stats, streak, activityTypes, activities, quests, achievements,
    xpNeeded, xpFlash, levelUpFlash,
    refresh, logActivity, completeQuest, addQuest, removeQuest, updateProfile, awardXp,
  };
}
