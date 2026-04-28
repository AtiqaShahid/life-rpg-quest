import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export type LifeScoreBreakdown = {
  discipline: number;
  consistency: number;
  completion: number;
  energy: number;
};

export type LifeScoreSignals = {
  total_activities_14d: number;
  hard_activities_14d: number;
  medium_activities_14d: number;
  easy_activities_14d: number;
  active_days_14d: number;
  max_gap_days: number;
  quests_total_14d: number;
  quests_done_14d: number;
  completion_recent_pct: number;
  completion_prev_pct: number;
  acts_recent_7d: number;
  acts_prev_7d: number;
  xp_recent_7d: number;
  xp_prev_7d: number;
  hour_stddev: number;
  current_streak: number;
  longest_streak: number;
  inactive_days: number;
};

export type LifeScoreSnapshot = {
  life_score: number;
  breakdown: LifeScoreBreakdown;
  signals: LifeScoreSignals;
  trends: string[];
  predictions: string[];
  recommendations: string[];
  daily_series_14d: { date: string; xp: number; count: number }[];
  computed_at: string;
};

export type AnalystReport = {
  summary: string;
  risk_level: "stable" | "watch" | "burnout" | "decline" | "inactive";
  focus_metric: keyof LifeScoreBreakdown;
  predictions: string[];
  recommendations: string[];
};

export function useLifeScore(refreshKey: number | string = 0) {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<LifeScoreSnapshot | null>(null);
  const [report, setReport] = useState<AnalystReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastReportKeyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("get_life_score" as never);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const snap = data as unknown as LifeScoreSnapshot;
    setSnapshot(snap);
    setLoading(false);

    // Only re-ask the AI when meaningful inputs change.
    const k = `${snap.life_score}|${snap.breakdown.discipline}|${snap.breakdown.consistency}|${snap.breakdown.completion}|${snap.breakdown.energy}|${snap.signals.current_streak}|${snap.signals.inactive_days}`;
    if (k === lastReportKeyRef.current) return;
    lastReportKeyRef.current = k;

    setReportLoading(true);
    const { data: rep, error: repErr } = await supabase.functions.invoke("life-score-insights", {
      body: { snapshot: snap },
    });
    setReportLoading(false);
    if (repErr || !rep || (rep as { error?: string }).error) {
      // Fallback to rule-based content from the RPC itself.
      setReport({
        summary:
          snap.signals.total_activities_14d === 0
            ? "No activity logged in the last 14 days — analysis baseline unavailable."
            : `Life Score ${snap.life_score}/100. Weakest component: ${weakest(snap.breakdown)}.`,
        risk_level:
          snap.signals.inactive_days >= 3 ? "inactive" :
          snap.breakdown.discipline >= 60 && snap.breakdown.consistency >= 70 ? "stable" :
          snap.signals.acts_recent_7d < snap.signals.acts_prev_7d ? "decline" : "watch",
        focus_metric: weakest(snap.breakdown),
        predictions: snap.predictions.length ? snap.predictions : ["Not enough signal to forecast — log a few more activities."],
        recommendations: snap.recommendations.length ? snap.recommendations : ["Log one activity today to start a baseline."],
      });
      return;
    }
    setReport(rep as AnalystReport);
  }, [user]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return { snapshot, report, loading, reportLoading, error, refresh: load };
}

function weakest(b: LifeScoreBreakdown): keyof LifeScoreBreakdown {
  const entries = Object.entries(b) as [keyof LifeScoreBreakdown, number][];
  entries.sort((a, z) => a[1] - z[1]);
  return entries[0][0];
}