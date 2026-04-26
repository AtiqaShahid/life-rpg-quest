import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export type BehaviorStatus = "normal" | "warning" | "burnout" | "inactive";

export type PeakHour = { hour: number; avg_xp: number; count: number };
export type ActivityInsight = {
  type_id: string;
  count: number;
  avg_recent: number;
  avg_prev: number;
  trend: "improving" | "steady" | "declining";
  efficiency_score: number;
};
export type BehaviorProfile = {
  computed_at: string;
  status: BehaviorStatus;
  consistency_score: number;
  burnout_score: number;
  inactive_days: number;
  last_active_date: string | null;
  peak_hours: PeakHour[];
  last_7_day_performance: { date: string; xp: number; count: number }[];
  activity_insights: ActivityInsight[];
  recommendation: {
    difficulty: "easy" | "medium" | "hard";
    hour: number | null;
    type_id: string | null;
    recovery_mode: boolean;
  };
  signals: {
    performance_decline_pct: number;
    hard_task_share: number;
    active_days_last_14: number;
  };
};

export type BehaviorFeedback = {
  message: string;
  next_action: string;
  tone: "encourage" | "warn" | "celebrate" | "rest" | "wakeup";
};

/**
 * Pulls the live behavior profile from the DB and asks the AI coach for one
 * contextual feedback message. Re-runs whenever `refreshKey` changes.
 */
export function useBehaviorProfile(refreshKey: number | string = 0) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<BehaviorProfile | null>(null);
  const [feedback, setFeedback] = useState<BehaviorFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFeedbackKeyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("get_behavior_profile");
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const p = data as unknown as BehaviorProfile;
    setProfile(p);
    setLoading(false);

    // Only re-ask the AI when the meaningful signals actually change.
    const key = `${p.status}|${p.consistency_score}|${p.burnout_score}|${p.inactive_days}|${p.recommendation.difficulty}|${p.recommendation.hour ?? "-"}`;
    if (key === lastFeedbackKeyRef.current) return;
    lastFeedbackKeyRef.current = key;

    setFeedbackLoading(true);
    const { data: fb, error: fbErr } = await supabase.functions.invoke("behavior-feedback", {
      body: { profile: p },
    });
    setFeedbackLoading(false);
    if (fbErr) {
      setFeedback({
        message: fallbackMessage(p),
        next_action: fallbackAction(p),
        tone: p.status === "burnout" ? "rest" : p.status === "inactive" ? "wakeup" : "encourage",
      });
      return;
    }
    if (fb && (fb as BehaviorFeedback).message) {
      setFeedback(fb as BehaviorFeedback);
    }
  }, [user]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return { profile, feedback, loading, feedbackLoading, error, refresh: load };
}

function fallbackMessage(p: BehaviorProfile): string {
  if (p.status === "burnout") return "Performance is dipping. Take a rest day to reset.";
  if (p.status === "inactive") return `${p.inactive_days} days inactive — start small to rebuild momentum.`;
  if (p.consistency_score >= 80) return "You're remarkably consistent. Try ramping difficulty up.";
  if (p.consistency_score < 40) return "Consistency is low. Stack a few easy wins this week.";
  return "Steady run. Keep stacking activities.";
}
function fallbackAction(p: BehaviorProfile): string {
  if (p.recommendation.recovery_mode) return "Log one easy activity today.";
  if (p.recommendation.hour !== null) return `Schedule a ${p.recommendation.difficulty} task around ${formatHour(p.recommendation.hour)}.`;
  return `Try a ${p.recommendation.difficulty} difficulty next.`;
}

export function formatHour(h: number): string {
  const am = h < 12;
  const hr = ((h + 11) % 12) + 1;
  return `${hr} ${am ? "AM" : "PM"}`;
}