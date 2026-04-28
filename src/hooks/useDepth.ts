import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export type DepthNode = { id: string; label: string; value: number; negative?: boolean };
export type DepthEdge = { from: string; to: string; weight: number; kind: "positive" | "negative"; label: string };
export type DepthRecommendation = { action: string; label: string; reason: string };
export type DepthSnapshot = {
  nodes: DepthNode[];
  edges: DepthEdge[];
  xp_multiplier: number;
  friction: { value: number; expires_at: string | null; streak_state: "stable" | "unstable" | "broken"; comeback_until: string | null };
  insights: string[];
  predictions: string[];
  recommendations: DepthRecommendation[];
  inputs: Record<string, number>;
};
export type DepthEvent = { id: string; kind: string; message: string; delta: Record<string, unknown>; created_at: string };
export type DepthDashboard = {
  snapshot: DepthSnapshot;
  state: { energy: number; burnout: number; consistency: number; friction_multiplier: number; friction_expires_at: string | null; streak_state: string; comeback_until: string | null; computed_at: string };
  events: DepthEvent[];
};

export function useDepth() {
  const { user } = useAuth();
  const [data, setData] = useState<DepthDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: res, error } = await supabase.rpc("get_depth_dashboard" as never);
    setLoading(false);
    if (error) { setError(error.message); return; }
    setData(res as unknown as DepthDashboard);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refresh: load };
}